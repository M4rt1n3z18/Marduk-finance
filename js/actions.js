// ══════════════ ACTIONS ══════════════
async function addHolding() {
  const ticker = document.getElementById('h-ticker').value.trim().toUpperCase();
  const type = document.getElementById('h-type').value;
  const assetClass = document.getElementById('h-class').value;
  const shares = parseFloat(document.getElementById('h-shares').value);
  const buyPriceRaw = parseFloat(document.getElementById('h-buy').value);
  const buyCurrency = document.getElementById('h-buy-currency').value || 'EUR';
  const buyDate = getDateRaw('h-date') || now.toISOString().slice(0,10);
  if (!ticker || isNaN(shares) || isNaN(buyPriceRaw) || shares <= 0 || buyPriceRaw <= 0) return;

  // Convert buy price to EUR using historical FX rate on the buy date
  let buyPrice = buyPriceRaw;
  let buyFxRate = null;
  if (buyCurrency !== 'EUR' && window.electronAPI?.fetchFxRate) {
    const btn = document.querySelector('.add-holding-grid .btn');
    if (btn) { btn.textContent = 'Converting…'; btn.disabled = true; }
    try {
      // fetchFxRate returns EUR{currency}=X rate (units of currency per 1 EUR)
      const rate = await window.electronAPI.fetchFxRate({ date: buyDate, fromCurrency: buyCurrency });
      if (rate && rate > 0) {
        buyFxRate = parseFloat(rate.toFixed(6));
        buyPrice  = parseFloat((buyPriceRaw / rate).toFixed(4)); // convert to EUR
      }
    } catch(e) { console.error('FX rate fetch failed:', e); }
    if (btn) { btn.textContent = 'Add'; btn.disabled = false; }
  }

  const port = ap();
  const existing = port.holdings.find(h => h.ticker === ticker);

  if (type === 'Sell') {
    if (!existing) { alert('No existing holding found for ' + ticker + ' to sell.'); return; }
    const newShares = parseFloat((existing.shares - shares).toFixed(6));
    if (newShares < 0) { alert('Cannot sell more shares than you hold (' + existing.shares + ').'); return; }
    if (newShares === 0) {
      port.holdings = port.holdings.filter(h => h.ticker !== ticker);
    } else {
      existing.shares = newShares;
    }
    port.transactions.push({ id:uid(), type:'Sell', ticker, shares, price:buyPrice, date:buyDate, notes:'via Sell' });
    // Proceeds go to uninvested cash (always in EUR since buyPrice is stored in EUR)
    if (!port.cashEntries) port.cashEntries = [];
    const proceeds = parseFloat((shares * buyPrice).toFixed(2));
    const eurEntry = port.cashEntries.find(e => e.currency === 'EUR');
    if (eurEntry) eurEntry.amount = parseFloat((eurEntry.amount + proceeds).toFixed(2));
    else port.cashEntries.push({ currency: 'EUR', amount: proceeds });
    port.cash = getCashTotalEur(); // keep legacy field in sync
  } else {
    // Buy — cost basis averaging
    if (existing) {
      const totalShares = existing.shares + shares;
      const avgPrice = (existing.buyPrice * existing.shares + buyPrice * shares) / totalShares;
      existing.shares = totalShares;
      existing.buyPrice = parseFloat(avgPrice.toFixed(4));
      port.transactions.push({ id:uid(), type:'Buy', ticker, shares, price:buyPrice, date:buyDate,
        priceOriginal: buyCurrency !== 'EUR' ? buyPriceRaw : undefined,
        priceCurrency: buyCurrency !== 'EUR' ? buyCurrency : undefined,
        notes: buyFxRate ? `avg cost basis updated (${buyCurrency} @ ${buyFxRate})` : 'avg cost basis updated' });
    } else {
      const sector = SECTOR_DB[ticker] || null;
      port.holdings.push({ id:uid(), ticker, assetClass, shares, buyPrice, buyDate,
        currentPrice:null, dividends:0, sector,
        buyCurrency: buyCurrency !== 'EUR' ? buyCurrency : undefined,
        buyPriceOriginal: buyCurrency !== 'EUR' ? buyPriceRaw : undefined,
        buyFxRate: buyFxRate || undefined
      });
      port.transactions.push({ id:uid(), type:'Buy', ticker, shares, price:buyPrice, date:buyDate,
        priceOriginal: buyCurrency !== 'EUR' ? buyPriceRaw : undefined,
        priceCurrency: buyCurrency !== 'EUR' ? buyCurrency : undefined,
        notes: buyFxRate ? `via Add Holding (${buyCurrency} ${buyPriceRaw} @ ${buyFxRate})` : 'via Add Holding' });
    }
  }

  document.getElementById('h-ticker').value = '';
  document.getElementById('h-shares').value = '';
  document.getElementById('h-buy').value = '';
  document.getElementById('h-buy-currency').value = 'EUR';
  updateBuyLabel();
  setDateField('h-date', now.toISOString().slice(0,10));
  setClassBadge('Stock');
  document.getElementById('ac-drop').classList.remove('open');
  save(); renderAll();
}

function quickSell(ticker, maxShares) {
  document.getElementById('h-type').value = 'Sell';
  const inp = document.getElementById('h-ticker');
  inp.value = ticker;
  acAutoDetect(inp);
  const sharesInp = document.getElementById('h-shares');
  sharesInp.value = '';
  sharesInp.placeholder = maxShares; // hint: max they can sell
  document.getElementById('h-buy').value = '';
  document.querySelector('.add-holding-grid').closest('.card')
    .scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => sharesInp.focus(), 300);
}

function delHolding(id) {
  const port = ap();
  const holding = port.holdings.find(h => h.id === id);
  if (!holding) return;
  if (!confirm(`Remove ${holding.ticker} holding and its transaction history?`)) return;
  port.holdings = port.holdings.filter(h => h.id !== id);
  port.transactions = port.transactions.filter(t => t.ticker !== holding.ticker);
  save(); renderAll();
}

function toggleHolding(id) {
  const row    = document.getElementById('hrow-' + id);
  const detail = document.getElementById('hdetail-' + id);
  if (!row || !detail) return;
  const isOpen = detail.style.display !== 'none';
  detail.style.display = isOpen ? 'none' : 'table-row';
  row.classList.toggle('open', !isOpen);
}

// Currency symbol helper for display — values are always stored in EUR internally
const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£', CHF: '₣', BRL: 'R$' };
// Exchange rates vs EUR (approximate fallbacks — refreshed from Yahoo on price fetch)
const FX_RATES = { EUR: 1, USD: 1.08, GBP: 0.86, CHF: 0.96, BRL: 5.5 };

function portCurrency() {
  return ap().currency || 'EUR';
}

function portFx() {
  return FX_RATES[portCurrency()] || 1;
}

function eurPort(val) {
  const sym = CURRENCY_SYMBOLS[portCurrency()] || '€';
  const converted = val * portFx();
  return sym + converted.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function setPortCurrency(val) {
  ap().currency = val;
  save(); renderPortfolio();
}

function addExpense() {
  const desc = document.getElementById('e-desc').value.trim();
  const amount = parseFloat(document.getElementById('e-amount').value);
  const cat = document.getElementById('e-cat').value;
  const date = getDateRaw('e-date') || now.toISOString().slice(0,10);
  const recurring = document.getElementById('e-recurring').checked;
  if (!desc || isNaN(amount) || amount <= 0) return;
  state.expenses.push({ id:uid(), desc, amount, cat, date, recurring });
  // Auto-reduce any credit liability whose keyword matches this expense description
  const descLower = desc.toLowerCase();
  state.liabilities.forEach(l => {
    if (l.isCredit && l.linkedKeyword && descLower.includes(l.linkedKeyword.toLowerCase())) {
      l.value = parseFloat(Math.max(0, l.value - amount).toFixed(2));
    }
  });
  document.getElementById('e-desc').value=''; document.getElementById('e-amount').value='';
  document.getElementById('e-recurring').checked = false;
  save(); renderAll(); checkRecurring();
}

function delExpense(id) { state.expenses = state.expenses.filter(e=>e.id!==id); save(); renderAll(); }

function addAsset() {
  const name = document.getElementById('a-name').value.trim();
  const value = parseFloat(document.getElementById('a-val').value);
  if (!name || isNaN(value) || value <= 0) return;
  state.assets.push({ id:uid(), name, value });
  document.getElementById('a-name').value = '';
  document.getElementById('a-val').value = '';
  save(); renderAll();
}

function delAsset(id) { state.assets = state.assets.filter(a=>a.id!==id); save(); renderAll(); }

function toggleCreditFields() {
  const isCredit = document.getElementById('l-type').value === 'credit';
  document.getElementById('l-credit-fields').style.display = isCredit ? 'block' : 'none';
}

function addLiab() {
  const name = document.getElementById('l-name').value.trim();
  const value = parseFloat(document.getElementById('l-val').value);
  if (!name || isNaN(value) || value <= 0) return;
  const isCredit = document.getElementById('l-type').value === 'credit';
  const liab = { id: uid(), name, value };
  if (isCredit) {
    const orig = parseFloat(document.getElementById('l-orig').value) || value;
    const instalment = parseFloat(document.getElementById('l-instalment').value) || 0;
    const keyword = document.getElementById('l-keyword').value.trim();
    Object.assign(liab, { isCredit: true, originalValue: orig, instalment, linkedKeyword: keyword });
    document.getElementById('l-orig').value = '';
    document.getElementById('l-instalment').value = '';
    document.getElementById('l-keyword').value = '';
  }
  state.liabilities.push(liab);
  document.getElementById('l-name').value = '';
  document.getElementById('l-val').value = '';
  document.getElementById('l-type').value = 'regular';
  toggleCreditFields();
  save(); renderAll();
}

function delLiab(id) { state.liabilities = state.liabilities.filter(l=>l.id!==id); save(); renderAll(); }

function updateLiabBalance(id, val) {
  const l = state.liabilities.find(l => l.id === id);
  if (!l) return;
  l.value = Math.max(0, parseFloat(val) || 0);
  save(); renderNetWorth();
}

function setBudget(cat, val) {
  state.budgets = state.budgets.map(b => b.cat===cat ? {...b,limit:parseFloat(val)||0} : b);
  save(); renderBudget();
}

function delTransaction(id) {
  // Find which portfolio owns this transaction
  const port = (state.portfolios||[]).find(p => p.transactions?.find(t => t.id === id));
  if (!port) return;
  const tx = port.transactions.find(t => t.id === id);
  if (!tx) return;
  port.transactions = port.transactions.filter(t => t.id !== id);

  // Recalculate the holding for this ticker from remaining transactions
  const ticker = tx.ticker;
  const remaining = port.transactions.filter(t => t.ticker === ticker);
  const buys  = remaining.filter(t => t.type === 'Buy');
  const sells = remaining.filter(t => t.type === 'Sell');
  const netShares = buys.reduce((s,t)=>s+t.shares,0) - sells.reduce((s,t)=>s+t.shares,0);

  if (netShares <= 0 || buys.length === 0) {
    port.holdings = port.holdings.filter(h => h.ticker !== ticker);
  } else {
    const totalCost = buys.reduce((s,t) => s + t.shares * t.price, 0);
    const avgPrice  = totalCost / buys.reduce((s,t) => s + t.shares, 0);
    const holding   = port.holdings.find(h => h.ticker === ticker);
    if (holding) {
      holding.shares   = parseFloat(netShares.toFixed(6));
      holding.buyPrice = parseFloat(avgPrice.toFixed(4));
    }
  }
  save(); renderAll();
}

function renderTransactions() {
  const sorted = [...(ap().transactions||[])].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / TX_PER_PAGE));
  txPage = Math.max(0, Math.min(txPage, pages - 1));
  const slice = sorted.slice(txPage * TX_PER_PAGE, (txPage + 1) * TX_PER_PAGE);

  document.getElementById('tx-body').innerHTML = slice.map(t => {
    const isBuy = t.type==='Buy';
    return `<tr>
      <td><span class="badge ${isBuy?'buy':'sell'}">${t.type}</span></td>
      <td style="font-weight:700;color:var(--gold);">${t.ticker}</td>
      <td class="muted">${t.shares}</td>
      <td>${eur(t.price)}</td>
      <td class="muted">${t.date}</td>
      <td class="muted">${t.notes||'—'}</td>
      <td><button class="del-btn" onclick="delTransaction('${t.id}')">✕</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No transactions logged yet.</td></tr>';

  const pagination = document.getElementById('tx-pagination');
  const pageInfo   = document.getElementById('tx-page-info');
  if (total > TX_PER_PAGE) {
    pagination.style.display = 'flex';
    const from = txPage * TX_PER_PAGE + 1;
    const to   = Math.min((txPage + 1) * TX_PER_PAGE, total);
    pageInfo.textContent = `${from}–${to} of ${total}`;
    document.getElementById('tx-prev').disabled = txPage === 0;
    document.getElementById('tx-next').disabled = txPage >= pages - 1;
  } else {
    pagination.style.display = 'none';
  }
}

function _recurringMonthKey() {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

function checkRecurring() {
  const recurring = state.expenses.filter(e=>e.recurring);
  if (!recurring.length) { document.getElementById('recurring-banner').style.display='none'; return; }
  const thisMonthExpenses = state.expenses.filter(e=>{
    const ed=new Date(e.date); return ed.getMonth()===now.getMonth()&&ed.getFullYear()===now.getFullYear();
  });
  const monthKey = _recurringMonthKey();
  const dismissed = (state.dismissedRecurring || {})[monthKey] || [];
  const pending = recurring.filter(r => {
    const lastDate = new Date(r.date);
    return !(lastDate.getMonth()===now.getMonth() && lastDate.getFullYear()===now.getFullYear()) &&
      !thisMonthExpenses.find(e=>e.desc===r.desc&&e.recurring) &&
      !dismissed.includes(r.id);
  });
  const unique = [...new Map(pending.map(r=>[r.desc,r])).values()];
  if (!unique.length) { document.getElementById('recurring-banner').style.display='none'; return; }
  document.getElementById('recurring-banner').style.display='block';

  const listEl = document.getElementById('recurring-list');
  listEl.innerHTML = '';
  unique.forEach(r => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);';
    row.innerHTML = `
      <span style="flex:1;font-size:13px;">${r.desc}</span>
      <span class="muted" style="font-size:12px;">${r.cat}</span>
      <span style="font-weight:600;">${eur(r.amount)}</span>`;

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-ghost';
    addBtn.style.cssText = 'font-size:11px;padding:4px 10px;';
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', () => addOneRecurring(r.id));

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn-ghost';
    dismissBtn.style.cssText = 'font-size:11px;padding:4px 8px;color:var(--text3);border-color:transparent;';
    dismissBtn.title = 'Skip this month';
    dismissBtn.textContent = '✕';
    dismissBtn.addEventListener('click', () => dismissRecurring(r.id));

    row.appendChild(addBtn);
    row.appendChild(dismissBtn);
    listEl.appendChild(row);
  });
}

function dismissRecurring(sourceId) {
  const monthKey = _recurringMonthKey();
  if (!state.dismissedRecurring) state.dismissedRecurring = {};
  if (!state.dismissedRecurring[monthKey]) state.dismissedRecurring[monthKey] = [];
  if (!state.dismissedRecurring[monthKey].includes(sourceId)) {
    state.dismissedRecurring[monthKey].push(sourceId);
  }
  // Prune old months to keep state lean
  const keys = Object.keys(state.dismissedRecurring);
  keys.forEach(k => { if (k !== monthKey) delete state.dismissedRecurring[k]; });
  save();
  checkRecurring();
}

function addOneRecurring(sourceId) {
  const src = state.expenses.find(e=>e.id===sourceId);
  if (!src) return;
  state.expenses.push({ id:uid(), desc:src.desc, amount:src.amount, cat:src.cat, date:now.toISOString().slice(0,10), recurring:true });
  save(); renderExpenses(); renderOverview(); checkRecurring();
}

function addAllRecurring() {
  const recurring = state.expenses.filter(e=>e.recurring);
  const unique = [...new Map(recurring.map(r=>[r.desc,r])).values()];
  const thisMonthExpenses = state.expenses.filter(e=>{
    const ed=new Date(e.date); return ed.getMonth()===now.getMonth()&&ed.getFullYear()===now.getFullYear();
  });
  const monthKey = _recurringMonthKey();
  const dismissed = (state.dismissedRecurring || {})[monthKey] || [];
  unique.forEach(r => {
    if (!thisMonthExpenses.find(e=>e.desc===r.desc&&e.recurring) && !dismissed.includes(r.id)) {
      state.expenses.push({ id:uid(), desc:r.desc, amount:r.amount, cat:r.cat, date:now.toISOString().slice(0,10), recurring:true });
    }
  });
  save(); renderAll(); checkRecurring();
}

function snapshotNetWorth() {
  const ps = totalPortfolioStats();
  const totalA = state.assets.reduce((s,a)=>s+Number(a.value),0) + ps.val;
  const totalL = state.liabilities.reduce((s,l)=>s+Number(l.value),0);
  const nw = Math.round(totalA - totalL); // round to avoid float churn
  const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  if (!state.nwHistory) state.nwHistory = [];  // migration guard for old saves
  const existing = state.nwHistory.findIndex(s=>s.month===key);
  if (existing >= 0) {
    if (Math.round(state.nwHistory[existing].value) === nw) return; // no change — skip save
    state.nwHistory[existing].value = nw;
  } else {
    state.nwHistory.push({ month:key, value:nw });
  }
  save(); // only save when the snapshot value actually changed
}

// ══════════════ PRICE REFRESH ══════════════
async function refreshPrices(silent = false) {
  const allPorts = state.portfolios || [];
  const hasAny = allPorts.some(p => (p.holdings||[]).length > 0);
  if (!hasAny) return;
  const btn = document.getElementById('refresh-btn');
  if (!silent) { btn.textContent = '↻ Refreshing…'; btn.disabled = true; }
  else { btn.textContent = '↻ Updating…'; btn.disabled = true; }

  const tickers = [...new Set(allPorts.flatMap(p => (p.holdings||[]).map(h=>h.ticker)))];
  let fetchedCount = 0;
  try {
    const prices = await window.electronAPI.fetchPrices(tickers);
    for (const [ticker, data] of Object.entries(prices)) {
      if (data && data.price) {
        for (const port of allPorts) {
          port.holdings = (port.holdings||[]).map(h => h.ticker===ticker ? {...h, currentPrice: data.price, dayChangePct: data.dayChangePct ?? null} : h);
        }
        fetchedCount++;
      }
    }
  } catch(e) { console.error('fetchPrices error:', e); }
  if (fetchedCount > 0) snapshotPortfolio();

  // Sectors + dividends are handled by autoFetchPortfolioMetadata (has cooldown guard)
  autoFetchPortfolioMetadata();

  const ts = new Date().toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
  if (fetchedCount === 0 && !silent) {
    btn.textContent = `↻ No prices fetched`;
    btn.style.color = 'var(--down)';
    setTimeout(() => { btn.textContent = '↻ Refresh Prices'; btn.style.color = ''; }, 5000);
  } else {
    btn.textContent = `↻ ${ts}`;
    btn.style.color = '';
  }
  btn.disabled = false;

  // Reset the auto-refresh countdown after every refresh (manual or automatic)
  _resetAutoRefreshCountdown();

  save(); renderAll();
}

// ══════════════ AUTO-REFRESH ══════════════
const AUTO_REFRESH_MS = 60 * 1000; // 1 minute
let _arInterval   = null; // price-fetch interval
let _arTick       = null; // 1-second countdown tick
let _arNextAt     = 0;    // timestamp of next scheduled refresh

function _resetAutoRefreshCountdown() {
  _arNextAt = Date.now() + AUTO_REFRESH_MS;
}

function _updateLiveIndicator() {
  const el = document.getElementById('live-countdown');
  if (!el) return;
  const remaining = Math.max(0, Math.round((_arNextAt - Date.now()) / 1000));
  const mins = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, '0');
  el.textContent = `${mins}:${secs}`;
}

function startAutoRefresh() {
  // Clear any previous timers (safe to call multiple times)
  if (_arInterval) clearInterval(_arInterval);
  if (_arTick)     clearInterval(_arTick);

  _resetAutoRefreshCountdown();

  // Fire a price refresh every 5 minutes
  _arInterval = setInterval(() => refreshPrices(true), AUTO_REFRESH_MS);

  // Update the on-screen countdown every second
  _arTick = setInterval(_updateLiveIndicator, 1000);
  _updateLiveIndicator(); // paint immediately
}

// ══════════════ BACKGROUND METADATA FETCH ══════════════
// Silently fetches sectors + dividends for any holdings that are missing them.
// Runs on portfolio tab open, Dividends sub-tab click, and after refreshPrices().
// Cooldown prevents double-run within 5 min (e.g. startup + tab switch).
// Pass force=true (from Dividends sub-tab) to skip cooldown.
let _metaFetchRunning = false;
let _metaFetchLastRun = 0;
const META_FETCH_COOLDOWN = 5 * 60 * 1000;

async function autoFetchPortfolioMetadata(force = false) {
  if (!window.electronAPI || _metaFetchRunning) return;
  if (!force && Date.now() - _metaFetchLastRun < META_FETCH_COOLDOWN) return;
  const allPorts = state.portfolios || [];
  const allHoldings = allPorts.flatMap(p => p.holdings || []);
  if (!allHoldings.length) return;
  _metaFetchRunning = true;
  _metaFetchLastRun = Date.now();

  // ── 1. Sector + logo for holdings that still lack them ─────────────────────
  try {
    const needMeta = allHoldings
      .filter(h => { const c = guessAssetClass(h.ticker) !== 'Stock' ? guessAssetClass(h.ticker) : h.assetClass; return (!h.sector || !h.logoUrl) && c !== 'Crypto'; })
      .map(h => h.ticker);
    const unique = [...new Set(needMeta)];
    if (unique.length && window.electronAPI.fetchSectors) {
      const sectors = await window.electronAPI.fetchSectors(unique);
      if (sectors && Object.keys(sectors).length) {
        for (const port of allPorts) {
          port.holdings = (port.holdings || []).map(h => {
            const info = sectors[h.ticker];
            if (!info) return h;
            const sector  = typeof info === 'string' ? info : (info.sector  || h.sector);
            const logoUrl = typeof info === 'object'  ? (info.logoUrl || h.logoUrl) : h.logoUrl;
            return { ...h, ...(sector && { sector }), ...(logoUrl && { logoUrl }) };
          });
        }
        save(); buildSectorChart(); renderHoldingsTable();
      }
    }
  } catch(e) {}

  // ── 2. Dividends + earnings dates for ALL holdings (refresh each session) ────
  try {
    const tickers = [...new Set(allHoldings.map(h => h.ticker))];
    if (tickers.length && window.electronAPI.fetchDividends) {
      const divMap = await window.electronAPI.fetchDividends(tickers);
      if (divMap && Object.keys(divMap).length) {
        let changed = false;
        for (const port of allPorts) {
          port.holdings = (port.holdings || []).map(h => {
            const info = divMap[h.ticker];
            if (!info) return h; // no response at all — network error, skip
            changed = true;
            const dps = typeof info === 'number' ? info : (info.dps || 0);
            return {
              ...h,
              dividendPerShare:  dps,
              forwardYield:      info.forwardYield  ?? h.forwardYield  ?? null,
              trailingYield:     info.trailingYield ?? h.trailingYield ?? null,
              exDivDate:         info.exDivDate     ?? h.exDivDate     ?? null,
              nextPayDate:       info.nextPayDate   ?? h.nextPayDate   ?? null,
              nextEarningsDate:  info.nextEarningsDate ?? h.nextEarningsDate ?? null,
              earningsDateEnd:   info.earningsDateEnd  ?? h.earningsDateEnd  ?? null,
            };
          });
        }
        if (changed) { save(); renderHoldingsTable(); }
      }
    }
  } catch(e) {}

  _metaFetchRunning = false;
}

// ══════════════ EXPORT / IMPORT ══════════════
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'marduk-backup.json';
  a.click();
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = e => {
    const fr = new FileReader();
    fr.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        const required = ['expenses','assets','liabilities','budgets'];
        const missing = required.filter(k => !Array.isArray(imported[k]));
        if (missing.length) { alert('Invalid file: missing sections: ' + missing.join(', ')); return; }
        if (!Array.isArray(imported.portfolios) && !Array.isArray(imported.holdings)) {
          alert('Invalid file: missing portfolio data.'); return;
        }
        if (!confirm('This will replace ALL current data with the imported file. Are you sure?')) return;
        state = imported;
        save(); renderAll();
        alert('Data imported successfully!');
      } catch(e) { alert('Invalid file: could not read JSON. Make sure you are importing a MARDUK backup file.'); }
    };
    fr.readAsText(e.target.files[0]);
  };
  input.click();
}

