// ══════════════ CSV EXPORT ══════════════
function exportPortfolioCSV() {
  const rows = [['Ticker','Asset Class','Shares','Avg Cost (€)','Last Price (€)','Today %','Total Cost (€)','Mkt Value (€)','Total Gain (€)','Gain %','Dividends (€)']];
  (ap().holdings||[]).forEach(h => {
    const price = h.currentPrice || h.buyPrice;
    const val = price * h.shares;
    const cost = h.buyPrice * h.shares;
    // Price-only, like the Total Gain column in the app; dividends have their
    // own column (this added them in, so the export disagreed with the screen)
    const gain = val - cost;
    const gainPct = cost ? gain / cost * 100 : 0;
    const effCls = guessAssetClass(h.ticker); const expCls = effCls !== 'Stock' ? effCls : (h.assetClass || 'Stock');
    rows.push([h.ticker, expCls, h.shares, h.buyPrice.toFixed(2), h.currentPrice ? h.currentPrice.toFixed(2) : '',
      h.dayChangePct != null ? h.dayChangePct.toFixed(2) + '%' : '', cost.toFixed(2), val.toFixed(2),
      gain.toFixed(2), gainPct.toFixed(2) + '%', (h.dividends || 0)]);
  });
  downloadCSV(rows, 'marduk-portfolio.csv');
}

function exportExpensesCSV() {
  const month = selectedExpenseMonth;
  // Use expenseBelongsToMonth so the CSV matches exactly what's shown on screen (respects paycheckDay)
  const expenses = month ? state.expenses.filter(e => expenseBelongsToMonth(e, month)) : state.expenses;
  const rows = [['Description', 'Category', 'Date', 'Amount (€)', 'Recurring']];
  [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach(e => rows.push([e.desc, e.cat, e.date, Number(e.amount).toFixed(2), e.recurring ? 'Yes' : 'No']));
  downloadCSV(rows, `marduk-expenses${month ? '-' + month : ''}.csv`);
}

function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ══════════════ PORTFOLIO MANAGEMENT ══════════════
function switchPortfolio(id) {
  if (state.activePortfolioId === id) return;
  state.activePortfolioId = id;
  txPage = 0;
  save();
  ['port-donut','pnl-bar','port-history','port-dynamics'].forEach(k => destroyChart(k));
  const hperfWrap = document.getElementById('hperf-chart-wrap');
  if (hperfWrap) hperfWrap.innerHTML = '';
  renderPortfolio();
}

// Custom prompt (replaces window.prompt which is blocked in Electron)
let _promptCallback = null;
function showPrompt(title, defaultVal, callback) {
  document.getElementById('prompt-title').textContent = title;
  const inp = document.getElementById('prompt-input');
  inp.value = defaultVal || '';
  document.getElementById('prompt-overlay').classList.add('open');
  inp.focus();
  inp.select();
  _promptCallback = callback;
}
function promptConfirm() {
  const val = document.getElementById('prompt-input').value.trim();
  document.getElementById('prompt-overlay').classList.remove('open');
  if (_promptCallback) { _promptCallback(val); _promptCallback = null; }
}
function promptCancel() {
  document.getElementById('prompt-overlay').classList.remove('open');
  _promptCallback = null;
}

function addPortfolio() {
  showPrompt('New portfolio name:', '', name => {
    if (!name) return;
    const newPort = { id: uid(), name, holdings: [], transactions: [], portHistory: [] };
    state.portfolios.push(newPort);
    state.activePortfolioId = newPort.id;
    save(); renderPortfolio();
  });
}

function renamePortfolio() {
  const port = ap();
  showPrompt('Rename portfolio:', port.name, name => {
    if (!name || name === port.name) return;
    port.name = name;
    save(); renderPortfolio();
  });
}

async function deletePortfolio() {
  if ((state.portfolios||[]).length <= 1) return;
  const port = ap();
  if (!await mardukConfirm(`Delete "${port.name}" and all its holdings? This cannot be undone.`)) return;
  state.portfolios = state.portfolios.filter(p => p.id !== port.id);
  state.activePortfolioId = state.portfolios[0].id;
  save();
  ['port-donut','pnl-bar','port-history','port-dynamics'].forEach(k => destroyChart(k));
  const hw = document.getElementById('hperf-chart-wrap');
  if (hw) hw.innerHTML = '';
  renderPortfolio();
}

