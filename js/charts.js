// ══════════════ CHARTS ══════════════
let charts = {};

function destroyChart(id) { if(charts[id]) { charts[id].destroy(); delete charts[id]; } }

// Format share count for display — strips floating-point noise (6.717999... → 6.718)
function fmtShares(n) {
  if (n == null) return '0';
  if (Number.isInteger(n)) return String(n);
  // Round to max 6 decimal places and drop trailing zeros
  return parseFloat(n.toFixed(6)).toString();
}

function isDark() { return document.body.dataset.theme !== 'light'; }
function gridColor() { return isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'; }
function textColor() { return isDark() ? '#9b9280' : '#6b5f4a'; }

function buildSpendingChart() {
  const el = document.getElementById('chart-spending');
  if (!el || !el.offsetParent) return;
  destroyChart('spending');
  const labels = Array.from({length:6},(_,i) => MONTHS[(now.getMonth()-5+i+12)%12]);
  const data = Array.from({length:6},(_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
    const key = getExpenseMonthKey(d.getFullYear(), d.getMonth());
    return state.expenses.filter(e => expenseBelongsToMonth(e, key)).reduce((s,e) => s+Number(e.amount), 0);
  });
  const colors = data.map((_,i) => i===5?'#c9a84c':'rgba(201,168,76,0.3)');
  const ctx = document.getElementById('chart-spending').getContext('2d');
  charts['spending'] = new Chart(ctx, {
    type:'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius:6, borderSkipped:false }] },
    options: { responsive:true, maintainAspectRatio:false,
      animation: { duration: 400, easing: 'easeOutQuart' },
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+eur(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{color:textColor()}},y:{grid:{color:gridColor()},ticks:{color:textColor(),callback:v=>eur(v,0)}}} }
  });
}

function buildAllocChart() {
  const el = document.getElementById('chart-alloc');
  if (!el || !el.offsetParent) return;
  destroyChart('alloc');
  const classes = {};
  (state.portfolios||[]).flatMap(p=>p.holdings||[]).forEach(h => {
    const price = h.currentPrice || h.buyPrice;
    const val = price * h.shares;
    // Derive class at render time: TICKER_DB/pattern wins over stored value so
    // ETFs mis-saved as 'Stock' always appear in the right segment.
    const dbCls = guessAssetClass(h.ticker);
    const cls = (dbCls !== 'Stock') ? dbCls : (h.assetClass || 'Stock');
    classes[cls] = (classes[cls]||0) + val;
  });
  // Use cashEntries for accuracy (same logic as totalPortfolioStats)
  const totalCash = (state.portfolios||[]).reduce((s, p) => {
    if (p.cashEntries && p.cashEntries.length) {
      return s + p.cashEntries.reduce((cs, e) => cs + (e.amount / (FX_RATES[e.currency] || 1)), 0);
    }
    return s + (p.cash || 0);
  }, 0);
  if (totalCash > 0) classes['Cash'] = (classes['Cash']||0) + totalCash;
  const labels = Object.keys(classes);
  const data = Object.values(classes);
  if (!data.length) return;
  const colors = labels.map(l=>CLASS_COLORS[l]||'#aaa');
  const total  = data.reduce((s,v)=>s+v,0)||1;
  charts['alloc'] = new Chart(document.getElementById('chart-alloc').getContext('2d'), {
    type:'doughnut',
    data: { labels, datasets:[{data, backgroundColor:colors, borderWidth:2, borderColor: isDark()?'#13131a':'#ede7d9'}] },
    options: { responsive:true, maintainAspectRatio:true, cutout:'65%',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+eur(c.raw)}}} }
  });
  // Custom HTML legend (keeps the donut ring full-size)
  const legendEl = document.getElementById('alloc-legend');
  if (legendEl) {
    legendEl.innerHTML = labels.map((l,i) =>
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0;"></div>
        <span style="flex:1;font-size:13px;color:var(--text);">${l}</span>
        <span style="font-size:13px;font-weight:600;color:var(--text);">${((data[i]/total)*100).toFixed(1)}%</span>
      </div>`
    ).join('');
  }
}

function buildCatSpendChart() {
  const el = document.getElementById('chart-catspend');
  if (!el || !el.offsetParent) return;
  destroyChart('catspend');
  const thisMonthKey = getExpenseMonthKey(now.getFullYear(), now.getMonth());
  const thisMonth = state.expenses.filter(e => expenseBelongsToMonth(e, thisMonthKey));
  const data = CATS.map(c => thisMonth.filter(e=>e.cat===c).reduce((s,e)=>s+Number(e.amount),0));
  const nonZeroCats = CATS.filter((_,i)=>data[i]>0);
  const nonZeroData = data.filter(v=>v>0);
  const nonZeroColors = CATS.map((_,i)=>CAT_COLORS[i]).filter((_,i)=>data[i]>0);
  charts['catspend'] = new Chart(document.getElementById('chart-catspend').getContext('2d'), {
    type:'bar',
    data: { labels:nonZeroCats.length?nonZeroCats:CATS, datasets:[{data:nonZeroCats.length?nonZeroData:data, backgroundColor:nonZeroCats.length?nonZeroColors:CAT_COLORS, borderRadius:4, borderSkipped:false}] },
    options: { indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+eur(c.raw)}}},
      scales:{x:{grid:{color:gridColor()},ticks:{color:textColor(),callback:v=>eur(v,0)}},y:{grid:{display:false},ticks:{color:textColor(),font:{size:11}}}} }
  });
}

function buildNwHistoryChart() {
  const el = document.getElementById('chart-nw-history');
  if (!el || !el.offsetParent) return;
  destroyChart('nw-history');
  const labels = Array.from({length:6},(_,i) => MONTHS[(now.getMonth()-5+i+12)%12]);
  const data = Array.from({length:6},(_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-5+i+1, 0); // last day of that month
    const snap = (state.nwHistory||[]).find(s => s.month === `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    return snap ? snap.value : null;
  });
  const ctx = document.getElementById('chart-nw-history').getContext('2d');
  const grad = ctx.createLinearGradient(0,0,0,220);
  grad.addColorStop(0,'rgba(76,175,130,0.25)');
  grad.addColorStop(1,'rgba(76,175,130,0.0)');
  charts['nw-history'] = new Chart(ctx, {
    type:'line',
    data: { labels, datasets:[{ data, borderColor:'#4caf82', backgroundColor:grad, borderWidth:2, pointBackgroundColor:'#4caf82', pointRadius:4, fill:true, tension:.4, spanGaps:true }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+eur(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{color:textColor()}},y:{grid:{color:gridColor()},ticks:{color:textColor(),callback:v=>eur(v,0)}}} }
  });
}

function buildSavRateChart() {
  const el = document.getElementById('chart-savrate');
  if (!el || !el.offsetParent) return;
  destroyChart('savrate');
  const labels = Array.from({length:6},(_,i) => MONTHS[(now.getMonth()-5+i+12)%12]);
  const data = Array.from({length:6},(_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
    const key = getExpenseMonthKey(d.getFullYear(), d.getMonth());
    const sal = (state.salaries||[]).find(s => s.month === key);
    const salAmt = sal ? Number(sal.amount) : 0;
    const extraAmt = (state.extraIncomes||[]).filter(x => x.month === key).reduce((s,x) => s+Number(x.amount), 0);
    const inc = salAmt + extraAmt;
    const spent = state.expenses.filter(x => expenseBelongsToMonth(x, key)).reduce((s,x)=>s+Number(x.amount),0);
    return inc > 0 ? Math.max(0, ((inc-spent)/inc)*100) : null;
  });
  const ctx = document.getElementById('chart-savrate').getContext('2d');
  charts['savrate'] = new Chart(ctx, {
    type:'line',
    data: { labels, datasets:[{ data, borderColor:'#c9a84c', backgroundColor:'rgba(201,168,76,0.1)', borderWidth:2, pointBackgroundColor:'#c9a84c', pointRadius:4, fill:true, tension:.4, spanGaps:true }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw!=null?' '+c.raw.toFixed(1)+'%':' no data'}}},
      layout:{padding:{top:10}},
      scales:{x:{grid:{display:false},ticks:{color:textColor()}},y:{grid:{color:gridColor()},ticks:{color:textColor(),callback:v=>v+'%'},min:0,max:100}} }
  });
}

function buildIncomeHistoryChart() {
  const el = document.getElementById('chart-income-history');
  if (!el || !el.offsetParent) return;
  destroyChart('income-history');
  const labels = Array.from({length:6},(_,i) => MONTHS[(now.getMonth()-5+i+12)%12]);
  const salData = Array.from({length:6},(_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
    const key = getExpenseMonthKey(d.getFullYear(), d.getMonth());
    const sal = (state.salaries||[]).find(s => s.month === key);
    return sal ? Number(sal.amount) : 0;
  });
  const extraData = Array.from({length:6},(_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
    const key = getExpenseMonthKey(d.getFullYear(), d.getMonth());
    return (state.extraIncomes||[]).filter(x => x.month === key).reduce((s,x) => s+Number(x.amount), 0);
  });
  const spendData = Array.from({length:6},(_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
    const key = getExpenseMonthKey(d.getFullYear(), d.getMonth());
    return state.expenses.filter(x => expenseBelongsToMonth(x, key)).reduce((s,x)=>s+Number(x.amount),0);
  });
  charts['income-history'] = new Chart(document.getElementById('chart-income-history').getContext('2d'), {
    type:'bar',
    data: { labels, datasets:[
      { label:'Salary', data:salData, backgroundColor:'rgba(76,175,130,0.8)', borderRadius:0, borderSkipped:false, stack:'income' },
      { label:'Extra', data:extraData, backgroundColor:'rgba(201,168,76,0.8)', borderRadius:4, borderSkipped:false, stack:'income' },
      { label:'Expenses', data:spendData, backgroundColor:'rgba(224,92,92,0.7)', borderRadius:4, borderSkipped:false, stack:'expenses' }
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{color:textColor(),font:{size:11}}},tooltip:{callbacks:{label:c=>' '+eur(c.raw)}}},
      scales:{
        x:{grid:{display:false},ticks:{color:textColor()}},
        y:{grid:{color:gridColor()},ticks:{color:textColor(),callback:v=>eur(v,0)}}
      }
    }
  });
}

function buildNwHistoryTabChart() {
  const el = document.getElementById('chart-nw-history-tab');
  if (!el || !el.offsetParent) return;
  destroyChart('nw-history-tab');
  const labels = Array.from({length:6},(_,i) => MONTHS[(now.getMonth()-5+i+12)%12]);
  const data = Array.from({length:6},(_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-5+i+1, 0);
    const snap = (state.nwHistory||[]).find(s => s.month === `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    return snap ? snap.value : null;
  });
  const ctx = el.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,0,220);
  grad.addColorStop(0,'rgba(76,175,130,0.25)');
  grad.addColorStop(1,'rgba(76,175,130,0.0)');
  charts['nw-history-tab'] = new Chart(ctx, {
    type:'line',
    data: { labels, datasets:[{ data, borderColor:'#4caf82', backgroundColor:grad, borderWidth:2, pointBackgroundColor:'#4caf82', pointRadius:4, fill:true, tension:.4, spanGaps:true }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+eur(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{color:textColor()}},y:{grid:{color:gridColor()},ticks:{color:textColor(),callback:v=>eur(v,0)}}} }
  });
}

function buildPortDonut() {
  const el = document.getElementById('chart-port-donut');
  if (!el || !el.offsetParent) return;
  destroyChart('port-donut');
  const classes = {};
  (ap().holdings||[]).forEach(h => {
    const val = (h.currentPrice || h.buyPrice) * h.shares;
    const dbCls = guessAssetClass(h.ticker);
    const cls = (dbCls !== 'Stock') ? dbCls : (h.assetClass || 'Stock');
    classes[cls] = (classes[cls]||0) + val;
  });
  const p = ap();
  const cash = (p.cashEntries?.length)
    ? p.cashEntries.reduce((s,e) => s + (e.amount / (FX_RATES[e.currency] || 1)), 0)
    : (p.cash || 0);
  if (cash > 0) classes['Cash'] = (classes['Cash'] || 0) + cash;
  const labels = Object.keys(classes);
  const data   = Object.values(classes);
  const total  = data.reduce((s,v)=>s+v,0)||1;
  if (!data.length) { document.getElementById('port-legend').innerHTML = '<p class="muted" style="font-size:12px;">No holdings yet.</p>'; return; }
  const bgColors = labels.map(l => CLASS_COLORS[l] || (l==='Cash'?'#4caf82':'#aaa'));
  charts['port-donut'] = new Chart(el.getContext('2d'), {
    type:'doughnut',
    data: { labels, datasets:[{data, backgroundColor:bgColors, borderWidth:2, borderColor: isDark()?'#13131a':'#ede7d9'}] },
    options: { responsive:true, maintainAspectRatio:true, cutout:'62%', plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+eur(c.raw)}}} }
  });
  document.getElementById('port-legend').innerHTML = labels.map((l,i) =>
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <div style="width:10px;height:10px;border-radius:50%;background:${bgColors[i]};flex-shrink:0;"></div>
      <span style="flex:1;font-size:13px;">${l}</span>
      <span style="font-size:13px;font-weight:600;">${((data[i]/total)*100).toFixed(1)}%</span>
    </div>`
  ).join('');
}

function buildPnlBar() {
  const el = document.getElementById('chart-pnl-bar');
  if (!el || !el.offsetParent) return;
  destroyChart('pnl-bar');
  if (!(ap().holdings||[]).length) return;
  const labels = (ap().holdings||[]).map(h=>h.ticker);
  const data = (ap().holdings||[]).map(h => {
    const price = h.currentPrice || h.buyPrice;
    return (price - h.buyPrice) * h.shares;
  });
  charts['pnl-bar'] = new Chart(document.getElementById('chart-pnl-bar').getContext('2d'), {
    type:'bar',
    data: { labels, datasets:[{data, backgroundColor:data.map(v=>v>=0?'rgba(76,175,130,0.7)':'rgba(224,92,92,0.7)'), borderRadius:4}] },
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+eur(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{color:textColor()}},y:{grid:{color:gridColor()},ticks:{color:textColor(),callback:v=>eur(v,0)}}} }
  });
}

// ══════════════ RENDER ══════════════
function renderAll() {
  try {
    now = new Date(); // always use the real current time
    snapshotNetWorth(); // keep NW history current on every change
    renderOverview();
    renderPortfolio();
    renderExpenses();
    renderNetWorth();
    renderBudget();
    renderGoals();
    renderSalary();
  } catch(err) {
    console.error('renderAll error:', err);
  }
}

// A price that failed to refresh silently keeps its old value. Past a trading
// day, say so — an out-of-date number that looks current is worse than no number.
function priceAgeBadge(h) {
  if (!h.currentPrice) return '';
  if (!h.priceUpdatedAt) return ' <span title="Price age unknown — refresh to update" style="color:var(--gold);">·</span>';
  const hours = (Date.now() - new Date(h.priceUpdatedAt).getTime()) / 3600000;
  if (hours < 24) return '';
  const label = hours < 48 ? '1d old' : `${Math.floor(hours / 24)}d old`;
  return ` <span title="Last successful price update: ${new Date(h.priceUpdatedAt).toLocaleString('en-GB')}" style="color:var(--gold);">· ${label}</span>`;
}

function portfolioStats() {
  const holdings = ap().holdings || [];
  const cashEur  = getCashTotalEur(); // always computed from cashEntries
  ap().cash = cashEur;                // keep legacy field in sync
  const holdVal = holdings.reduce((s,h) => s+(h.currentPrice||h.buyPrice)*h.shares, 0);
  const cost    = holdings.reduce((s,h) => s+h.buyPrice*h.shares, 0);
  // h.dividends = actually received dividends (user-tracked), NOT forward estimates
  const divs    = holdings.reduce((s,h) => s+Number(h.dividends||0), 0);
  // `gain` is price-only, matching the holdings table's Total Gain column — the
  // two used to disagree (this added dividends, the table didn't), so the column
  // never summed to the headline above it. Dividends are surfaced beside it.
  const gain    = holdVal - cost;
  const totalRet = gain + divs;          // price gain + received dividends
  const val     = holdVal + cashEur;
  return { val, holdVal, cost, divs, gain, gainPct: cost ? gain/cost*100 : 0,
           totalRet, totalRetPct: cost ? totalRet/cost*100 : 0, cash: cashEur };
}

function renderOverview() {
  const ps = totalPortfolioStats();
  const totalA = state.assets.reduce((s,a)=>s+Number(a.value),0) + ps.val;
  const totalL = state.liabilities.reduce((s,l)=>s+Number(l.value),0);
  const nw = totalA - totalL;
  const currentMonthKey = getExpenseMonthKey(now.getFullYear(), now.getMonth());
  const thisMonth = state.expenses.filter(e => expenseBelongsToMonth(e, currentMonthKey));
  const spent = thisMonth.reduce((s,e)=>s+Number(e.amount),0);

  document.getElementById('ov-networth').textContent = eur(nw);
  document.getElementById('ov-portfolio').textContent = eur(ps.val);
  document.getElementById('ov-port-sub').textContent = ps.count + ' positions';
  document.getElementById('ov-pnl').textContent = eur(ps.gain);
  document.getElementById('ov-pnl').className = 'stat-val ' + (ps.gain>=0?'up-text':'down-text');
  document.getElementById('ov-pnl-sub').textContent =
    pct(ps.gainPct) + (ps.divs > 0 ? ` · +${eur(ps.divs)} div` : ' all-time');
  document.getElementById('ov-pnl-sub').className = 'stat-sub ' + (ps.gain>=0?'up':'down');
  document.getElementById('ov-spent').textContent = eur(spent);
  document.getElementById('ov-spent-sub').textContent = thisMonth.length + ' transactions';

  // Top positions (across all portfolios)
  const allH = (state.portfolios||[]).flatMap(p=>p.holdings||[]);
  const total = ps.val || 1;
  const sorted = [...allH].sort((a,b)=>(b.currentPrice||b.buyPrice)*b.shares-(a.currentPrice||a.buyPrice)*a.shares);
  document.getElementById('top-positions').innerHTML = sorted.slice(0,5).map(h=>{
    const v = (h.currentPrice||h.buyPrice)*h.shares;
    const p = (v/total*100).toFixed(1);
    return `<div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;"><span style="font-weight:600;color:var(--gold)">${h.ticker}</span><span>${eur(v)} <span class="muted">${p}%</span></span></div>
      <div class="pos-bar-wrap"><div class="pos-bar" style="width:${p}%;background:${CLASS_COLORS[guessAssetClass(h.ticker)]||CLASS_COLORS[h.assetClass]||'var(--gold)'};"></div></div>
    </div>`;
  }).join('') || '<p class="empty">No holdings yet.</p>';

  // Recent transactions (last 5 expenses)
  const recent = [...state.expenses].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  document.getElementById('ov-recent-body').innerHTML = recent.map(e=>
    `<tr><td><span class="badge buy">Expense</span></td><td>${e.desc}</td><td class="muted">${e.date}</td><td class="down-text" style="font-weight:600;">${eur(e.amount)}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="empty">No transactions yet.</td></tr>';

  renderAiSummaryCard();

  buildSpendingChart();
  buildAllocChart();
  buildCatSpendChart();
  buildNwHistoryChart();
  buildSavRateChart();
  buildIncomeHistoryChart();
}

function renderPortfolioTabs() {
  const tabs = document.getElementById('portfolio-tabs');
  if (!tabs) return;
  tabs.innerHTML = (state.portfolios || []).map(p =>
    `<button class="portfolio-tab${p.id === state.activePortfolioId ? ' active' : ''}" onclick="switchPortfolio('${p.id}')">${p.name}</button>`
  ).join('');
  // Keep the section title in sync
  const titleEl = document.getElementById('port-sec-title');
  if (titleEl) titleEl.textContent = ap().name || 'Portfolio';
  // Hide delete button when only one portfolio
  const delBtn = document.getElementById('del-port-btn');
  if (delBtn) delBtn.style.display = (state.portfolios||[]).length <= 1 ? 'none' : '';
}

function renderPortfolio() {
  renderPortfolioTabs();
  const curSel = document.getElementById('port-currency-sel');
  if (curSel) curSel.value = portCurrency();
  const ps = portfolioStats();
  document.getElementById('p-value').textContent = eurPort(ps.val);
  document.getElementById('p-cost').textContent = eurPort(ps.cost);
  document.getElementById('p-gain').textContent = eurPort(ps.gain);
  document.getElementById('p-gain').className = 'stat-val ' + (ps.gain>=0?'up-text':'down-text');
  // Dividends shown beside the price gain rather than folded into it, so this
  // card reconciles with the holdings table's Total Gain column.
  document.getElementById('p-gain-pct').textContent =
    pct(ps.gainPct) + (ps.divs > 0 ? ` · +${eurPort(ps.divs)} div` : '');
  document.getElementById('p-gain-pct').className = 'stat-sub ' + (ps.gain>=0?'up':'down');
  document.getElementById('p-count').textContent = (ap().holdings||[]).length;

  renderHoldingsTable();
  renderAllocationStats();
  renderDividendCalendar();
  renderReceivedDividends();
  buildReturnsCard();

  buildPortDonut();
  buildPnlBar();
  buildPortHistoryChart(); // also calls buildPortDynamicsChart + buildHoldingsPerfChart internally
  buildSectorChart();
  renderCashTable();
  renderTransactions();
}

// ══════════════ HOLDINGS TABLE SUB-TABS ══════════════
function lotsTableFor(h) {
  const lots = (ap().transactions||[]).filter(t => t.ticker === h.ticker)
    .sort((a,b) => new Date(a.date)-new Date(b.date));
  const rows = lots.map(lot => {
    const lCost = lot.price * lot.shares;
    const lVal  = (h.currentPrice || lot.price) * lot.shares;
    const lGain = lot.type === 'Buy' ? lVal - lCost : null;
    const lGPct = lGain !== null && lCost ? lGain/lCost*100 : null;
    return `<tr>
      <td>${lot.date}</td>
      <td><span class="badge ${lot.type==='Buy'?'buy':'sell'}" style="font-size:10px;padding:2px 7px;">${lot.type}</span></td>
      <td>${fmtShares(lot.shares)}</td>
      <td>${lot.priceOriginal != null ? `${CURRENCY_SYMBOLS[lot.priceCurrency]||lot.priceCurrency}${lot.priceOriginal} <span style="font-size:10px;color:var(--text3);">(${eur(lot.price)})</span>` : eur(lot.price)}</td>
      <td class="muted">${lot.type==='Buy'?eurPort(lCost):'—'}</td>
      <td>${lot.type==='Buy'?eurPort(lVal):'—'}</td>
      <td class="${lGain!==null?(lGain>=0?'up-text':'down-text'):''}">
        ${lGain!==null ? eurPort(lGain)+' <span style="font-size:10px;">('+pct(lGPct)+')</span>' : '—'}
      </td>
      <td><button class="del-btn" onclick="event.stopPropagation();delTransaction('${lot.id}')" title="Remove lot">✕</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="empty" style="padding:10px 0;">No lots recorded.</td></tr>`;
  return `<div class="lots-wrap"><table class="lots-table">
    <thead><tr><th>Date</th><th>Type</th><th>Shares</th><th>Price</th><th>Total Cost</th><th>Mkt Value</th><th>Gain/Loss</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderHoldingsTable() {
  const wrap = document.getElementById('holdings-table-wrap');
  if (!wrap) return;
  if (holdingsSubTab === 'dividends') wrap.innerHTML = renderHoldingsDividends();
  else if (holdingsSubTab === 'returns') wrap.innerHTML = renderHoldingsReturns();
  else wrap.innerHTML = renderHoldingsGeneral();
}

function renderHoldingsGeneral() {
  const holdings = ap().holdings || [];
  const totalVal = holdings.reduce((s,h) => s + (h.currentPrice||h.buyPrice)*h.shares, 0) + (ap().cash||0);
  const rows = holdings.map(h => {
    const price    = h.currentPrice || h.buyPrice;
    const val      = price * h.shares;
    const cost     = h.buyPrice * h.shares;
    // P&L = price gain only (dividends tracked separately in the Dividends tab)
    const gain     = val - cost;
    const gainPct  = cost ? gain / cost * 100 : 0;
    const portShare = totalVal ? val / totalVal * 100 : 0;
    // Show sector badge if known, otherwise asset class
    const sectorLabel = h.sector || SECTOR_DB[h.ticker] || h.assetClass;
    return `
      <tr class="holding-row" id="hrow-${h.id}" onclick="toggleHolding('${h.id}')">
        <td>
          <div class="holding-logo-wrap">
            <span class="holding-chevron" style="font-size:10px;color:var(--text3);flex-shrink:0;">▶</span>
            ${holdingLogoHtml(h)}
            <div>
              <button class="holding-logo-name-btn" onclick="event.stopPropagation();openCompanyModal('${h.ticker}')" title="View company info">${h.ticker}</button>
              <div style="font-size:10px;color:var(--text3);margin-top:1px;">${sectorLabel}</div>
            </div>
          </div>
        </td>
        <td class="muted" style="text-align:right;">${fmtShares(h.shares)}</td>
        <td style="text-align:right;">
          <div style="font-weight:600;">${eurPort(cost)}</div>
          <div style="font-size:11px;color:var(--text3);">${eurPort(h.buyPrice)}/sh</div>
        </td>
        <td style="text-align:right;">
          ${h.currentPrice ? `<div style="font-weight:600;">${eurPort(val)}</div><div style="font-size:11px;color:var(--text3);">${eurPort(h.currentPrice)}/sh${priceAgeBadge(h)}</div>` : '<span class="muted">—</span>'}
        </td>
        <td class="${h.dayChangePct != null && h.currentPrice ? (h.dayChangePct >= 0 ? 'up-text' : 'down-text') : ''}" style="font-weight:600;text-align:right;">
          ${h.dayChangePct != null && h.currentPrice
            ? `<div>${eurPort(val - val / (1 + h.dayChangePct / 100))}</div><div style="font-size:11px;">(${pct(h.dayChangePct)})</div>`
            : '<span class="muted">—</span>'}
        </td>
        <td class="${gain>=0?'up-text':'down-text'}" style="font-weight:600;text-align:right;">
          <div>${eurPort(gain)}</div>
          <div style="font-size:11px;">(${pct(gainPct)})</div>
        </td>
        <td style="text-align:right;color:var(--text2);font-size:12px;">${portShare.toFixed(1)}%</td>
        <td style="white-space:nowrap;">
          <button class="btn-ghost" onclick="event.stopPropagation();quickSell('${h.ticker}',${h.shares})" title="Record a sell" style="font-size:10px;padding:4px 8px;">Sell</button>
          <button class="del-btn" onclick="event.stopPropagation();delHolding('${h.id}')" title="Delete">✕</button>
        </td>
      </tr>
      <tr class="holding-detail" id="hdetail-${h.id}" style="display:none;">
        <td colspan="8">${lotsTableFor(h)}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">No holdings yet. Add one above!</td></tr>';

  return `<table class="data-table">
    <thead><tr>
      <th>Holding</th><th style="text-align:right;">Shares</th>
      <th style="text-align:right;">Cost Basis</th><th style="text-align:right;">Current Value</th>
      <th style="text-align:right;">Today</th>
      <th style="text-align:right;">Total Gain</th><th style="text-align:right;">% of Port.</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderHoldingsDividends() {
  const holdings = ap().holdings || [];
  const rows = holdings.map(h => {
    const val  = (h.currentPrice || h.buyPrice) * h.shares;
    const cost = h.buyPrice * h.shares;
    const dps  = h.dividendPerShare || 0;
    const annualDivs = dps * h.shares;
    const fwdYield   = h.forwardYield  ? (h.forwardYield  * 100).toFixed(2) + '%' : (dps && h.currentPrice ? (dps / h.currentPrice * 100).toFixed(2) + '%' : '—');
    const yieldOnCost = dps && cost ? (annualDivs / cost * 100).toFixed(2) + '%' : '—';
    const exDiv  = h.exDivDate  || null;
    const nextPay = h.nextPayDate || null;
    const nextEarnings = h.nextEarningsDate || null;
    const fmtD = d => {
      if (!d) return '<span class="muted">—</span>';
      const dt = new Date(d + 'T12:00:00Z');
      return dt.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
    };
    return `
      <tr class="holding-row" id="hrow-${h.id}" onclick="toggleHolding('${h.id}')">
        <td>
          <div class="holding-logo-wrap">
            <span class="holding-chevron" style="font-size:10px;color:var(--text3);flex-shrink:0;">▶</span>
            ${holdingLogoHtml(h)}
            <div>
              <button class="holding-logo-name-btn" onclick="event.stopPropagation();openCompanyModal('${h.ticker}')" title="View company info">${h.ticker}</button>
              ${h.sector ? `<div style="font-size:10px;color:var(--text3);margin-top:1px;">${h.sector}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="text-align:right;">${fmtShares(h.shares)}</td>
        <td style="text-align:right;font-weight:600;">${eurPort(val)}</td>
        <td style="text-align:right;">
          ${dps > 0 ? `<div class="up-text" style="font-weight:600;">${eurPort(annualDivs)}</div>
            <div style="font-size:11px;color:var(--text3);">${eurPort(dps)}/sh</div>` : '<span class="muted">—</span>'}
        </td>
        <td style="text-align:right;">
          <div style="font-weight:600;${dps>0?'color:var(--up)':''}">${fwdYield}</div>
          <div style="font-size:11px;color:var(--text3);">on cost: ${yieldOnCost}</div>
        </td>
        <td style="text-align:right;font-size:12px;color:var(--text2);">${fmtD(exDiv)}</td>
        <td style="text-align:right;font-size:12px;color:var(--text2);">${fmtD(nextPay)}</td>
        <td style="text-align:right;font-size:12px;color:var(--text2);">${fmtD(nextEarnings)}</td>
        <td style="text-align:right;">
          <button class="del-btn" onclick="event.stopPropagation();delHolding('${h.id}')" title="Delete">✕</button>
        </td>
      </tr>
      <tr class="holding-detail" id="hdetail-${h.id}" style="display:none;">
        <td colspan="9">${lotsTableFor(h)}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="9" class="empty">No holdings yet.</td></tr>';

  return `<table class="data-table">
    <thead><tr>
      <th>Holding</th><th style="text-align:right;">Shares</th><th style="text-align:right;">Value</th>
      <th style="text-align:right;">Annual Divs</th><th style="text-align:right;">Div Yield</th>
      <th style="text-align:right;">Ex-Div Date</th><th style="text-align:right;">Next Pay Date</th>
      <th style="text-align:right;">Next Earnings</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderHoldingsReturns() {
  const holdings = ap().holdings || [];
  const rows = holdings.map(h => {
    const price  = h.currentPrice || h.buyPrice;
    const val    = price * h.shares;
    const cost   = h.buyPrice * h.shares;
    const divs   = Number(h.dividends || 0);
    const gain   = val - cost + divs;
    const gainPct = cost ? gain / cost * 100 : 0;
    // Simple annualized return (CAGR) from earliest transaction
    const txs = (ap().transactions||[]).filter(t => t.ticker===h.ticker && t.type==='Buy');
    const earliestDate = txs.length ? txs.map(t => new Date(t.date)).reduce((a,b) => a < b ? a : b) : null;
    let annReturn = null;
    if (earliestDate && cost > 0) {
      const years = (Date.now() - earliestDate.getTime()) / (365.25 * 864e5);
      if (years > 0.05) annReturn = (Math.pow(val / cost, 1 / years) - 1) * 100;
    }
    return `
      <tr class="holding-row" id="hrow-${h.id}" onclick="toggleHolding('${h.id}')">
        <td>
          <div class="holding-logo-wrap">
            <span class="holding-chevron" style="font-size:10px;color:var(--text3);flex-shrink:0;">▶</span>
            ${holdingLogoHtml(h)}
            <div>
              <button class="holding-logo-name-btn" onclick="event.stopPropagation();openCompanyModal('${h.ticker}')" title="View company info">${h.ticker}</button>
              ${h.sector ? `<div style="font-size:10px;color:var(--text3);margin-top:1px;">${h.sector}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="text-align:right;">${fmtShares(h.shares)}</td>
        <td style="text-align:right;font-weight:600;">${eurPort(cost)}</td>
        <td style="text-align:right;font-weight:600;">${eurPort(val)}</td>
        <td class="${gain>=0?'up-text':'down-text'}" style="font-weight:600;text-align:right;">
          <div>${eurPort(gain)}</div><div style="font-size:11px;">(${pct(gainPct)})</div>
        </td>
        <td style="text-align:right;font-weight:600;${annReturn!==null?(annReturn>=0?'color:var(--up)':'color:var(--down)'):''}">
          ${annReturn !== null ? (annReturn >= 0 ? '+' : '') + annReturn.toFixed(2) + '%/yr' : '<span class="muted">—</span>'}
        </td>
        <td style="text-align:right;">
          <button class="del-btn" onclick="event.stopPropagation();delHolding('${h.id}')" title="Delete">✕</button>
        </td>
      </tr>
      <tr class="holding-detail" id="hdetail-${h.id}" style="display:none;">
        <td colspan="7">${lotsTableFor(h)}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No holdings yet.</td></tr>';

  return `<table class="data-table">
    <thead><tr>
      <th>Holding</th><th style="text-align:right;">Shares</th>
      <th style="text-align:right;">Cost Basis</th><th style="text-align:right;">Current Value</th>
      <th style="text-align:right;">Total Return</th><th style="text-align:right;">Annualized</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ══════════════ DIVIDEND ANALYSIS CHARTS ══════════════
function buildDividendCharts() {
  const holdings = (ap().holdings || []).filter(h => (h.dividendPerShare || 0) > 0);
  if (!holdings.length) return;

  // Stats
  const totalVal   = holdings.reduce((s, h) => s + (h.currentPrice||h.buyPrice)*h.shares, 0);
  const totalAnnDivs = holdings.reduce((s, h) => s + (h.dividendPerShare||0) * h.shares, 0);
  const portYield  = totalVal ? totalAnnDivs / totalVal * 100 : 0;
  const statsEl = document.getElementById('div-stats-grid');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="div-stat-card">
        <div class="div-stat-label">Portfolio Yield</div>
        <div class="div-stat-val up-text">${portYield.toFixed(2)}%</div>
        <div class="div-stat-sub">forward annual yield</div>
      </div>
      <div class="div-stat-card">
        <div class="div-stat-label">Annual Dividends</div>
        <div class="div-stat-val">${eur(totalAnnDivs)}</div>
        <div class="div-stat-sub">estimated income / year</div>
      </div>
      <div class="div-stat-card">
        <div class="div-stat-label">Monthly Average</div>
        <div class="div-stat-val">${eur(totalAnnDivs / 12)}</div>
        <div class="div-stat-sub">passive income estimate</div>
      </div>`;
  }

  // Yield bar chart
  destroyChart('div-yield');
  const yieldEl = document.getElementById('chart-div-yield');
  if (yieldEl) {
    const labels = holdings.map(h => h.ticker);
    const yields = holdings.map(h => {
      const price = h.currentPrice || h.buyPrice;
      return price ? parseFloat((h.dividendPerShare / price * 100).toFixed(2)) : 0;
    });
    charts['div-yield'] = new Chart(yieldEl.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{
        data: yields,
        backgroundColor: 'rgba(201,168,76,0.65)',
        borderColor: 'rgba(201,168,76,0.9)',
        borderWidth: 1,
        borderRadius: 4,
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => ` ${c.raw.toFixed(2)}% yield` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor(), font: { size: 11 } } },
          y: { grid: { color: gridColor() }, ticks: { color: textColor(), callback: v => v + '%' }, beginAtZero: true }
        }
      }
    });
  }

  // Passive income donut (weighted by annual dividend income)
  destroyChart('div-donut');
  const donutEl = document.getElementById('chart-div-donut');
  if (donutEl) {
    const labels = holdings.map(h => h.ticker);
    const data   = holdings.map(h => parseFloat(((h.dividendPerShare||0) * h.shares).toFixed(2)));
    const colors = labels.map(t => tickerColor(t));
    const total  = data.reduce((s,v) => s+v, 0) || 1;
    charts['div-donut'] = new Chart(donutEl.getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: isDark()?'#13131a':'#ede7d9' }] },
      options: { responsive: false, cutout: '60%',
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => ` ${c.label}: ${eur(c.raw)} (${(c.raw/total*100).toFixed(1)}%)` } } } }
    });
    const legendEl = document.getElementById('div-donut-legend');
    if (legendEl) legendEl.innerHTML = labels.map((l, i) =>
      `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${colors[i]};flex-shrink:0;"></div>
        <span style="flex:1;">${l}</span>
        <span style="font-weight:600;">${(data[i]/total*100).toFixed(1)}%</span>
      </div>`
    ).join('');
  }
}

// ══════════════ EXPENSES MONTH LOGIC ══════════════
// ── Portfolio history range ──────────────────────────────────────────────────
let portHistoryRange = 'All';

function setPortRange(range, btn) {
  portHistoryRange = range;
  document.querySelectorAll('#port-history-ranges .range-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  buildPortHistoryChart();
}

// ══════════════ SUB-VIEWS ══════════════
// Generic across tabs. Element ids are namespaced `psub-<tab>-<name>` and every
// query is scoped to the owning tab — Portfolio and Expenses both have an
// "Overview", so unscoped `#psub-overview` / `.psub-tab` lookups would grab the
// wrong element and clear the other tab's active state.
const subTab = { portfolio: 'overview', expenses: 'overview' };

// What to (re)build when a sub-view becomes visible. Chart builders already
// guard on `offsetParent`, so hidden panes cost nothing.
const SUB_BUILDERS = {
  portfolio: {
    overview:     () => { renderAllocationStats(); buildPortDonut(); buildPnlBar();
                          buildPortHistoryChart(); buildSectorChart(); buildReturnsCard(); },
    holdings:     () => renderHoldingsTable(),
    dividends:    () => refreshDividendsSection(),
    cash:         () => renderCashTable(),
    transactions: () => renderTransactions(),
  },
  // renderExpenses() is one pass that fills stats, charts, the list and the
  // allocation history together. Rather than carve up a working 170-line
  // function, the sub-views just control visibility and re-run it — charts
  // redraw correctly once their canvas is on screen.
  expenses: {
    overview:    () => renderExpenses(),
    logs:        () => renderExpenses(),
    allocations: () => renderExpenses(),
    import:      () => renderImportView(),
  },
};

function showSubView(tab, name, btn) {
  const root = document.getElementById('tab-' + tab);
  if (!root) return;
  subTab[tab] = name;

  root.querySelectorAll('.psub').forEach(d => d.classList.remove('active'));
  document.getElementById(`psub-${tab}-${name}`)?.classList.add('active');

  root.querySelectorAll('.psub-tab').forEach(b => b.classList.remove('active'));
  (btn || document.getElementById(`psub-tab-${tab}-${name}`))?.classList.add('active');

  try { SUB_BUILDERS[tab]?.[name]?.(); } catch(e) { console.error(`sub-view ${tab}/${name}:`, e); }
}

// Nav dropdown entry point: open a tab directly on one of its sub-views
function navToSub(tab, name) {
  showTab(tab, document.getElementById(`nav-${tab}-btn`));
  showSubView(tab, name);
}

// Kept so existing call sites and any saved state keep working
function showPortfolioSub(name, btn) { showSubView('portfolio', name, btn); }
function navToPortfolioSub(name)     { navToSub('portfolio', name); }

// Dividends sub-view: analysis + calendar + received log, with fresh data fetch
function refreshDividendsSection() {
  const apply = () => {
    const hasDivs = (ap().holdings || []).some(h => h.dividendPerShare > 0);
    const hasLog = (state.dividendLog || []).some(d => d.portfolioId === ap().id);
    const divCard = document.getElementById('div-analysis-card');
    const emptyEl = document.getElementById('psub-div-empty');
    if (divCard) { divCard.style.display = hasDivs ? '' : 'none'; if (hasDivs) buildDividendCharts(); }
    if (emptyEl) emptyEl.style.display = (hasDivs || hasLog) ? 'none' : '';
    renderDividendCalendar();
    renderReceivedDividends();
  };
  apply(); // paint immediately with cached data
  // force=true bypasses cooldowns so this section always gets fresh data
  autoFetchPortfolioMetadata(true).then(apply);
  syncDividendLog(true).then(changed => { if (changed) apply(); });
}

// ── Holdings sub-tab ────────────────────────────────────────────────────────
let holdingsSubTab = 'general'; // 'general' | 'dividends' | 'returns'

function setHoldingsSubTab(tab, btn) {
  holdingsSubTab = tab;
  document.querySelectorAll('.holdings-subtab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderHoldingsTable();

  if (tab === 'dividends') {
    // force=true bypasses the cooldown so user always gets fresh data on this tab
    autoFetchPortfolioMetadata(true).then(() => renderHoldingsTable());
  }
}

// ── Deterministic logo background color from ticker string ───────────────────
function tickerColor(ticker) {
  const COLORS = ['#4c8aaf','#c9a84c','#4caf82','#9b87f5','#e0965c','#5ccce0','#e05c5c','#a0d060','#c050f0','#f7931a'];
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

// Logo sources tried in order, per-img element.
// Stored as JSON in data-srcs. holdingLogoErr() walks through them on each failure.
function holdingLogoHtml(h) {
  const initial  = (h.ticker || '?')[0].toUpperCase();
  const bg       = tickerColor(h.ticker || '');
  const ticker   = (h.ticker || '').toUpperCase();

  // Build ordered list of logo URL candidates:
  // 1. Financial Modeling Prep — free, no key, high-quality for most US/major tickers
  // 2. Clearbit from Yahoo assetProfile (stored on holding after sector fetch)
  const srcs = [
    `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`,
    h.logoUrl || null,
  ].filter(Boolean);

  const srcsAttr = JSON.stringify(srcs).replace(/'/g, '&apos;');
  return `<img class="holding-logo" src="${srcs[0]}" alt="${ticker}"
    data-srcs='${srcsAttr}' data-src-idx="0"
    onerror="holdingLogoErr(this)">
    <div class="holding-logo-fb" style="background:${bg};display:none;">${initial}</div>`;
}

// Called each time an <img> src fails — walks through data-srcs until exhausted, then shows avatar.
function holdingLogoErr(img) {
  const srcs = JSON.parse(img.dataset.srcs || '[]');
  const idx  = parseInt(img.dataset.srcIdx || '0', 10) + 1;
  if (idx < srcs.length) {
    img.dataset.srcIdx = idx;
    img.src = srcs[idx]; // will trigger onerror again if this one also fails
  } else {
    // All sources failed — show the colored-initial fallback circle.
    // nextElementSibling (not nextSibling): whitespace between the tags is a
    // text node, which silently swallowed the style change.
    img.style.display = 'none';
    if (img.nextElementSibling) img.nextElementSibling.style.display = 'flex';
  }
}

// ── Benchmark ────────────────────────────────────────────────────────────────
const BENCHMARK_PRESETS = [
  { ticker: null,        name: 'None',           label: 'No comparison line' },
  { ticker: 'SPY',       name: 'S&P 500',        label: 'SPDR S&P 500 ETF (SPY)' },
  { ticker: 'QQQ',       name: 'NASDAQ 100',     label: 'Invesco QQQ Trust (QQQ)' },
  { ticker: 'IWM',       name: 'Russell 2000',   label: 'iShares Russell 2000 (IWM)' },
  { ticker: 'EXS1.DE',   name: 'Euro Stoxx 50',  label: 'iShares EuroStoxx 50 (EXS1)' },
  { ticker: 'VTI',       name: 'Total Market',   label: 'Vanguard Total Market (VTI)' },
  { ticker: 'GLD',       name: 'Gold',           label: 'SPDR Gold Shares (GLD)' },
  { ticker: 'AGG',       name: 'US Bonds',       label: 'iShares Core US Aggr. Bond (AGG)' },
];
let selectedBenchmarkTicker = 'SPY';
let selectedBenchmarkName   = 'S&P 500';

// ── Holdings perf range ───────────────────────────────────────────────────────
let hperfRange = '1M';

function setHperfRange(range, btn) {
  hperfRange = range;
  document.querySelectorAll('#hperf-ranges .range-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  buildHoldingsPerfChart();
}

function openBenchmarkModal() {
  const list = document.getElementById('benchmark-list');
  if (list) {
    list.innerHTML = BENCHMARK_PRESETS.map(b =>
      `<div class="benchmark-item${b.ticker === selectedBenchmarkTicker ? ' active' : ''}"
          onclick="selectBenchmark(${JSON.stringify(b.ticker)},${JSON.stringify(b.name)})">
        <div>
          <div class="bm-name">${b.name}</div>
          <div class="bm-ticker">${b.label}</div>
        </div>
        ${b.ticker === selectedBenchmarkTicker ? '<span style="color:var(--gold);font-size:16px;">✓</span>' : ''}
      </div>`
    ).join('');
  }
  document.getElementById('benchmark-overlay').classList.add('open');
}

function closeBenchmarkModal() {
  document.getElementById('benchmark-overlay').classList.remove('open');
}

function selectBenchmark(ticker, name) {
  selectedBenchmarkTicker = ticker;
  selectedBenchmarkName   = name;
  const label = document.getElementById('benchmark-name-label');
  if (label) label.textContent = name;
  closeBenchmarkModal();
  buildPortHistoryChart();
}

