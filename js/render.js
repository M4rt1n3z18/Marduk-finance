// ══════════════ COMPANY DETAIL MODAL ══════════════

function closeCompanyModal(e) {
  // Close if clicking the backdrop itself (not the modal panel)
  if (e && e.target !== document.getElementById('company-modal-overlay')) return;
  document.getElementById('company-modal-overlay').classList.remove('open');
}

function _closeCompanyModal() {
  document.getElementById('company-modal-overlay').classList.remove('open');
}

// ── Renderer-side company info cache (avoids re-fetching same stock) ──────────
const _modalCache     = new Map(); // ticker → info object
const _MODAL_CACHE_MS = 30 * 60 * 1000; // 30 min (main process also caches 1 h)

let _modalPriceChart = null; // keep Chart.js instance to destroy on next open

async function openCompanyModal(ticker) {
  const overlay = document.getElementById('company-modal-overlay');
  const content = document.getElementById('company-modal-content');

  // Show spinner immediately
  content.innerHTML = `<div class="cmod-loading">
    <div class="cmod-spinner"></div>
    <div>Loading ${ticker}…</div>
  </div>`;
  overlay.classList.add('open');

  // Destroy any previous chart instance before replacing innerHTML
  if (_modalPriceChart) { try { _modalPriceChart.destroy(); } catch(e) {} _modalPriceChart = null; }

  // Find local holding for context
  const holding = (ap().holdings || []).find(h => h.ticker === ticker) || {};

  // ── Fetch company info + price history IN PARALLEL ────────────────────────
  // Cache avoids re-hitting the network when the same stock is re-opened.
  let info = null;
  const cached = _modalCache.get(ticker);
  if (cached && Date.now() - cached.ts < _MODAL_CACHE_MS) {
    info = cached.data;
  }

  const historyPromise = window.electronAPI?.fetchHistory
    ? window.electronAPI.fetchHistory({ tickers: [ticker], interval: '1d', range: '1y' })
    : Promise.resolve(null);

  if (!info && window.electronAPI?.fetchCompanyInfo) {
    try {
      info = await window.electronAPI.fetchCompanyInfo(ticker);
      if (info) _modalCache.set(ticker, { data: info, ts: Date.now() });
    } catch(e) {}
  }

  if (!info) {
    // Fallback: show what we know locally
    info = {
      ticker, shortName: ticker, longName: ticker,
      sector: holding.sector || null, industry: null, description: null,
      currentPrice: holding.currentPrice || null,
      dps: holding.dividendPerShare || 0,
      exDivDate: holding.exDivDate || null,
      nextPayDate: holding.nextPayDate || null,
      nextEarningsDate: holding.nextEarningsDate || null,
      earningsDateEnd: holding.earningsDateEnd || null,
    };
  }

  // Merge cached holding-level data for things the API may not return
  if (!info.nextEarningsDate && holding.nextEarningsDate) info.nextEarningsDate = holding.nextEarningsDate;
  if (!info.exDivDate  && holding.exDivDate)             info.exDivDate  = holding.exDivDate;
  if (!info.nextPayDate && holding.nextPayDate)           info.nextPayDate = holding.nextPayDate;

  const fmtN = (n, decimals=2) => n != null ? n.toFixed(decimals) : '—';
  const fmtPct = n => n != null ? (n * 100).toFixed(2) + '%' : '—';
  const fmtBig = n => {
    if (n == null) return '—';
    if (n >= 1e12) return (n/1e12).toFixed(2) + 'T';
    if (n >= 1e9)  return (n/1e9).toFixed(2)  + 'B';
    if (n >= 1e6)  return (n/1e6).toFixed(2)  + 'M';
    return n.toLocaleString();
  };
  const fmtDate = d => {
    if (!d) return '—';
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  };
  const fmtRec = r => {
    if (!r) return '—';
    const cls = r.toLowerCase().replace(/\s+/g,'_');
    return `<span class="cmod-rec ${cls}">${r.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())}</span>`;
  };

  // Logo
  const initial = ticker[0].toUpperCase();
  const bg = (function(){
    const COLORS = ['#4c8aaf','#c9a84c','#4caf82','#9b87f5','#e0965c','#5ccce0','#e05c5c','#a0d060','#c050f0','#f7931a'];
    let h = 0; for (let i=0;i<ticker.length;i++) h = ticker.charCodeAt(i)+((h<<5)-h);
    return COLORS[Math.abs(h) % COLORS.length];
  })();
  const logoHtml = `
    <img class="cmod-logo" src="https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png"
      alt="${ticker}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">
    <div class="cmod-logo-fb" style="background:${bg};display:none;">${initial}</div>`;

  // Badges
  const badges = [info.sector, info.industry, info.exchange].filter(Boolean)
    .map(b => `<span class="cmod-badge">${b}</span>`).join('');

  // Price header: price + day change
  const priceCur   = info.currency || 'USD';
  const priceLabel = priceCur !== 'EUR' ? priceCur : '€';
  const dayChg     = holding.dayChangePct;
  const dayChgHtml = dayChg != null
    ? `<span style="font-size:14px;font-weight:600;color:${dayChg>=0?'var(--up)':'var(--down)'};">
        ${dayChg>=0?'+':''}${dayChg.toFixed(2)}% today</span>`
    : '';
  const priceHeaderHtml = info.currentPrice != null ? `
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:2px;">
      <span style="font-size:28px;font-weight:700;color:var(--text);">${info.currentPrice.toFixed(2)}</span>
      <span style="font-size:13px;color:var(--text3);">${priceLabel}</span>
      ${dayChgHtml}
    </div>` : '';

  // Market data grid
  const statsGrid = [
    { label: 'Market Cap',     val: info.marketCapFmt || fmtBig(info.marketCap), sub: '' },
    { label: 'P/E (trailing)', val: fmtN(info.trailingPE), sub: info.forwardPE ? `Fwd: ${fmtN(info.forwardPE)}` : '' },
    { label: 'EPS (trailing)', val: fmtN(info.eps), sub: info.forwardEps != null ? `Fwd: ${fmtN(info.forwardEps)}` : '' },
    { label: 'Beta',           val: fmtN(info.beta),   sub: '' },
    { label: '52-Week High',   val: fmtN(info.fiftyTwoWeekHigh), sub: '' },
    { label: '52-Week Low',    val: fmtN(info.fiftyTwoWeekLow),  sub: '' },
    { label: '50-Day Avg',     val: fmtN(info.fiftyDayAvg),      sub: '' },
    { label: '200-Day Avg',    val: fmtN(info.twoHundredDayAvg), sub: info.bookValue != null ? `P/B: ${fmtN(info.priceToBook)}` : '' },
  ].map(s => `
    <div class="cmod-stat">
      <div class="cmod-stat-label">${s.label}</div>
      <div class="cmod-stat-val">${s.val}</div>
      ${s.sub ? `<div class="cmod-stat-sub">${s.sub}</div>` : ''}
    </div>`).join('');

  // Dividends
  const hasDividend = (info.dps || 0) > 0;
  const divFields = [
    ['Annual Div/Share', hasDividend ? `${fmtN(info.dps)}/sh` : '—'],
    ['Dividend Yield',   hasDividend ? fmtPct(info.dividendYield) : '—'],
    ['Forward Yield',    hasDividend ? fmtPct(info.forwardYield)  : '—'],
    ['Payout Ratio',     hasDividend ? fmtPct(info.payoutRatio)   : '—'],
    ['Ex-Dividend Date', fmtDate(info.exDivDate)],
    ['Next Pay Date',    fmtDate(info.nextPayDate)],
  ].map(([l,v]) => `<div class="cmod-field">
    <span class="cmod-field-label">${l}</span><span class="cmod-field-val">${v}</span>
  </div>`).join('');

  // Earnings
  let earningsHtml;
  if (info.nextEarningsDate) {
    const endPart = info.earningsDateEnd ? ` – ${fmtDate(info.earningsDateEnd)}` : '';
    earningsHtml = `<div class="cmod-earnings-date">
      <div class="cmod-earnings-dot"></div>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">Next Earnings</div>
        <div style="font-size:12px;color:var(--text2);">${fmtDate(info.nextEarningsDate)}${endPart}</div>
      </div>
    </div>`;
  } else {
    earningsHtml = `<div style="font-size:12px;color:var(--text3);padding:8px 0;">No upcoming earnings date available.</div>`;
  }

  // Analyst
  const analystHtml = info.targetPrice != null ? `
    <div class="cmod-field"><span class="cmod-field-label">Analyst Target</span>
      <span class="cmod-field-val">${fmtN(info.targetPrice)} <span style="color:var(--text3);font-size:11px;">(${fmtN(info.targetLow)}–${fmtN(info.targetHigh)})</span></span></div>
    <div class="cmod-field"><span class="cmod-field-label">Recommendation</span>
      <span class="cmod-field-val">${fmtRec(info.recommendation)}</span></div>
    <div class="cmod-field"><span class="cmod-field-label">Coverage</span>
      <span class="cmod-field-val">${info.numberOfAnalysts != null ? info.numberOfAnalysts + ' analysts' : '—'}</span></div>`
    : `<div style="font-size:12px;color:var(--text3);padding:8px 0;">No analyst data available.</div>`;

  // Position
  const myShares  = holding.shares || 0;
  const myAvg     = holding.buyPrice || 0;
  const myCost    = myShares * myAvg;
  const myVal     = myShares * (info.currentPrice || holding.currentPrice || myAvg);
  const myGain    = myVal - myCost;
  const myGainPct = myCost ? myGain / myCost * 100 : 0;
  const posHtml   = myShares > 0 ? `
    <div class="cmod-panel">
      <div class="cmod-section-title">Your Position</div>
      <div class="cmod-field"><span class="cmod-field-label">Shares</span><span class="cmod-field-val">${myShares}</span></div>
      <div class="cmod-field"><span class="cmod-field-label">Avg Cost</span><span class="cmod-field-val">€${myAvg.toFixed(2)}/sh</span></div>
      <div class="cmod-field"><span class="cmod-field-label">Total Cost</span><span class="cmod-field-val">€${myCost.toFixed(2)}</span></div>
      <div class="cmod-field"><span class="cmod-field-label">Market Value</span><span class="cmod-field-val">€${myVal.toFixed(2)}</span></div>
      <div class="cmod-field"><span class="cmod-field-label">Total Return</span>
        <span class="cmod-field-val" style="color:${myGain>=0?'var(--up)':'var(--down)'};">
          ${myGain>=0?'+':''}€${myGain.toFixed(2)} (${myGainPct.toFixed(2)}%)
        </span></div>
      ${(info.dps||0)>0 ? `<div class="cmod-field"><span class="cmod-field-label">Annual Dividends</span><span class="cmod-field-val up-text">€${((info.dps||0)*myShares).toFixed(2)}</span></div>` : ''}
    </div>` : '';

  // Description / About
  const descHtml = info.description ? `
    <div class="cmod-panel">
      <div class="cmod-section-title">About</div>
      <div class="cmod-desc" id="cmod-desc-text" onclick="this.classList.toggle('expanded')" title="Click to expand">${info.description}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px;">
        ${info.employees ? info.employees.toLocaleString() + ' employees · ' : ''}
        ${info.website ? `<a href="#" onclick="event.preventDefault()" style="color:var(--gold-dim);">${info.website.replace(/^https?:\/\//,'')}</a>` : ''}
      </div>
    </div>` : '';

  // ── Render modal HTML ──────────────────────────────────────────────────────
  content.innerHTML = `
    <div class="cmod-header">
      ${logoHtml}
      <div style="flex:1;min-width:0;">
        <div class="cmod-ticker">${ticker}</div>
        <div class="cmod-name">${info.longName && info.longName !== ticker ? info.longName : ''}</div>
        <div class="cmod-badges">${badges}</div>
      </div>
      <button class="cmod-close" onclick="_closeCompanyModal()" title="Close">✕</button>
    </div>
    <div class="cmod-body">
      ${priceHeaderHtml}

      <!-- Price history chart placeholder -->
      <div class="cmod-panel" style="padding:12px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="cmod-section-title" style="margin:0;">Price History (1Y)</div>
        </div>
        <div style="position:relative;height:140px;">
          <canvas id="cmod-price-chart"></canvas>
          <div id="cmod-chart-loader" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text3);">Loading chart…</div>
        </div>
      </div>

      <div class="cmod-section-title">Market Data</div>
      <div class="cmod-stats-grid">${statsGrid}</div>

      <div class="cmod-two-col">
        <div class="cmod-panel">
          <div class="cmod-section-title">Dividends</div>
          ${divFields}
        </div>
        <div class="cmod-panel">
          <div class="cmod-section-title">Earnings Calendar</div>
          ${earningsHtml}
          <div style="margin-top:12px;">
            <div class="cmod-section-title" style="margin-bottom:8px;">Analyst Consensus</div>
            ${analystHtml}
          </div>
        </div>
      </div>

      ${posHtml}
      ${descHtml}
    </div>`;

  // ── Draw price chart once history resolves ─────────────────────────────────
  historyPromise.then(histData => {
    const loader = document.getElementById('cmod-chart-loader');
    const canvas = document.getElementById('cmod-price-chart');
    if (!canvas) return; // modal was closed before history arrived

    const series = histData?.[ticker];
    if (!series?.timestamps?.length) {
      if (loader) loader.textContent = 'No price history available.';
      return;
    }
    if (loader) loader.style.display = 'none';

    const labels = series.timestamps.map(ts =>
      new Date(ts * 1000).toLocaleDateString('en-GB', { month:'short', year:'2-digit' })
    );
    const prices = series.closes;
    const isUp   = prices[prices.length - 1] >= prices[0];
    const color  = isUp ? '#4caf82' : '#e05c5c';

    if (_modalPriceChart) { try { _modalPriceChart.destroy(); } catch(e) {} }
    _modalPriceChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: prices,
          borderColor: color,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
          backgroundColor: ctx => {
            const g = ctx.chart.ctx.createLinearGradient(0,0,0,140);
            g.addColorStop(0, color + '33');
            g.addColorStop(1, color + '00');
            return g;
          },
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: {
              label: ctx => ` ${series.currency || ''} ${ctx.parsed.y.toFixed(2)}`,
              title: ctx => ctx[0].label,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: textColor(), font: { size: 10 },
              maxTicksLimit: 8, maxRotation: 0,
            },
            grid: { display: false },
          },
          y: {
            position: 'right',
            ticks: { color: textColor(), font: { size: 10 } },
            grid: { color: gridColor() },
          },
        },
      },
    });
  }).catch(() => {
    const loader = document.getElementById('cmod-chart-loader');
    if (loader) loader.textContent = 'Chart unavailable.';
  });
}

// ── Multi-currency cash ───────────────────────────────────────────────────────
function getCashEntries() {
  const port = ap();
  // Migration: if old single-number cash exists and no cashEntries, convert
  if (!port.cashEntries) {
    port.cashEntries = port.cash > 0 ? [{ currency: portCurrency(), amount: port.cash }] : [];
  }
  return port.cashEntries;
}

function getCashTotalEur() {
  return getCashEntries().reduce((s, e) => s + (e.amount / (FX_RATES[e.currency] || 1)), 0);
}

function renderCashTable() {
  const wrap = document.getElementById('cash-table-wrap');
  if (!wrap) return;
  const entries = getCashEntries();
  const totalEur = getCashTotalEur();
  // Keep legacy `ap().cash` in sync for stats calculations
  ap().cash = totalEur;

  if (!entries.length) {
    wrap.innerHTML = '<p class="muted" style="font-size:12px;padding:4px 0;">No cash recorded. Click "Add Cash" to add uninvested funds.</p>';
    return;
  }
  const sym = CURRENCY_SYMBOLS;
  wrap.innerHTML = `<table class="cash-multi-table">
    <thead><tr><th>Currency</th><th>Amount</th><th>Rate (vs EUR)</th><th>EUR Equivalent</th><th></th></tr></thead>
    <tbody>
      ${entries.map((e, i) => {
        const rate = FX_RATES[e.currency] || 1;
        const eurEq = e.amount / rate;
        return `<tr>
          <td style="font-weight:600;color:var(--gold);">${sym[e.currency] || ''} ${e.currency}</td>
          <td>${(sym[e.currency]||'')}${e.amount.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
          <td class="muted">${e.currency === 'EUR' ? '—' : rate.toFixed(4)}</td>
          <td style="font-weight:600;">${eur(eurEq)}</td>
          <td><button class="del-btn" onclick="removeCashEntry(${i})" title="Remove">✕</button></td>
        </tr>`;
      }).join('')}
    </tbody>
    <tfoot><tr class="total-row">
      <td colspan="3" style="color:var(--text2);font-size:12px;">Total Cash</td>
      <td style="font-weight:700;font-size:14px;text-align:right;">${eur(totalEur)}</td>
      <td></td>
    </tr></tfoot>
  </table>`;
}

function showAddCashForm() {
  const form = document.getElementById('cash-add-form');
  if (form) { form.style.display = 'flex'; document.getElementById('cash-add-amount').focus(); }
}

function hideAddCashForm() {
  const form = document.getElementById('cash-add-form');
  if (form) { form.style.display = 'none'; document.getElementById('cash-add-amount').value = ''; }
}

function saveCashEntry() {
  const currency = document.getElementById('cash-add-currency').value;
  const amount   = parseFloat(document.getElementById('cash-add-amount').value);
  if (!currency || isNaN(amount) || amount <= 0) return;
  const port = ap();
  if (!port.cashEntries) port.cashEntries = [];
  // If same currency exists, add to it
  const existing = port.cashEntries.find(e => e.currency === currency);
  if (existing) existing.amount += amount;
  else port.cashEntries.push({ currency, amount });
  port.cash = getCashTotalEur();
  hideAddCashForm();
  save(); renderCashTable(); renderPortfolio();
}

function removeCashEntry(idx) {
  const port = ap();
  if (!port.cashEntries) return;
  port.cashEntries.splice(idx, 1);
  port.cash = getCashTotalEur();
  save(); renderCashTable(); renderPortfolio();
}

// ── Transaction pagination ───────────────────────────────────────────────────
let txPage = 0;
const TX_PER_PAGE = 12;

function txChangePage(dir) {
  const total = (ap().transactions || []).length;
  const pages = Math.ceil(total / TX_PER_PAGE);
  txPage = Math.max(0, Math.min(txPage + dir, pages - 1));
  renderTransactions();
}

let selectedExpenseMonth = null; // "YYYY-MM"
let expensePage = 0;
const EXPENSES_PER_PAGE = 15;

function secondToLastBusinessDay(year, month) {
  // Find last day of month, walk back skipping weekends
  let day = new Date(year, month + 1, 0); // last day
  let businessDays = 0;
  while (businessDays < 2) {
    const dow = day.getDay();
    if (dow !== 0 && dow !== 6) businessDays++;
    if (businessDays < 2) day.setDate(day.getDate() - 1);
  }
  return day;
}

function getExpenseMonthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// Returns true if expense belongs to the given budget month, respecting paycheckDay.
// When paycheckDay is set (e.g. 26): the budget month covers from day 26 of prev calendar
// month through day 25 of this calendar month. Expenses on/after paycheckDay in the
// previous calendar month count for this budget month; expenses on/after paycheckDay in
// this calendar month count for the NEXT budget month.
function expenseBelongsToMonth(expense, budgetMonthKey) {
  if (!expense.date) return false;
  const pd = state.paycheckDay;
  if (!pd) return expense.date.startsWith(budgetMonthKey);
  const [by, bm] = budgetMonthKey.split('-').map(Number);
  const ed = new Date(expense.date + 'T00:00:00');
  const ey = ed.getFullYear(), em = ed.getMonth() + 1, eday = ed.getDate();
  const prevM = bm === 1 ? 12 : bm - 1;
  const prevY = bm === 1 ? by - 1 : by;
  // Expense in previous calendar month, on/after paycheckDay → this budget month
  if (ey === prevY && em === prevM && eday >= pd) return true;
  // Expense in this calendar month, before paycheckDay → this budget month
  if (ey === by && em === bm && eday < pd) return true;
  return false;
}

function buildMonthSelector() {
  const sel = document.getElementById('e-month-sel');
  // Collect all months that have expenses or salaries, plus last 12 months
  const keys = new Set();
  const today = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    keys.add(getExpenseMonthKey(d.getFullYear(), d.getMonth()));
  }
  state.expenses.forEach(e => { if (e.date) keys.add(e.date.slice(0,7)); });
  (state.salaries || []).forEach(s => { if (s.month) keys.add(s.month); });

  const sorted = [...keys].sort().reverse();
  sel.innerHTML = sorted.map(k => {
    const [y, m] = k.split('-');
    const label = new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return `<option value="${k}" ${k === selectedExpenseMonth ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

function onMonthChange() {
  selectedExpenseMonth = document.getElementById('e-month-sel').value;
  expensePage = 0;
  document.querySelectorAll('#expense-filters .chip').forEach(x => x.classList.remove('active'));
  const allChip = document.querySelector('#expense-filters .chip');
  if (allChip) allChip.classList.add('active');
  renderExpenses();
}

function goToCurrentMonth() {
  selectedExpenseMonth = getExpenseMonthKey(now.getFullYear(), now.getMonth());
  expensePage = 0;
  buildMonthSelector();
  renderExpenses();
}

function setPaycheckDay(val) {
  const n = parseInt(val);
  state.paycheckDay = (!val || isNaN(n) || n < 1 || n > 31) ? null : n;
  save(); renderExpenses(); renderBudget();
  buildSavRateChart(); buildIncomeHistoryChart();
}

let selectedBudgetMonth = null;

function onBudgetMonthChange() {
  selectedBudgetMonth = document.getElementById('bud-month-sel').value;
  renderBudget();
}

function logSalary() {
  const amount = parseFloat(document.getElementById('e-sal-amount').value);
  const date = getDateRaw('e-sal-date');
  if (isNaN(amount) || amount <= 0 || !date) return;

  // Salary received on the 2nd-to-last business day of month X is the budget for month X+1
  // So we attribute it to the NEXT month
  const receivedDate = new Date(date);
  const nextMonth = new Date(receivedDate.getFullYear(), receivedDate.getMonth() + 1, 1);
  const month = getExpenseMonthKey(nextMonth.getFullYear(), nextMonth.getMonth());

  if (!state.salaries) state.salaries = [];
  const idx = state.salaries.findIndex(s => s.month === month);
  if (idx >= 0) state.salaries[idx] = { month, amount, date, receivedDate: date };
  else state.salaries.push({ month, amount, date, receivedDate: date });
  document.getElementById('e-sal-amount').value = '';
  save(); renderBudget(); renderExpenses();
}

function clearSalary() {
  if (!confirm('Remove the salary entry for this month?')) return;
  const key = selectedBudgetMonth || getExpenseMonthKey(now.getFullYear(), now.getMonth());
  state.salaries = state.salaries.filter(s => s.month !== key);
  save(); renderBudget(); renderExpenses();
}

function logExtra() {
  const desc = document.getElementById('e-extra-desc').value.trim();
  const amount = parseFloat(document.getElementById('e-extra-amount').value);
  const date = getDateRaw('e-extra-date');
  if (!desc || isNaN(amount) || amount <= 0 || !date) return;
  const month = date.slice(0, 7);
  if (!state.extraIncomes) state.extraIncomes = [];
  state.extraIncomes.push({ id: uid(), desc, amount, date, month });
  document.getElementById('e-extra-desc').value = '';
  document.getElementById('e-extra-amount').value = '';
  save(); renderBudget(); renderExpenses();
}

function delExtra(id) {
  state.extraIncomes = (state.extraIncomes || []).filter(x => x.id !== id);
  save(); renderBudget(); renderExpenses();
}

function buildExpCatChart(expenses) {
  const el = document.getElementById('chart-exp-cat');
  if (!el || !el.offsetParent) return;
  destroyChart('exp-cat');
  const allData = CATS.map(c => expenses.filter(e => e.cat === c).reduce((s, e) => s + Number(e.amount), 0));
  const filtLabels = CATS.filter((_,i) => allData[i] > 0);
  const filtData = allData.filter(v => v > 0);
  const filtColors = CAT_COLORS.filter((_,i) => allData[i] > 0);
  if (!filtData.length) return;
  charts['exp-cat'] = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: { labels: filtLabels, datasets: [{ data: filtData, backgroundColor: filtColors, borderWidth: 2, borderColor: isDark() ? '#13131a' : '#ede7d9' }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'right', labels: { color: textColor(), font: { size: 11 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: c => ' ' + eur(c.raw) } } } }
  });
}

function buildExpDailyChart(expenses, year, month) {
  const el = document.getElementById('chart-exp-daily');
  if (!el || !el.offsetParent) return;
  destroyChart('exp-daily');
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const data = labels.map(d => {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return expenses.filter(e => e.date === dateStr).reduce((s, e) => s + Number(e.amount), 0);
  });
  charts['exp-daily'] = new Chart(el.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: data.map(v => v > 0 ? 'rgba(201,168,76,0.7)' : 'rgba(201,168,76,0.1)'), borderRadius: 3, borderSkipped: false }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + eur(c.raw) } } },
      scales: { x: { grid: { display: false }, ticks: { color: textColor(), font: { size: 10 }, maxTicksLimit: 10 } },
        y: { grid: { color: gridColor() }, ticks: { color: textColor(), callback: v => eur(v, 0) } } } }
  });
}

function renderExpenses() {
  // Init selected month
  if (!selectedExpenseMonth) selectedExpenseMonth = getExpenseMonthKey(now.getFullYear(), now.getMonth());
  buildMonthSelector();

  const [y, m] = selectedExpenseMonth.split('-').map(Number);
  const year = y, month = m - 1;

  // Filter expenses for selected month (respects paycheckDay if set)
  const monthExpenses = state.expenses.filter(e => expenseBelongsToMonth(e, selectedExpenseMonth));

  // Salary for this month
  if (!state.salaries) state.salaries = [];
  if (!state.extraIncomes) state.extraIncomes = [];
  const salaryEntry = state.salaries.find(s => s.month === selectedExpenseMonth);
  const salaryAmt = salaryEntry ? salaryEntry.amount : 0;
  const extraEntries = state.extraIncomes.filter(x => x.month === selectedExpenseMonth);
  const extraAmt = extraEntries.reduce((s, x) => s + Number(x.amount), 0);
  const totalIncome = salaryAmt + extraAmt;

  // Salary day calculation
  const salDay = secondToLastBusinessDay(year, month);
  const salDayStr = salDay.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // Stats — investment allocations reduce the remaining budget (but are NOT expenses)
  const totalSpent = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const allocMonth = typeof allocationTotalForMonth === 'function' ? allocationTotalForMonth(selectedExpenseMonth) : 0;
  const remaining = totalIncome - totalSpent - allocMonth;
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  document.getElementById('e-period-sub').textContent = monthLabel;
  document.getElementById('e-stat-salary').textContent = eur(salaryAmt);
  document.getElementById('e-stat-salary-sub').textContent = salaryEntry
    ? `received ${salaryEntry.receivedDate || salaryEntry.date}`
    : 'not logged yet';
  document.getElementById('e-stat-extra').textContent = eur(extraAmt);
  document.getElementById('e-stat-extra-sub').textContent = extraEntries.length + ' entr' + (extraEntries.length === 1 ? 'y' : 'ies');
  document.getElementById('e-stat-spent').textContent = eur(totalSpent);
  document.getElementById('e-stat-count').textContent = monthExpenses.length + ' transaction' + (monthExpenses.length === 1 ? '' : 's');
  document.getElementById('e-stat-remaining').textContent = eur(remaining);
  document.getElementById('e-stat-remaining').className = 'stat-val ' + (remaining >= 0 ? 'up-text' : 'down-text');
  document.getElementById('e-stat-remaining-sub').textContent = allocMonth > 0
    ? `after expenses + ${eur(allocMonth)} allocated`
    : (totalIncome > 0 ? (remaining >= 0 ? 'looking good!' : 'over budget!') : 'log income in Budget tab');
  document.getElementById('e-stat-salday').textContent = salDayStr;
  const pdInput = document.getElementById('paycheck-day-input');
  if (pdInput) {
    pdInput.value = state.paycheckDay || '';
    const badge = document.getElementById('paycheck-day-badge');
    if (badge) badge.textContent = state.paycheckDay ? `active — day ${state.paycheckDay}` : 'off';
  }

  // Category filter + search
  const filter = document.querySelector('.chip.active')?.dataset.cat || 'All';
  const searchQ = (document.getElementById('e-search')?.value || '').toLowerCase().trim();
  let shown = filter === 'All' ? monthExpenses : monthExpenses.filter(e => e.cat === filter);
  if (searchQ) shown = shown.filter(e => e.desc.toLowerCase().includes(searchQ) || e.cat.toLowerCase().includes(searchQ));
  const sorted = [...shown].sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalPages = Math.ceil(sorted.length / EXPENSES_PER_PAGE) || 1;
  if (expensePage >= totalPages) expensePage = totalPages - 1;
  const paginated = sorted.slice(expensePage * EXPENSES_PER_PAGE, (expensePage + 1) * EXPENSES_PER_PAGE);

  document.getElementById('expenses-body').innerHTML = paginated.map(e => {
    const ci = CATS.indexOf(e.cat);
    const dotColor = ci >= 0 ? CAT_COLORS[ci] : 'var(--text3)';
    return `<tr>
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:8px;"></span>${e.desc}${e.recurring ? ` <span style="font-size:10px;color:var(--gold);font-weight:600;">🔄</span>` : ''}</td>
      <td class="muted">${e.cat}</td>
      <td class="muted">${e.date}</td>
      <td style="font-weight:600;">${eur(e.amount)}</td>
      <td><button class="del-btn" onclick="delExpense('${e.id}')">✕</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">No expenses for this month.</td></tr>';

  // Pagination controls
  const paginEl = document.getElementById('expenses-pagination');
  paginEl.innerHTML = '';
  if (totalPages > 1) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;padding:14px 0;';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-ghost';
    prevBtn.style.cssText = 'font-size:11px;padding:6px 14px;';
    prevBtn.textContent = '← Prev';
    prevBtn.disabled = expensePage === 0;
    prevBtn.addEventListener('click', () => { expensePage = Math.max(0, expensePage - 1); renderExpenses(); });

    const pageLabel = document.createElement('span');
    pageLabel.style.cssText = 'font-size:12px;color:var(--text2);';
    pageLabel.innerHTML = `Page ${expensePage + 1} of ${totalPages} &nbsp;·&nbsp; ${sorted.length} entries`;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-ghost';
    nextBtn.style.cssText = 'font-size:11px;padding:6px 14px;';
    nextBtn.textContent = 'Next →';
    nextBtn.disabled = expensePage === totalPages - 1;
    nextBtn.addEventListener('click', () => { expensePage = Math.min(totalPages - 1, expensePage + 1); renderExpenses(); });

    wrap.appendChild(prevBtn);
    wrap.appendChild(pageLabel);
    wrap.appendChild(nextBtn);
    paginEl.appendChild(wrap);
  } else {
    paginEl.innerHTML = sorted.length ? `<div style="font-size:11px;color:var(--text3);text-align:center;padding:10px 0;">${sorted.length} entr${sorted.length===1?'y':'ies'}</div>` : '';
  }

  // Category filter chips — always rebuild to reflect dynamic CATS
  const existing = document.getElementById('expense-filters');
  const activeFilter = document.querySelector('#expense-filters .chip.active')?.dataset?.cat || 'All';
  existing.innerHTML = '';
  ['All', ...CATS].forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (c === activeFilter ? ' active' : '');
    btn.dataset.cat = c; btn.textContent = c;
    btn.onclick = () => { document.querySelectorAll('#expense-filters .chip').forEach(x => x.classList.remove('active')); btn.classList.add('active'); expensePage = 0; renderExpenses(); };
    existing.appendChild(btn);
  });

  // Investment allocation card
  renderAllocations();

  // Charts
  buildExpCatChart(monthExpenses);
  buildExpDailyChart(monthExpenses, year, month);
}

// ══════════════ INVESTMENT ALLOCATIONS — UI ══════════════
function renderAllocations() {
  const portSel = document.getElementById('al-port');
  if (!portSel) return;

  // Portfolio dropdown (keep selection across re-renders)
  const cur = portSel.value;
  portSel.innerHTML = (state.portfolios || []).map(p =>
    `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  // Default date = today (only if not already picked)
  const dateInput = document.getElementById('al-date');
  if (dateInput && !dateInput.dataset.raw) setDateField('al-date', now.toISOString().slice(0, 10));

  // Allocated this month
  const monthTotal = allocationTotalForMonth(selectedExpenseMonth || getExpenseMonthKey(now.getFullYear(), now.getMonth()));
  const totalEl = document.getElementById('al-month-total');
  if (totalEl) totalEl.textContent = eur(monthTotal);

  // History table
  const histEl = document.getElementById('allocation-history');
  if (!histEl) return;
  const list = [...(state.allocations || [])].sort((a, b) => (b.allocationDate || '').localeCompare(a.allocationDate || ''));
  if (!list.length) { histEl.innerHTML = ''; return; }

  const portName = id => ((state.portfolios || []).find(p => p.id === id) || {}).name || '(deleted portfolio)';
  histEl.innerHTML = `
    <div style="font-size:10px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-bottom:6px;font-family:'Cinzel',serif;">Allocation History</div>
    <table class="data-table">
      <thead><tr><th>Date</th><th>Portfolio</th><th>Allocated</th><th>Invested</th><th>Remaining</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${list.map(a => {
          const rem = Math.max(0, a.amountAllocated - a.amountInvested);
          const open = a.status === 'open';
          return `<tr>
            <td class="muted">${a.allocationDate}${a.notes ? `<br><span style="font-size:11px;color:var(--text3);">${a.notes}</span>` : ''}</td>
            <td>${portName(a.portfolioId)}</td>
            <td style="font-weight:600;">${eur(a.amountAllocated)}</td>
            <td>${eur(a.amountInvested)}</td>
            <td style="font-weight:600;color:${open ? 'var(--gold)' : 'var(--text3)'};">${eur(rem)}</td>
            <td><span class="badge ${open ? 'buy' : 'etf'}" style="font-size:10px;">${open ? 'Open' : 'Fully Used'}</span></td>
            <td><button class="del-btn" onclick="delAllocation('${a.id}')">✕</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// Allocation stat cards at the top of the Portfolio tab (active portfolio)
function renderAllocationStats() {
  const row = document.getElementById('alloc-stats-row');
  if (!row) return;
  const port = ap();
  const t = allocationTotals(port.id);
  const hasAny = allocationsFor(port.id).length > 0 || t.excess > 0;
  row.style.display = hasAny ? '' : 'none';
  if (!hasAny) return;
  document.getElementById('p-allocated').textContent = eur(t.allocated);
  document.getElementById('p-alloc-invested').textContent = eur(t.invested);
  document.getElementById('p-alloc-remaining').textContent = eur(t.remaining);
  const excessEl = document.getElementById('p-alloc-excess');
  excessEl.textContent = eur(t.excess);
  excessEl.style.color = t.excess > 0 ? 'var(--down)' : '';
  document.getElementById('p-alloc-excess-sub').textContent = t.excess > 0
    ? 'invested beyond allocations' : 'all investments were allocated';
}

// ══════════════ DIVIDEND CALENDAR ══════════════
function renderDividendCalendar() {
  const card = document.getElementById('div-calendar-card');
  const body = document.getElementById('div-calendar-body');
  if (!card || !body) return;

  const holdings = (ap().holdings || []).filter(h => (h.dividendPerShare || 0) > 0);
  if (!holdings.length) { card.style.display = 'none'; return; }
  card.style.display = '';

  const fmtDate = d => d
    ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  const daysUntil = d => d ? Math.ceil((new Date(d + 'T12:00:00Z') - new Date()) / 86400000) : null;

  // Sort: upcoming pay dates first (soonest on top), then no-date holdings by income
  const sorted = [...holdings].sort((a, b) => {
    const da = a.nextPayDate || '9999-12-31';
    const db = b.nextPayDate || '9999-12-31';
    if (da !== db) return da.localeCompare(db);
    return (b.dividendPerShare * b.shares) - (a.dividendPerShare * a.shares);
  });

  const totalAnnual = holdings.reduce((s, h) => s + h.dividendPerShare * h.shares, 0);
  document.getElementById('div-cal-total').textContent = eur(totalAnnual);

  body.innerHTML = `<table class="data-table">
    <thead><tr><th>Holding</th><th>Ex-Dividend</th><th>Next Payment</th><th>Yield</th><th>Est. Annual Income</th></tr></thead>
    <tbody>
      ${sorted.map(h => {
        const days = daysUntil(h.nextPayDate);
        const soonBadge = days !== null && days >= 0 && days <= 14
          ? ` <span style="font-size:10px;background:rgba(76,175,130,0.15);border:1px solid rgba(76,175,130,0.4);color:var(--up);border-radius:20px;padding:1px 8px;">in ${days}d</span>` : '';
        const yieldPct = h.forwardYield != null ? (h.forwardYield * 100).toFixed(2) + '%'
          : (h.currentPrice ? (h.dividendPerShare / h.currentPrice * 100).toFixed(2) + '%' : '—');
        return `<tr>
          <td style="font-weight:600;color:var(--gold);">${h.ticker}<span class="muted" style="font-weight:400;font-size:11px;"> · ${fmtShares(h.shares)} sh</span></td>
          <td class="muted">${fmtDate(h.exDivDate)}</td>
          <td>${fmtDate(h.nextPayDate)}${soonBadge}</td>
          <td class="muted">${yieldPct}</td>
          <td style="font-weight:600;color:var(--up);">${eur(h.dividendPerShare * h.shares)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

function renderNetWorth() {
  const ps = totalPortfolioStats();
  const totalA = state.assets.reduce((s,a)=>s+Number(a.value),0) + ps.val;
  const totalL = state.liabilities.reduce((s,l)=>s+Number(l.value),0);
  const nw = totalA - totalL;
  const ratio = totalA ? (totalL/totalA*100).toFixed(1) : 0;

  document.getElementById('nw-assets').textContent = eur(totalA);
  document.getElementById('nw-liab').textContent = eur(totalL);
  document.getElementById('nw-total').textContent = eur(nw);
  document.getElementById('nw-total').className = 'stat-val ' + (nw>=0?'up-text':'down-text');
  document.getElementById('nw-ratio').textContent = ratio + '%';

  const total = totalA + totalL || 1;
  const aPct = (totalA/total*100).toFixed(1);
  const lPct = (totalL/total*100).toFixed(1);
  document.getElementById('nw-bar-wrap').innerHTML =
    `<div style="width:${aPct}%;background:var(--up);"></div><div style="width:${lPct}%;background:var(--down);"></div>`;
  document.getElementById('nw-bar-a-label').textContent = `Assets ${aPct}%`;
  document.getElementById('nw-bar-l-label').textContent = `Liabilities ${lPct}%`;

  document.getElementById('assets-body').innerHTML = [
    {id:'__portfolio__', name:'Portfolio (live)', value: ps.val},...state.assets
  ].map(a=>
    `<tr><td>${a.name}</td><td style="font-weight:600;">${eur(a.value)}</td>
    <td>${a.id==='__portfolio__'?'':`<button class="del-btn" onclick="delAsset('${a.id}')">✕</button>`}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="empty">No assets.</td></tr>';

  document.getElementById('liabs-body').innerHTML = state.liabilities.map(l => {
    if (l.isCredit) {
      const orig = l.originalValue || l.value;
      const paid = Math.max(0, orig - l.value);
      const pct  = orig > 0 ? Math.min(100, (paid / orig) * 100) : 0;
      const months = l.instalment > 0 ? Math.ceil(l.value / l.instalment) : null;
      return `<tr>
        <td>
          <div style="font-weight:600;">${l.name}</div>
          <div style="font-size:11px;color:var(--text3);">
            ${l.linkedKeyword ? `linked: "${l.linkedKeyword}"` : 'no keyword'}
            ${l.instalment ? ` · ${eur(l.instalment)}/mo` : ''}
            ${months ? ` · ~${months} months left` : ''}
          </div>
          <div style="height:5px;background:var(--bg4);border-radius:3px;overflow:hidden;margin-top:5px;width:140px;">
            <div style="height:100%;width:${pct.toFixed(1)}%;background:var(--up);border-radius:3px;transition:width .6s;"></div>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px;">${pct.toFixed(1)}% paid off · ${eur(paid)} of ${eur(orig)}</div>
        </td>
        <td style="font-weight:600;color:var(--down);vertical-align:top;padding-top:14px;">
          <input type="number" value="${l.value}" min="0"
            onchange="updateLiabBalance('${l.id}',this.value)"
            style="width:110px;padding:5px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--down);font-family:Karla,sans-serif;font-size:13px;font-weight:600;outline:none;text-align:right;"
            onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
        </td>
        <td style="vertical-align:top;padding-top:14px;"></td>
        <td style="vertical-align:top;padding-top:14px;"><button class="del-btn" onclick="delLiab('${l.id}')">✕</button></td>
      </tr>`;
    }
    return `<tr>
      <td>${l.name}</td>
      <td style="font-weight:600;color:var(--down);">–${eur(l.value)}</td>
      <td></td>
      <td><button class="del-btn" onclick="delLiab('${l.id}')">✕</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="empty">No liabilities.</td></tr>';
}

function renderBudget() {
  // Init selected budget month
  if (!selectedBudgetMonth) selectedBudgetMonth = getExpenseMonthKey(now.getFullYear(), now.getMonth());

  // Build budget month selector
  const budSel = document.getElementById('bud-month-sel');
  if (budSel) {
    const keys = new Set();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.add(getExpenseMonthKey(d.getFullYear(), d.getMonth()));
    }
    state.expenses.forEach(e => { if (e.date) keys.add(e.date.slice(0,7)); });
    (state.salaries||[]).forEach(s => { if (s.month) keys.add(s.month); });
    const sorted = [...keys].sort().reverse();
    budSel.innerHTML = sorted.map(k => {
      const [y, m] = k.split('-');
      const label = new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      return `<option value="${k}" ${k === selectedBudgetMonth ? 'selected' : ''}>${label}</option>`;
    }).join('');
  }

  const [by, bm] = selectedBudgetMonth.split('-').map(Number);
  const bYear = by, bMonth = bm - 1;
  const monthLabel = new Date(bYear, bMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const salDay = secondToLastBusinessDay(bYear, bMonth);
  const salDayStr = salDay.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // Salary for budget month is received on 2nd-to-last business day of PREVIOUS month
  const prevMonth = new Date(bYear, bMonth - 1, 1);
  const receiveSalDay = secondToLastBusinessDay(prevMonth.getFullYear(), prevMonth.getMonth());
  const receiveSalDayStr = receiveSalDay.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  document.getElementById('bud-month-label').textContent = monthLabel;
  document.getElementById('bud-sal-day').textContent = `received ~${receiveSalDayStr} (prev. month)`;

  // Salary + extra for selected budget month
  const salaryEntry = (state.salaries||[]).find(s => s.month === selectedBudgetMonth);
  const salaryAmt = salaryEntry ? salaryEntry.amount : 0;
  const extraEntries = state.extraIncomes.filter(x => x.month === selectedBudgetMonth);
  const extraAmt = extraEntries.reduce((s, x) => s + Number(x.amount), 0);
  const totalIncome = salaryAmt + extraAmt;

  // Pre-fill salary fields
  const salAmtInput = document.getElementById('e-sal-amount');
  const salDateInput = document.getElementById('e-sal-date');
  const salClearBtn = document.getElementById('e-sal-clear');
  const salBtn = document.getElementById('e-sal-btn');
  if (salaryEntry) {
    salAmtInput.value = salaryEntry.amount;
    setDateField('e-sal-date', salaryEntry.receivedDate || salaryEntry.date);
    salBtn.textContent = 'Update';
    salClearBtn.style.display = 'inline-block';
  } else {
    salAmtInput.value = '';
    const suggestedDate = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2,'0')}-${String(receiveSalDay.getDate()).padStart(2,'0')}`;
    setDateField('e-sal-date', suggestedDate);
    salBtn.textContent = 'Log';
    salClearBtn.style.display = 'none';
  }

  // Pre-fill extra date
  const extraDateInput = document.getElementById('e-extra-date');
  if (!extraDateInput.dataset.raw) setDateField('e-extra-date', now.toISOString().slice(0,10));

  // Extra income list
  document.getElementById('e-extra-list').innerHTML = extraEntries.length ? extraEntries.sort((a,b) => new Date(b.date)-new Date(a.date)).map(x =>
    `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--border);">
      <span style="font-size:12px;color:var(--text2);">${x.date}</span>
      <span style="flex:1;font-size:13px;">${x.desc}</span>
      <span class="up-text" style="font-weight:600;">${eur(x.amount)}</span>
      <button class="del-btn" onclick="delExtra('${x.id}')">✕</button>
    </div>`
  ).join('') : '';

  // Budget stats for selected month — allocations reduce remaining (but count as savings)
  const thisMonth = state.expenses.filter(e => expenseBelongsToMonth(e, selectedBudgetMonth));
  const totalSpent = thisMonth.reduce((s,e)=>s+Number(e.amount),0);
  const allocMonth = typeof allocationTotalForMonth === 'function' ? allocationTotalForMonth(selectedBudgetMonth) : 0;
  const remaining = totalIncome - totalSpent - allocMonth;
  const savingsRate = totalIncome ? Math.max(0, (remaining + allocMonth)/totalIncome*100) : 0;
  const totalLimit = state.budgets.reduce((s,b)=>s+b.limit,0);
  const totalPct = totalLimit ? Math.min(totalSpent/totalLimit*100,100) : 0;
  const over = totalSpent > totalLimit && totalLimit > 0;

  document.getElementById('bud-income').textContent = eur(totalIncome);
  document.getElementById('bud-income-sub').textContent = `salary + ${extraEntries.length} extra`;
  document.getElementById('bud-spent').textContent = eur(totalSpent);
  document.getElementById('bud-remaining').textContent = eur(remaining);
  document.getElementById('bud-remaining').className = 'stat-val ' + (remaining>=0?'up-text':'down-text');
  document.getElementById('bud-remaining-sub').textContent = allocMonth > 0
    ? `incl. ${eur(allocMonth)} allocated to invest`
    : (remaining>=0 ? 'looking good!' : 'over your income');
  document.getElementById('bud-savrate').textContent = savingsRate.toFixed(1) + '%';
  document.getElementById('bud-savrate').className = 'stat-val ' + (savingsRate>=20?'up-text':savingsRate>0?'gold-text':'down-text');

  const incBase = totalIncome || totalSpent || 1;
  const spentPct = Math.min(totalSpent/incBase*100, 100);
  const savedPct = Math.min(Math.max(remaining/incBase*100,0), 100-spentPct);
  document.getElementById('bud-bar-spent').style.width = spentPct + '%';
  document.getElementById('bud-bar-saved').style.width = savedPct + '%';

  document.getElementById('budget-summary').textContent = eur(totalSpent) + ' spent / ' + eur(totalLimit) + ' budgeted';
  document.getElementById('budget-total-bar').style.width = totalPct + '%';
  document.getElementById('budget-total-bar').style.background = over?'var(--down)':totalPct>80?'#e0965c':'var(--gold)';

  // Render category chips (display only — delete is on each card)
  const catsChipsEl = document.getElementById('cats-chips');
  if (catsChipsEl) {
    catsChipsEl.innerHTML = CATS.map((c, i) =>
      `<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:20px;font-size:12px;">
        <span style="width:7px;height:7px;border-radius:50%;background:${CAT_COLORS[i]};flex-shrink:0;display:inline-block;"></span>
        <span>${c}</span>
      </div>`
    ).join('');
  }

  // Category budget cards
  document.getElementById('budget-grid').innerHTML = state.budgets.map((b) => {
    const ci = CATS.indexOf(b.cat);
    const color = CAT_COLORS[ci >= 0 ? ci : 0];
    const spent = thisMonth.filter(e=>e.cat===b.cat).reduce((s,e)=>s+Number(e.amount),0);
    const incPct = totalIncome ? (spent/totalIncome*100).toFixed(1) : null;
    const usedPct = b.limit ? Math.min(spent/b.limit*100,100) : 0;
    const isOver = b.limit>0 && spent>b.limit;
    const barColor = isOver?'var(--down)':usedPct>80?'#e0965c':'var(--up)';
    return `<div class="card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <div style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0;"></div>
        <span style="font-size:14px;font-weight:600;flex:1;">${b.cat}</span>
        ${isOver?'<span style="font-size:11px;color:var(--down);font-weight:700;">OVER</span>':''}
        <button onclick="delCategory('${b.cat}')" class="del-btn" title="Delete category" style="font-size:15px;opacity:0.5;transition:opacity .15s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5">✕</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:12px;color:var(--text2);">Limit €</span>
        <input type="number" value="${b.limit||''}" placeholder="0" onchange="setBudget('${b.cat}',this.value)"
          style="flex:1;padding:7px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:Karla,sans-serif;font-size:13px;outline:none;">
      </div>
      <div style="font-size:12px;color:${isOver?'var(--down)':'var(--text2)'};margin-bottom:4px;">
        ${eur(spent)} spent${b.limit>0?' of '+eur(b.limit):''}
      </div>
      ${incPct!==null?`<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">${incPct}% of monthly income</div>`:''}
      ${b.limit>0?`<div class="prog-wrap"><div class="prog-bar" style="width:${usedPct}%;background:${barColor};"></div></div>`:''}
    </div>`;
  }).join('');
}

function updateBuyLabel() {
  const cur = document.getElementById('h-buy-currency').value;
  const sym = { EUR:'€', USD:'$', GBP:'£', CHF:'₣', BRL:'R$' }[cur] || cur;
  document.getElementById('h-buy-label').textContent = `Avg Buy Price (${sym})`;
}

