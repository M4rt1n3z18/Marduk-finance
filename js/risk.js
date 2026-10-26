// ══════════════ RISK ══════════════
// Portfolio → Risk. How much the portfolio you hold *today* moves, and what
// drives it. Volatility, drawdown and beta come from a backtest of the current
// holdings over the last one or three years of prices, in euros — the usual way
// to describe a portfolio's risk, and independent of when you happened to buy.
// Concentration and currency exposure need no prices at all.
//
// Deliberately absent: Sharpe ratio and Value-at-Risk. Sharpe needs a
// risk-free-rate assumption and years of history to mean anything; VaR implies
// a precision that a year of prices can't support.
//
// The figures describe; they don't advise. Notes state facts ("one holding is
// 31% of the portfolio"), never what to do about them.

const RISK_RANGES = {
  '1Y': { interval: '1d',  range: '1y', perYear: 252, unit: 'day',  label: '12 months of daily prices' },
  '3Y': { interval: '1wk', range: '3y', perYear: 52,  unit: 'week', label: '3 years of weekly prices' },
};
let riskRange = '1Y';
let _riskFetchId = 0;
let _riskCache = null;   // { key, at, hist } — see buildRiskView()

const _isCryptoTicker = t => /-(USD|EUR|GBP)$/.test(t);

// ── Pure maths (no DOM) ──────────────────────────────────────────────────────
const _mean = a => a.reduce((s, v) => s + v, 0) / a.length;
function _cov(a, b) {
  const ma = _mean(a), mb = _mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1);
}
const _stdev = a => Math.sqrt(_cov(a, a));
const _returns = v => v.slice(1).map((x, i) => x / v[i] - 1);

// { key: [[iso, value], …] sorted } on a shared date grid, carrying the last
// known value forward over another market's holiday; null before a series starts.
function riskAlign(seriesMap, gridKeys) {
  const keys = gridKeys && gridKeys.length ? gridKeys : Object.keys(seriesMap);
  const dates = [...new Set(keys.flatMap(k => (seriesMap[k] || []).map(p => p[0])))].sort();
  const cols = {};
  for (const [k, s] of Object.entries(seriesMap)) {
    const out = new Array(dates.length).fill(null);
    let j = 0, last = null;
    for (let i = 0; i < dates.length; i++) {
      while (j < s.length && s[j][0] <= dates[i]) { last = s[j][1]; j++; }
      out[i] = last;
    }
    cols[k] = out;
  }
  return { dates, cols };
}

// Largest fall from a running high to a later low
function riskMaxDrawdown(values, dates) {
  let peak = values[0], peakAt = 0, worst = 0, from = 0, to = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > peak) { peak = values[i]; peakAt = i; }
    const dd = values[i] / peak - 1;
    if (dd < worst) { worst = dd; from = peakAt; to = i; }
  }
  return { dd: worst, from: dates[from], to: dates[to] };
}

// Backtest of `holdings` (current share counts) over `hist` (fetch-history
// output). Returns null when there isn't enough overlapping history.
function computeRisk(holdings, hist, benchTicker, perYear) {
  const iso = ts => new Date(ts * 1000).toISOString().slice(0, 10);
  const series = {};
  const add = (key, d) => {
    if (!d?.timestamps?.length) return;
    const pts = d.timestamps.map((t, i) => [iso(t), d.closes[i]]).filter(p => p[1] != null);
    if (pts.length) series[key] = pts;
  };
  const withData = holdings.filter(h => h.shares > 0 && hist[h.ticker]);
  withData.forEach(h => add(h.ticker, hist[h.ticker]));
  add('EURUSD=X', hist['EURUSD=X']);
  if (benchTicker) add('__bench', hist[benchTicker]);

  // Exchange days set the calendar; crypto trades every day and would add
  // weekend points where every stock shows a fake 0% return.
  const stockKeys = withData.filter(h => !_isCryptoTicker(h.ticker) && series[h.ticker]).map(h => h.ticker);
  const { dates, cols } = riskAlign(series, stockKeys.length ? stockKeys : withData.map(h => h.ticker));
  if (dates.length < 25) return null;

  // A holding whose history starts well inside the window (a recent listing)
  // is left out rather than shortening everyone's window to its age.
  const firstIdx = k => cols[k] ? cols[k].findIndex(v => v != null) : -1;
  const included = withData.filter(h => { const f = firstIdx(h.ticker); return f >= 0 && f <= dates.length * 0.1; });
  const excluded = holdings.filter(h => h.shares > 0 && !included.includes(h));
  if (!included.length) return null;
  const start = Math.max(...included.map(h => firstIdx(h.ticker)), cols.__bench ? Math.max(0, firstIdx('__bench')) : 0);

  const fxAt = i => cols['EURUSD=X']?.[i] || null;
  const eurCol = h => cols[h.ticker].slice(start).map((c, j) => h.shares * histCloseToEur(c, hist[h.ticker].currency, fxAt(start + j)));
  const valueCols = included.map(eurCol);
  const V = valueCols[0].map((_, i) => valueCols.reduce((s, col) => s + col[i], 0));
  const d = dates.slice(start);
  if (V.length < 25) return null;

  const rp = _returns(V);
  const ann = Math.sqrt(perYear);
  const varP = _cov(rp, rp);

  let bench = null, rb = null;
  if (cols.__bench && firstIdx('__bench') >= 0) {
    const bv = cols.__bench.slice(start).map((c, j) => histCloseToEur(c, hist[benchTicker].currency, fxAt(start + j)));
    if (bv.every(v => v > 0)) {
      rb = _returns(bv);
      const varB = _cov(rb, rb);
      bench = {
        beta: varB > 0 ? _cov(rp, rb) / varB : null,
        corr: varB > 0 && varP > 0 ? _cov(rp, rb) / Math.sqrt(varB * varP) : null,
        ret: bv[bv.length - 1] / bv[0] - 1,
        vol: Math.sqrt(varB) * ann,
      };
    }
  }

  const total = V[V.length - 1];
  const rows = included.map((h, k) => {
    const ri = _returns(valueCols[k]);
    return {
      ticker: h.ticker,
      weight: valueCols[k][valueCols[k].length - 1] / total,
      vol: _stdev(ri) * ann,
      beta: rb && _cov(rb, rb) > 0 ? _cov(ri, rb) / _cov(rb, rb) : null,
      rc: varP > 0 ? (valueCols[k][valueCols[k].length - 1] / total) * _cov(ri, rp) / varP : 0,
    };
  });
  // Contributions add up to ~100% by construction; normalise the rounding drift
  const rcSum = rows.reduce((s, r) => s + r.rc, 0) || 1;
  rows.forEach(r => { r.rc /= rcSum; });
  rows.sort((a, b) => b.rc - a.rc);

  const worstIdx = rp.indexOf(Math.min(...rp));
  return {
    vol: Math.sqrt(varP) * ann,
    dd: riskMaxDrawdown(V, d),
    worst: { ret: rp[worstIdx], date: d[worstIdx + 1] },
    ret: V[V.length - 1] / V[0] - 1,
    bench, rows, excluded: excluded.map(h => h.ticker),
    from: d[0], to: d[d.length - 1], points: rp.length,
  };
}

// No prices needed: how concentrated the portfolio is right now
function riskConcentration(holdings) {
  const vals = holdings.map(h => ({ h, v: (h.currentPrice || h.buyPrice) * h.shares })).filter(x => x.v > 0);
  const total = vals.reduce((s, x) => s + x.v, 0);
  if (!total) return null;
  vals.sort((a, b) => b.v - a.v);
  const w = vals.map(x => x.v / total);
  const sectors = {};
  for (const { h, v } of vals) {
    const s = h.sector || SECTOR_DB[h.ticker] || (guessAssetClass(h.ticker) === 'ETF/Fund' ? 'ETF / Index' : 'Unknown');
    sectors[s] = (sectors[s] || 0) + v;
  }
  const topSector = Object.entries(sectors).sort((a, b) => b[1] - a[1])[0];
  return {
    count: vals.length,
    largest: { ticker: vals[0].h.ticker, w: w[0] },
    top5: w.slice(0, 5).reduce((s, x) => s + x, 0),
    effN: 1 / w.reduce((s, x) => s + x * x, 0),
    sector: { name: topSector[0], w: topSector[1] / total },
  };
}

// Currency each position actually moves with: its trading currency, not the
// currency you paid in — a US stock bought with euros is still a dollar asset.
function riskCurrencyExposure(holdings, cashEntries) {
  const by = {};
  for (const h of holdings) {
    const v = (h.currentPrice || h.buyPrice) * h.shares;
    if (!(v > 0)) continue;
    let c = h.priceCurrency || (typeof hiSuffixCcy === 'function' ? hiSuffixCcy(h.ticker) : null) || 'Unknown';
    if (c === 'GBp') c = 'GBP';
    by[c] = (by[c] || 0) + v;
  }
  for (const e of (cashEntries || [])) {
    const v = nativeToEur(e.amount, e.currency);
    if (v > 0) by[e.currency] = (by[e.currency] || 0) + v;
  }
  const total = Object.values(by).reduce((s, v) => s + v, 0);
  return Object.entries(by).map(([ccy, v]) => ({ ccy, v, w: total ? v / total : 0 })).sort((a, b) => b.v - a.v);
}

// ── View ─────────────────────────────────────────────────────────────────────
function setRiskRange(r, btn) {
  riskRange = r;
  document.querySelectorAll('#risk-ranges .range-btn').forEach(b => b.classList.toggle('active', b === btn));
  buildRiskView();
}

const _pctR = (v, d = 1) => (v * 100).toFixed(d) + '%';
const _riskDate = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const _riskBar = (w, color = 'var(--gold)') =>
  `<span class="risk-track"><span class="risk-fill" style="width:${Math.max(0, Math.min(100, w * 100)).toFixed(1)}%;background:${color};"></span></span>`;

function _riskSet(id, text, sub) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
  if (sub != null) { const s = document.getElementById(id + '-sub'); if (s) s.textContent = sub; }
}

async function buildRiskView() {
  const root = document.getElementById('psub-portfolio-risk');
  if (!root || !root.offsetParent) return;
  const port = ap();
  const holdings = (port.holdings || []).filter(h => h.shares > 0);
  const empty = document.getElementById('risk-empty');
  const body = document.getElementById('risk-body');
  if (!holdings.length) { empty.style.display = ''; body.style.display = 'none'; return; }
  empty.style.display = 'none'; body.style.display = '';

  // ── Instant: concentration + currencies ────────────────────────────────────
  const conc = riskConcentration(holdings);
  if (conc) {
    _riskSet('risk-effn', conc.effN.toFixed(1), `from ${conc.count} holding${conc.count !== 1 ? 's' : ''} · largest ${_pctR(conc.largest.w, 0)}`);
    const notes = [];
    if (conc.largest.w > 0.2) notes.push(`${conc.largest.ticker} alone is ${_pctR(conc.largest.w, 0)} of the portfolio.`);
    if (conc.sector.w > 0.4 && conc.sector.name !== 'Unknown') notes.push(`${_pctR(conc.sector.w, 0)} sits in one sector (${conc.sector.name}).`);
    document.getElementById('risk-conc').innerHTML = `
      <div class="risk-row"><span class="risk-name">Largest position <span class="muted">· ${esc(conc.largest.ticker)}</span></span>${_riskBar(conc.largest.w)}<span class="risk-pct">${_pctR(conc.largest.w)}</span></div>
      <div class="risk-row"><span class="risk-name">Top ${Math.min(5, conc.count)} positions</span>${_riskBar(conc.top5)}<span class="risk-pct">${_pctR(conc.top5)}</span></div>
      <div class="risk-row"><span class="risk-name">Largest sector <span class="muted">· ${esc(conc.sector.name)}</span></span>${_riskBar(conc.sector.w)}<span class="risk-pct">${_pctR(conc.sector.w)}</span></div>
      ${notes.length ? `<div class="risk-note">${notes.map(esc).join(' ')}</div>` : ''}`;
  }
  const ccys = riskCurrencyExposure(holdings, port.cashEntries);
  const nonEur = ccys.filter(c => c.ccy !== 'EUR').reduce((s, c) => s + c.w, 0);
  document.getElementById('risk-ccy').innerHTML = ccys.map(c => `
    <div class="risk-row"><span class="risk-name">${esc(c.ccy)}</span>${_riskBar(c.w, c.ccy === 'EUR' ? 'var(--up)' : '#4c8aaf')}<span class="risk-pct">${_pctR(c.w)}</span><span class="risk-amt">${eurPort(c.v)}</span></div>`).join('') +
    (nonEur > 0 ? `<div class="risk-note">${_pctR(nonEur, 0)} of the portfolio moves with exchange rates as well as prices.</div>` : '');

  // ── Backtest: needs price history ──────────────────────────────────────────
  const cfg = RISK_RANGES[riskRange];
  const benchTicker = selectedBenchmarkTicker || 'SPY';
  const benchName   = selectedBenchmarkTicker ? selectedBenchmarkName : 'S&P 500';
  document.getElementById('risk-beta-label').textContent = `Beta vs ${benchName}`;
  const table = document.getElementById('risk-table');

  // This view re-renders with the rest of the portfolio (every price refresh,
  // every save), so history is kept for 15 minutes instead of being fetched —
  // and flashing "Loading" — each time.
  const tickers = [...new Set([...holdings.map(h => h.ticker), 'EURUSD=X', benchTicker])].sort();
  const key = `${riskRange}|${tickers.join(',')}`;
  let hist;
  if (_riskCache && _riskCache.key === key && Date.now() - _riskCache.at < 15 * 60 * 1000) {
    hist = _riskCache.hist;
  } else {
    ['risk-vol', 'risk-dd', 'risk-beta'].forEach(id => _riskSet(id, '…', 'loading prices'));
    table.innerHTML = '<div class="muted" style="font-size:12px;padding:10px 0;">Loading price history…</div>';
    const id = ++_riskFetchId;
    try {
      hist = await window.electronAPI?.fetchHistory?.({ tickers, interval: cfg.interval, range: cfg.range }) || {};
    } catch (e) { hist = {}; }
    if (id !== _riskFetchId) return;   // range or holdings changed while loading
    if (Object.keys(hist).length > 1) _riskCache = { key, at: Date.now(), hist };
  }

  const r = computeRisk(holdings, hist, benchTicker, cfg.perYear);
  if (!r) {
    ['risk-vol', 'risk-dd', 'risk-beta'].forEach(x => _riskSet(x, '–', 'not enough price history'));
    table.innerHTML = '<div class="muted" style="font-size:12px;padding:10px 0;">Couldn’t load enough price history. Yahoo may be busy. Try again in a few minutes.</div>';
    return;
  }

  _riskSet('risk-vol', _pctR(r.vol), `per year${r.bench ? ` · ${benchName} ${_pctR(r.bench.vol, 0)}` : ''}`);
  _riskSet('risk-dd', _pctR(r.dd.dd), r.dd.dd < 0 ? `${_riskDate(r.dd.from)} → ${_riskDate(r.dd.to)}` : 'no fall in this period');
  _riskSet('risk-beta', r.bench?.beta != null ? r.bench.beta.toFixed(2) : '–',
    r.bench?.corr != null ? `correlation ${r.bench.corr.toFixed(2)}` : 'benchmark unavailable');
  document.getElementById('risk-dd').className = 'stat-val ' + (r.dd.dd < -0.0001 ? 'down-text' : '');

  table.innerHTML = `<table class="data-table">
      <thead><tr><th>Holding</th><th style="text-align:right;">Weight</th><th style="text-align:right;">Volatility</th>
        <th style="text-align:right;">Beta</th><th>Share of portfolio risk</th></tr></thead>
      <tbody>${r.rows.map(x => `<tr>
        <td style="font-weight:700;color:var(--gold);">${esc(x.ticker)}</td>
        <td style="text-align:right;">${_pctR(x.weight)}</td>
        <td style="text-align:right;">${_pctR(x.vol)}</td>
        <td style="text-align:right;">${x.beta != null ? x.beta.toFixed(2) : '–'}</td>
        <td><div style="display:flex;align-items:center;gap:10px;">${_riskBar(Math.max(0, x.rc), x.rc > x.weight * 1.25 ? 'var(--down)' : 'var(--gold)')}<span style="min-width:48px;text-align:right;font-weight:600;">${_pctR(x.rc)}</span></div></td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="risk-foot">
      Today’s holdings over ${cfg.label} (${_riskDate(r.from)} – ${_riskDate(r.to)}), valued in euros: they returned
      <strong class="${r.ret >= 0 ? 'up-text' : 'down-text'}">${r.ret >= 0 ? '+' : ''}${_pctR(r.ret)}</strong>${r.bench ? ` vs ${benchName} ${r.bench.ret >= 0 ? '+' : ''}${_pctR(r.bench.ret)}` : ''},
      worst ${cfg.unit} ${_pctR(r.worst.ret)} (${_riskDate(r.worst.date)}).
      Red bars mark holdings that add more risk than their weight.
      ${r.excluded.length ? `Not included (too little price history): ${r.excluded.map(esc).join(', ')}.` : ''}
      Past movements, not a forecast.
    </div>`;
}
