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
    // New money invested — consume open investment allocations (FIFO)
    consumeAllocations(port.id, parseFloat((shares * buyPrice).toFixed(2)));
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
    _fxStatus = prices._fx || null; // FX provenance — drives the stale-rate warning
    for (const [ticker, data] of Object.entries(prices)) {
      if (data && data.price) {
        for (const port of allPorts) {
          port.holdings = (port.holdings||[]).map(h => h.ticker===ticker ? {...h,
            currentPrice: data.price,
            dayChangePct: data.dayChangePct ?? null,
            // Which rate produced currentPrice — lets a bad value be diagnosed later
            currentPriceNative: data.priceNative ?? null,
            priceCurrency: data.priceCurrency ?? null,
            fxRateUsed: data.fxRate ?? null
          } : h);
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
// Cadence follows market hours. Prices don't move when exchanges are shut, so
// polling then only burns Yahoo's rate limits (HTTP 429), which in turn breaks
// the richer endpoints (company info, earnings, analyst data).
//
// The window is deliberately coarse — one Lisbon-time band spanning Euronext /
// Xetra open through the US close — instead of per-exchange trading calendars
// with holidays, which carry a maintenance tail for very little gain. Worst
// case on a market holiday is a day of polling a closed exchange: harmless.
const REFRESH_OPEN_MS  =  5 * 60 * 1000;  // exchanges open
const REFRESH_QUIET_MS = 60 * 60 * 1000;  // weekday, outside trading hours
const MARKET_TZ        = 'Europe/Lisbon';
const MARKET_OPEN_MIN  =  8 * 60;         // 08:00 — Euronext Lisbon / Xetra
const MARKET_CLOSE_MIN = 21 * 60 + 30;    // 21:30 — after the NYSE close

let _fxStatus = null; // { source, date, stale, ageMs } from the last price fetch
let _arTimer  = null; // next scheduled price fetch (self-rescheduling timeout)
let _arTick   = null; // 1-second countdown tick
let _arNextAt = 0;    // timestamp of next refresh (0 = none scheduled)

// Built once — this runs every second from the countdown tick
const _mktFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: MARKET_TZ, weekday: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

// 'open' | 'quiet' | 'weekend', in market-local time — not the machine's timezone,
// so it stays correct for users running MARDUK outside Portugal.
function marketPhase(now = new Date()) {
  const parts = _mktFmt.formatToParts(now);
  const get = t => parts.find(p => p.type === t)?.value;
  const day = get('weekday');
  if (day === 'Sat' || day === 'Sun') return 'weekend';
  const mins = Number(get('hour')) * 60 + Number(get('minute'));
  return (mins >= MARKET_OPEN_MIN && mins < MARKET_CLOSE_MIN) ? 'open' : 'quiet';
}

// null = don't poll at all (weekend)
function refreshIntervalMs() {
  const phase = marketPhase();
  if (phase === 'weekend') return null;
  return phase === 'open' ? REFRESH_OPEN_MS : REFRESH_QUIET_MS;
}

// A self-rescheduling timeout rather than setInterval — the delay changes as the
// market opens and closes, so each hop re-reads the current phase.
function _resetAutoRefreshCountdown() {
  if (_arTimer) clearTimeout(_arTimer);
  const ms = refreshIntervalMs();

  if (ms == null) {                    // weekend — idle, but keep checking back
    _arNextAt = 0;                     // so Monday morning resumes on its own
    _arTimer = setTimeout(_resetAutoRefreshCountdown, REFRESH_QUIET_MS);
    return;
  }

  _arNextAt = Date.now() + ms;
  _arTimer = setTimeout(() => {
    refreshPrices(true);               // async — reschedules again when it finishes
    _resetAutoRefreshCountdown();      // …but re-arm now, so an early return can't
  }, ms);                              // break the chain
}

function _updateLiveIndicator() {
  const el = document.getElementById('live-countdown');
  if (!el) return;
  const phase = marketPhase();

  // A stale FX rate outranks the market phase — foreign holdings are being shown
  // at an old rate, and that's worth more of your attention than the countdown.
  const fxStale = _fxStatus && _fxStatus.stale;
  const dot = document.getElementById('live-dot');
  if (dot) dot.style.color = fxStale ? 'var(--gold)' : (phase === 'open' ? 'var(--up)' : 'var(--text3)');
  if (el.parentElement) el.parentElement.title = fxStale
    ? `Exchange rate unavailable — foreign holdings shown at the last known rate`
      + (_fxStatus.date ? ` (${_fxStatus.source} ${_fxStatus.date})` : '')
    : phase === 'open'  ? 'Markets open — next automatic price refresh'
    : phase === 'quiet' ? 'Markets closed — refreshing hourly'
    :                     'Weekend — automatic refresh paused';

  if (fxStale)             { el.textContent = 'FX stale'; return; }
  if (phase === 'weekend') { el.textContent = 'closed';   return; }
  const remaining = Math.max(0, Math.round((_arNextAt - Date.now()) / 1000));
  const mins = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, '0');
  el.textContent = `${mins}:${secs}`;
}

function startAutoRefresh() {
  // Clear any previous timers (safe to call multiple times)
  if (_arTimer) clearTimeout(_arTimer);
  if (_arTick)  clearInterval(_arTick);

  _resetAutoRefreshCountdown();

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

// ══════════════ INVESTMENT ALLOCATIONS ══════════════
// InvestmentAllocation entity: { id, portfolioId, amountAllocated, amountInvested,
//   allocationDate, status: 'open'|'used', notes, createdAt, updatedAt }
// remainingAmount is always derived: amountAllocated - amountInvested.
// Allocations reserve money for investing (reduce monthly remaining budget) and
// are consumed FIFO whenever new Buy transactions are recorded on the portfolio.

const _round2 = n => Math.round(n * 100) / 100;

function allocationsFor(portfolioId) {
  return (state.allocations || []).filter(a => a.portfolioId === portfolioId);
}

function allocationTotals(portfolioId) {
  const list = allocationsFor(portfolioId);
  const allocated = _round2(list.reduce((s, a) => s + a.amountAllocated, 0));
  const invested  = _round2(list.reduce((s, a) => s + a.amountInvested, 0));
  return {
    allocated,
    invested,
    remaining: _round2(Math.max(0, allocated - invested)),
    excess: _round2((state.unallocatedInvestment || {})[portfolioId] || 0),
  };
}

// Total allocated in a budget month (respects paycheckDay, like expenses)
function allocationTotalForMonth(monthKey) {
  return _round2((state.allocations || [])
    .filter(a => expenseBelongsToMonth({ date: a.allocationDate }, monthKey))
    .reduce((s, a) => s + a.amountAllocated, 0));
}

// Consume open allocations FIFO with newly invested EUR.
// Remaining allocation never goes negative — any excess is tracked separately
// as "Unallocated Investment" for that portfolio.
function consumeAllocations(portfolioId, amountEur) {
  if (!amountEur || amountEur <= 0) return;
  if (!state.allocations) state.allocations = [];
  let rem = _round2(amountEur);
  const open = state.allocations
    .filter(a => a.portfolioId === portfolioId && a.status === 'open')
    .sort((a, b) => (a.allocationDate || '').localeCompare(b.allocationDate || ''));
  const nowIso = new Date().toISOString();
  for (const a of open) {
    if (rem <= 0) break;
    const available = _round2(a.amountAllocated - a.amountInvested);
    if (available <= 0) { a.status = 'used'; continue; }
    const used = Math.min(available, rem);
    a.amountInvested = _round2(a.amountInvested + used);
    a.updatedAt = nowIso;
    if (a.amountAllocated - a.amountInvested < 0.005) {
      a.amountInvested = a.amountAllocated;
      a.status = 'used';
    }
    rem = _round2(rem - used);
  }
  if (rem > 0.005) {
    if (!state.unallocatedInvestment) state.unallocatedInvestment = {};
    state.unallocatedInvestment[portfolioId] = _round2((state.unallocatedInvestment[portfolioId] || 0) + rem);
  }
}

// Earliest open-allocation date for a portfolio (used to ignore historical
// buys in bulk imports — money invested before any allocation existed should
// not consume allocations or count as unallocated excess).
function earliestOpenAllocationDate(portfolioId) {
  const open = (state.allocations || []).filter(a => a.portfolioId === portfolioId && a.status === 'open');
  if (!open.length) return null;
  return open.map(a => a.allocationDate).sort()[0];
}

function addAllocation() {
  const amount = parseFloat(document.getElementById('al-amount').value);
  const portfolioId = document.getElementById('al-port').value;
  const date = getDateRaw('al-date') || now.toISOString().slice(0, 10);
  const notes = document.getElementById('al-note').value.trim() || null;

  if (isNaN(amount) || amount <= 0) { alert('Enter a valid amount to allocate.'); return; }
  if (!portfolioId || !(state.portfolios || []).find(p => p.id === portfolioId)) {
    alert('Select a target portfolio.'); return;
  }

  if (!state.allocations) state.allocations = [];
  const nowIso = new Date().toISOString();
  state.allocations.push({
    id: uid(), portfolioId,
    amountAllocated: _round2(amount),
    amountInvested: 0,
    allocationDate: date,
    status: 'open',
    notes,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  document.getElementById('al-amount').value = '';
  document.getElementById('al-note').value = '';
  save(); renderExpenses(); renderBudget(); renderPortfolio();
  const pname = (state.portfolios.find(p => p.id === portfolioId) || {}).name || 'portfolio';
  showToast(`✓ ${eur(amount)} allocated to ${pname}`);
}

function delAllocation(id) {
  const a = (state.allocations || []).find(x => x.id === id);
  if (!a) return;
  const msg = a.amountInvested > 0
    ? `Delete this allocation? ${eur(a.amountInvested)} of it was already marked as invested — that history will be lost.`
    : 'Delete this allocation?';
  if (!confirm(msg)) return;
  state.allocations = state.allocations.filter(x => x.id !== id);
  save(); renderExpenses(); renderBudget(); renderPortfolio();
}

// ══════════════ BACKUPS UI ══════════════
async function openBackupsModal() {
  const modal = document.getElementById('backups-modal');
  const list = document.getElementById('backups-list');
  list.innerHTML = '<div class="muted" style="font-size:12px;padding:10px 0;">Loading…</div>';
  modal.style.display = 'flex';
  const backups = (await window.electronAPI?.listBackups?.()) || [];
  if (!backups.length) {
    list.innerHTML = '<div class="empty" style="padding:20px 0;">No backups yet — one is created automatically each day you use Marduk.</div>';
    return;
  }
  list.innerHTML = '';
  backups.forEach(b => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid var(--border);';
    row.innerHTML = `<span style="flex:1;font-size:13px;font-weight:600;">${b.date}</span>
      <span class="muted" style="font-size:12px;">${b.sizeKb} KB</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn-ghost';
    btn.style.cssText = 'font-size:11px;padding:4px 12px;';
    btn.textContent = 'Restore';
    btn.addEventListener('click', () => restoreBackup(b.name, b.date));
    row.appendChild(btn);
    list.appendChild(row);
  });
}

function closeBackupsModal() {
  document.getElementById('backups-modal').style.display = 'none';
}

async function restoreBackup(name, date) {
  if (!confirm(`Restore the backup from ${date}?\n\nYour current data will be replaced with that day's snapshot.`)) return;
  const content = await window.electronAPI?.readBackup?.(name);
  if (!content) { alert('Could not read that backup file.'); return; }
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.expenses) && !Array.isArray(parsed.portfolios)) {
      alert('That backup file does not look like Marduk data.'); return;
    }
    state = parsed;
    save();
    syncCats();
    renderAll();
    checkRecurring();
    closeBackupsModal();
    showToast(`✓ Backup from ${date} restored`);
  } catch (e) {
    alert('Backup file is corrupted and could not be restored.');
  }
}

// ══════════════ AI EXPENSE CATEGORIZATION ══════════════
// When the user finishes typing a description: first try to match a past
// expense with the same description (free, instant); if none and an AI key is
// configured, ask Claude to pick the category.
let _aiCatBusy = false;

function _localCategoryMatch(desc) {
  const d = desc.toLowerCase().trim();
  if (d.length < 3) return null;
  // Most recent expense whose description matches (either direction)
  const past = [...state.expenses]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .find(e => {
      const ed = (e.desc || '').toLowerCase().trim();
      return ed === d || ed.includes(d) || d.includes(ed);
    });
  return past ? past.cat : null;
}

function _applyCategorySuggestion(cat) {
  const sel = document.getElementById('e-cat');
  if (!sel || !cat || !CATS.includes(cat) || sel.value === cat) return;
  sel.value = cat;
  sel.style.borderColor = 'var(--gold)';
  setTimeout(() => { sel.style.borderColor = ''; }, 900);
}

function initAiCategorize() {
  const descInput = document.getElementById('e-desc');
  if (!descInput || descInput.dataset.aiWired) return;
  descInput.dataset.aiWired = '1';
  descInput.addEventListener('change', async () => {
    const desc = descInput.value.trim();
    if (!desc) return;
    // 1. Local history match — free and instant
    const local = _localCategoryMatch(desc);
    if (local) { _applyCategorySuggestion(local); return; }
    // 2. AI suggestion (only if a key is configured)
    if (_aiCatBusy || !window.electronAPI?.aiCategorize) return;
    _aiCatBusy = true;
    try {
      const cat = await window.electronAPI.aiCategorize({ desc, categories: CATS });
      // Only apply if the user hasn't cleared/changed the description meanwhile
      if (cat && descInput.value.trim() === desc) _applyCategorySuggestion(cat);
    } catch (e) {}
    _aiCatBusy = false;
  });
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

