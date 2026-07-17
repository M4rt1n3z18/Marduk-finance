// ══════════════ TRUE RETURNS & AUTOMATIC DIVIDEND LOG ══════════════
// Business logic for:
//  1. Automatic received-dividends detection (Yahoo events × shares held at date)
//  2. XIRR (money-weighted annualized return) from dated cashflows
//  3. Year-by-year returns (Modified Dietz on reconstructed valuations)

// ── Shares held on a given date (from the transaction history) ───────────────
function sharesHeldAt(port, ticker, dateStr) {
  let shares = 0;
  for (const t of (port.transactions || [])) {
    if (t.ticker !== ticker || !t.date || t.date > dateStr) continue;
    shares += t.type === 'Sell' ? -t.shares : t.shares;
  }
  return Math.max(0, parseFloat(shares.toFixed(6)));
}

function _divToEur(amount, currency) {
  if (!currency || currency === 'EUR') return amount;
  const rate = FX_RATES[currency];
  return rate ? amount / rate : amount;
}

// ── 1. Automatic received-dividends log ──────────────────────────────────────
// For every dividend event Yahoo recorded, if the user held shares on that
// date, a log entry is created: { id, portfolioId, ticker, date, perShare,
// shares, amountEur, currency, detectedAt }. Runs at most every 6 hours
// (or forced when opening the Dividends section).
let _divSyncRunning = false;
let _divSyncLastRun = 0;
const DIV_SYNC_COOLDOWN = 6 * 60 * 60 * 1000;

async function syncDividendLog(force = false) {
  if (!window.electronAPI?.fetchDividendHistory || _divSyncRunning) return false;
  if (!force && Date.now() - _divSyncLastRun < DIV_SYNC_COOLDOWN) return false;
  const ports = (state.portfolios || []).filter(p => (p.transactions || []).length);
  if (!ports.length) return false;
  _divSyncRunning = true;
  _divSyncLastRun = Date.now();
  let changed = false;

  try {
    const allTickers = [...new Set(ports.flatMap(p => (p.transactions || []).map(t => t.ticker)))];
    const history = await window.electronAPI.fetchDividendHistory(allTickers);
    if (!history || !Object.keys(history).length) { _divSyncRunning = false; return false; }

    if (!state.dividendLog) state.dividendLog = [];
    const existing = new Set(state.dividendLog.map(d => `${d.portfolioId}|${d.ticker}|${d.date}`));
    const today = new Date().toISOString().slice(0, 10);

    for (const port of ports) {
      const tickers = [...new Set((port.transactions || []).map(t => t.ticker))];
      for (const ticker of tickers) {
        const info = history[ticker];
        if (!info?.events?.length) continue;
        for (const ev of info.events) {
          if (ev.date > today) continue;
          const key = `${port.id}|${ticker}|${ev.date}`;
          if (existing.has(key)) continue;
          const shares = sharesHeldAt(port, ticker, ev.date);
          if (shares <= 0) continue;
          const amountEur = parseFloat((_divToEur(ev.amount, info.currency) * shares).toFixed(2));
          if (amountEur <= 0) continue;
          state.dividendLog.push({
            id: uid(), portfolioId: port.id, ticker,
            date: ev.date,
            perShare: ev.amount, shares,
            amountEur, currency: info.currency,
            detectedAt: new Date().toISOString(),
          });
          existing.add(key);
          changed = true;
        }
      }
      // Keep holding.dividends (feeds Total Gain) in sync with the log
      for (const h of (port.holdings || [])) {
        const total = parseFloat(state.dividendLog
          .filter(d => d.portfolioId === port.id && d.ticker === h.ticker)
          .reduce((s, d) => s + d.amountEur, 0).toFixed(2));
        if ((h.dividends || 0) !== total) { h.dividends = total; changed = true; }
      }
    }
    if (changed) save();
  } catch (e) { console.error('syncDividendLog error:', e); }
  _divSyncRunning = false;
  return changed;
}

// ── Received Dividends card (Dividends sub-view) ─────────────────────────────
function renderReceivedDividends() {
  const card = document.getElementById('div-received-card');
  if (!card) return;
  const port = ap();
  const log = (state.dividendLog || [])
    .filter(d => d.portfolioId === port.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!log.length) { card.style.display = 'none'; return; }
  card.style.display = '';

  const thisYear = new Date().getFullYear().toString();
  const total = log.reduce((s, d) => s + d.amountEur, 0);
  const yearTotal = log.filter(d => d.date.startsWith(thisYear)).reduce((s, d) => s + d.amountEur, 0);
  const last = log[0];

  document.getElementById('divr-total').textContent = eur(total);
  document.getElementById('divr-year').textContent = eur(yearTotal);
  document.getElementById('divr-last').textContent = eur(last.amountEur);
  document.getElementById('divr-last-sub').textContent = `${last.ticker} · ${last.date}`;

  // Cumulative passive-income chart (by month)
  const byMonth = {};
  [...log].sort((a, b) => a.date.localeCompare(b.date))
    .forEach(d => { const k = d.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + d.amountEur; });
  const months = Object.keys(byMonth).sort();
  let running = 0;
  const cumulative = months.map(m => parseFloat((running += byMonth[m]).toFixed(2)));

  destroyChart('div-received');
  const el = document.getElementById('chart-div-received');
  if (el && el.offsetParent && months.length) {
    charts['div-received'] = new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'Cumulative dividends',
          data: cumulative,
          borderColor: '#4caf82', backgroundColor: 'rgba(76,175,130,0.15)',
          fill: true, tension: 0.25, pointRadius: months.length > 24 ? 0 : 3,
          pointBackgroundColor: '#4caf82', borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => ' ' + eur(c.raw) + ' received so far' } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor(), font: { size: 10 }, maxTicksLimit: 10 } },
          y: { grid: { color: gridColor() }, ticks: { color: textColor(), callback: v => eur(v, 0) }, beginAtZero: true },
        },
      },
    });
  }

  // Recent payments table (latest 12)
  document.getElementById('divr-table').innerHTML = `<table class="data-table">
    <thead><tr><th>Date</th><th>Holding</th><th>Per Share</th><th>Shares Held</th><th>Received</th></tr></thead>
    <tbody>
      ${log.slice(0, 12).map(d => `<tr>
        <td class="muted">${d.date}</td>
        <td style="font-weight:600;color:var(--gold);">${d.ticker}</td>
        <td class="muted">${d.currency !== 'EUR' ? (CURRENCY_SYMBOLS[d.currency] || d.currency + ' ') : '€'}${d.perShare.toFixed(4)}</td>
        <td class="muted">${fmtShares(d.shares)}</td>
        <td style="font-weight:600;color:var(--up);">${eur(d.amountEur)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  ${log.length > 12 ? `<div style="font-size:11px;color:var(--text3);text-align:center;padding:8px 0 0;">Showing 12 of ${log.length} payments</div>` : ''}`;
}

// ── 2. XIRR (money-weighted annualized return) ───────────────────────────────
// Cashflows: buys negative, sells positive, received dividends positive,
// plus the current holdings market value as a final positive flow today.
function _xirr(flows) {
  if (flows.length < 2) return null;
  const t0 = flows[0].t;
  const yrs = f => (f.t - t0) / (365.25 * 86400000);
  const npv = r => flows.reduce((s, f) => s + f.amt / Math.pow(1 + r, yrs(f)), 0);
  // Bisection: robust for any monotonic-enough NPV curve
  let lo = -0.9999, hi = 10;
  let fLo = npv(lo), fHi = npv(hi);
  if (isNaN(fLo) || isNaN(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

function _portCashflows(port) {
  const flows = [];
  for (const t of (port.transactions || [])) {
    if (!t.date || !t.shares || !t.price) continue;
    const amt = parseFloat((t.shares * t.price).toFixed(2));
    flows.push({ t: new Date(t.date + 'T12:00:00Z').getTime(), amt: t.type === 'Sell' ? amt : -amt });
  }
  for (const d of (state.dividendLog || []).filter(d => d.portfolioId === port.id)) {
    flows.push({ t: new Date(d.date + 'T12:00:00Z').getTime(), amt: d.amountEur });
  }
  return flows.sort((a, b) => a.t - b.t);
}

// ── 3. Year-by-year returns (Modified Dietz on reconstructed valuations) ─────
async function _yearlyReturns(port) {
  const tickers = [...new Set((port.transactions || []).map(t => t.ticker))];
  if (!tickers.length || !window.electronAPI?.fetchHistory) return [];

  let hist = {};
  try {
    hist = await window.electronAPI.fetchHistory({
      tickers: [...tickers, 'EURUSD=X'], interval: '1mo', range: 'max',
    });
  } catch (e) { return []; }

  const fxTl = (hist['EURUSD=X']?.timestamps || [])
    .map((t, i) => ({ t, c: hist['EURUSD=X'].closes[i] })).filter(x => x.c != null);
  const tls = {};
  for (const tk of tickers) {
    const d = hist[tk];
    if (!d?.timestamps) continue;
    tls[tk] = {
      currency: d.currency,
      tl: d.timestamps.map((t, i) => ({ t, c: d.closes[i] })).filter(x => x.c != null),
    };
  }

  // Portfolio value (EUR) on a date, using shares actually held then
  const valueAt = dateStr => {
    const ts = Math.floor(new Date(dateStr + 'T12:00:00Z').getTime() / 1000);
    let total = 0, any = false;
    for (const tk of tickers) {
      const shares = sharesHeldAt(port, tk, dateStr);
      if (shares <= 0 || !tls[tk]) continue;
      const close = nearestClose(tls[tk].tl, ts);
      if (close == null) continue;
      const eurUsd = nearestClose(fxTl, ts) || 1.08;
      total += shares * (tls[tk].currency === 'USD' ? close / eurUsd : close);
      any = true;
    }
    return any ? total : 0;
  };

  const firstTx = (port.transactions || []).map(t => t.date).filter(Boolean).sort()[0];
  if (!firstTx) return [];
  const firstYear = parseInt(firstTx.slice(0, 4));
  const nowYear = new Date().getFullYear();
  const liveValue = (port.holdings || []).reduce((s, h) => s + (h.currentPrice || h.buyPrice) * h.shares, 0);

  const rows = [];
  for (let y = firstYear; y <= nowYear; y++) {
    const start = `${y}-01-01`;
    const end = y === nowYear ? new Date().toISOString().slice(0, 10) : `${y}-12-31`;
    const V0 = y === firstYear ? 0 : valueAt(start);
    const V1 = y === nowYear ? liveValue : valueAt(end);

    // Flows within the year: contributions (+) = buys, withdrawals (−) = sells
    const startT = new Date(start + 'T00:00:00Z').getTime();
    const endT = new Date(end + 'T23:59:59Z').getTime();
    const span = endT - startT;
    let net = 0, weighted = 0;
    for (const t of (port.transactions || [])) {
      if (!t.date || t.date < start || t.date > end || !t.shares || !t.price) continue;
      const amt = t.shares * t.price * (t.type === 'Sell' ? -1 : 1);
      const w = (endT - new Date(t.date + 'T12:00:00Z').getTime()) / span;
      net += amt; weighted += amt * w;
    }
    const divs = (state.dividendLog || [])
      .filter(d => d.portfolioId === port.id && d.date >= start && d.date <= end)
      .reduce((s, d) => s + d.amountEur, 0);

    const denom = V0 + weighted;
    if (denom < 1 || (V0 === 0 && net === 0)) continue; // no meaningful base that year
    const r = (V1 - V0 - net + divs) / denom * 100;
    if (!isFinite(r)) continue;
    rows.push({ year: y, ret: r, ytd: y === nowYear });
  }
  return rows;
}

// ── True Returns card (Portfolio Overview sub-view) ──────────────────────────
let _returnsBuilding = false;

async function buildReturnsCard() {
  const card = document.getElementById('returns-card');
  if (!card || _returnsBuilding) return;
  const port = ap();
  const flows = _portCashflows(port);
  const hasBuys = flows.some(f => f.amt < 0);
  const liveValue = (port.holdings || []).reduce((s, h) => s + (h.currentPrice || h.buyPrice) * h.shares, 0);

  // Need real history: at least one buy and 90+ days of track record
  const spanDays = flows.length ? (Date.now() - flows[0].t) / 86400000 : 0;
  if (!hasBuys || (liveValue <= 0 && !flows.some(f => f.amt > 0)) || spanDays < 90) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  _returnsBuilding = true;

  // XIRR — instant, no network needed
  const allFlows = [...flows, { t: Date.now(), amt: liveValue }];
  const x = _xirr(allFlows);
  const xirrEl = document.getElementById('ret-xirr');
  if (xirrEl) {
    if (x === null) { xirrEl.textContent = '—'; }
    else {
      const pctVal = x * 100;
      xirrEl.textContent = (pctVal >= 0 ? '+' : '') + pctVal.toFixed(2) + '%';
      xirrEl.className = 'stat-val ' + (pctVal >= 0 ? 'up-text' : 'down-text');
    }
  }
  const totIn = Math.abs(flows.filter(f => f.amt < 0).reduce((s, f) => s + f.amt, 0));
  const totDivs = (state.dividendLog || []).filter(d => d.portfolioId === port.id)
    .reduce((s, d) => s + d.amountEur, 0);
  const subEl = document.getElementById('ret-xirr-sub');
  if (subEl) subEl.textContent = `on ${eur(totIn, 0)} invested over ${(spanDays / 365.25).toFixed(1)}y${totDivs > 0 ? ` · incl. ${eur(totDivs, 0)} dividends` : ''}`;

  // Yearly table — async (needs Yahoo monthly history, cached 15 min)
  const tableEl = document.getElementById('ret-years');
  if (tableEl) {
    tableEl.innerHTML = '<div class="muted" style="font-size:12px;padding:6px 0;">Computing yearly returns…</div>';
    try {
      const rows = await _yearlyReturns(port);
      if (!rows.length) {
        tableEl.innerHTML = '<div class="muted" style="font-size:12px;padding:6px 0;">Not enough history for yearly returns yet.</div>';
      } else {
        tableEl.innerHTML = rows.map(r => `
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--border);">
            <span style="font-weight:600;min-width:64px;">${r.year}${r.ytd ? ' <span style="font-size:10px;color:var(--text3);">YTD</span>' : ''}</span>
            <div style="flex:1;height:7px;background:var(--bg4);border-radius:4px;overflow:hidden;position:relative;">
              <div style="height:100%;width:${Math.min(Math.abs(r.ret), 60) / 60 * 100}%;background:${r.ret >= 0 ? 'var(--up)' : 'var(--down)'};border-radius:4px;"></div>
            </div>
            <span style="font-weight:700;min-width:76px;text-align:right;color:${r.ret >= 0 ? 'var(--up)' : 'var(--down)'};">${(r.ret >= 0 ? '+' : '')}${r.ret.toFixed(1)}%</span>
          </div>`).join('');
      }
    } catch (e) {
      tableEl.innerHTML = '<div class="muted" style="font-size:12px;padding:6px 0;">Could not compute yearly returns.</div>';
    }
  }
  _returnsBuilding = false;
}
