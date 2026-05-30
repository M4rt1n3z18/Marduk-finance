// ══════════════ CSV EXPORT ══════════════
// ══════════════ XTB EXCEL IMPORT ══════════════
async function importXtbExcel() {
  if (!window.electronAPI?.importXtbExcel) {
    alert('XTB import is only available in the desktop app.');
    return;
  }
  try {
    const positions = await window.electronAPI.importXtbExcel();
    if (!positions) return; // user cancelled file picker
    if (!positions.length) {
      alert('No open positions found in that file. Make sure you exported "Open Positions" from XTB.');
      return;
    }

    const port = ap();
    if (!port.transactions) port.transactions = [];

    // ── Filter valid positions ─────────────────────────────────────────────
    const validPositions = positions.filter(pos => pos.ticker && pos.shares > 0);
    if (!validPositions.length) { alert('No valid positions found in that file.'); return; }

    // ── Transaction fingerprint for deduplication ──────────────────────────
    // Uses native price (priceOriginal) to avoid FX rounding skew between imports
    const makeFP = (ticker, date, shares, price) =>
      `${ticker}|${date}|${Math.round(shares * 10000)}|${Math.round(price * 100)}`;

    // Build fingerprint set from existing XTB transactions
    const existingFPs = new Set(
      port.transactions
        .filter(t => t.notes === 'XTB import')
        .map(t => makeFP(t.ticker, t.date, t.shares, t.priceOriginal ?? t.price))
    );

    // Classify incoming positions: new vs already-imported
    const newPositions = validPositions.filter(pos =>
      !existingFPs.has(makeFP(pos.ticker, pos.date, pos.shares, pos.price))
    );
    const duplicateCount = validPositions.length - newPositions.length;

    // ── Determine import mode: 'smart' | 'replace' ────────────────────────
    const existingXtb = port.holdings.filter(h => h.importedFromXtb);
    let importMode;

    if (existingXtb.length > 0) {
      if (newPositions.length === 0) {
        alert(`All ${validPositions.length} transaction(s) in this file are already imported. Nothing new to add.`);
        return;
      }
      // Primary dialog: Smart Update
      const doSmartUpdate = confirm(
        `Smart Update found ${newPositions.length} new transaction(s)` +
        (duplicateCount > 0 ? ` (${duplicateCount} already imported, skipped)` : '') + '.\n\n' +
        'OK → Smart Update: add only the new transactions\n' +
        'Cancel → Choose a different option…'
      );
      if (doSmartUpdate) {
        importMode = 'smart';
      } else {
        // Secondary dialog: Full Replace or Abort
        const doReplace = confirm(
          'Full Replace?\n\n' +
          'OK → Clear all existing XTB data and re-import everything from this file\n' +
          'Cancel → Abort — do not import anything'
        );
        if (!doReplace) return; // truly abort
        importMode = 'replace';
      }
    } else {
      // No existing XTB data — import everything as a first-time import
      importMode = 'replace';
    }

    // ── For Full Replace: clear existing XTB holdings and transactions first ─
    if (importMode === 'replace') {
      const xtbTickers = new Set(existingXtb.map(h => h.ticker));
      port.holdings    = port.holdings.filter(h => !h.importedFromXtb);
      port.transactions = port.transactions.filter(
        t => !(xtbTickers.has(t.ticker) && t.notes === 'XTB import')
      );
    }

    // ── Fetch historical FX rates for accurate EUR cost basis ─────────────
    // XTB records prices in the stock's native currency. We convert to EUR at
    // the purchase date using historical ECB/Yahoo FX rates.
    const positionsToProcess = importMode === 'smart' ? newPositions : validPositions;

    showToast('⏳ Fetching historical FX rates for cost basis…');

    // Collect all (currency, date) pairs we need
    const needRates = {}; // currency → Set<date>
    for (const pos of positionsToProcess) {
      const cur = pos.currency || 'USD';
      if (cur === 'EUR') continue;
      if (!needRates[cur]) needRates[cur] = new Set();
      needRates[cur].add(pos.date);
    }

    const fxRates    = {}; // fxRates[currency][date] = unitsPerEUR
    const liveFallback = {}; // currency → live rate fallback
    const today = new Date().toISOString().slice(0, 10);

    await Promise.all(
      Object.entries(needRates).flatMap(([cur, dates]) =>
        [...dates].map(async date => {
          try {
            if (window.electronAPI?.fetchFxRate) {
              const r = await window.electronAPI.fetchFxRate({ date, fromCurrency: cur });
              if (r && r > 0) {
                if (!fxRates[cur]) fxRates[cur] = {};
                fxRates[cur][date] = r;
              }
            }
          } catch(e) {}
        })
      )
    );

    // Live fallback for any failed historical lookups
    await Promise.all(Object.keys(needRates).map(async cur => {
      try {
        const r = await window.electronAPI.fetchFxRate({ date: today, fromCurrency: cur });
        if (r && r > 0) liveFallback[cur] = r;
      } catch(e) {}
      if (!liveFallback[cur]) liveFallback[cur] = cur === 'GBP' ? 0.86 : 1.08;
    }));

    const getFxRate = (currency, date) => {
      if (currency === 'EUR') return 1;
      return (fxRates[currency]?.[date]) || liveFallback[currency] || 1.08;
    };

    let added = 0, skipped = 0;
    const affectedTickers = new Set();

    for (const pos of positionsToProcess) {
      if (!pos.ticker || pos.shares <= 0) { skipped++; continue; }

      // ── Determine asset class (checks TICKER_DB first, then patterns) ────
      const assetClass = guessAssetClass(pos.ticker);

      // ── Convert native price → EUR ────────────────────────────────────
      const posCurrency = pos.currency || 'USD';
      const fxRate   = getFxRate(posCurrency, pos.date);
      const priceEur = parseFloat((pos.price / fxRate).toFixed(4));

      // ── Find or create holding ────────────────────────────────────────
      let holding = port.holdings.find(h => h.ticker === pos.ticker);
      if (!holding) {
        holding = {
          id: uid(), ticker: pos.ticker, assetClass,
          shares: 0, buyPrice: 0,
          buyDate: pos.date, buyCurrency: posCurrency,
          currentPrice: null, dividends: 0,
          sector: SECTOR_DB[pos.ticker] || null,
          importedFromXtb: true,
        };
        port.holdings.push(holding);
      }

      // ── Record the transaction lot ────────────────────────────────────
      port.transactions.push({
        id: uid(), ticker: pos.ticker, type: pos.type,
        shares: pos.shares,
        price: priceEur,          // EUR — used for all P&L calculations
        priceOriginal: pos.price, // native currency price — used for fingerprinting
        priceCurrency: posCurrency,
        fxRate,                   // rate applied at import time (for transparency)
        date: pos.date, notes: 'XTB import',
      });

      affectedTickers.add(pos.ticker);
      added++;
    }

    // ── Recalculate avg cost for every affected holding from ALL buy lots ──
    // This keeps the weighted-average correct whether we smart-updated or replaced.
    for (const ticker of affectedTickers) {
      const holding = port.holdings.find(h => h.ticker === ticker);
      if (!holding) continue;
      const buyLots = port.transactions.filter(
        t => t.ticker === ticker && t.type === 'Buy' && t.notes === 'XTB import'
      );
      const totalShares  = buyLots.reduce((s, t) => s + t.shares, 0);
      const totalCostEur = buyLots.reduce((s, t) => s + t.shares * t.price, 0);
      holding.shares   = parseFloat(totalShares.toFixed(6));
      holding.buyPrice = totalShares > 0 ? parseFloat((totalCostEur / totalShares).toFixed(4)) : 0;
    }

    save();
    renderPortfolio();
    const rateCount = Object.values(fxRates).reduce((s, d) => s + Object.keys(d).length, 0);
    const fxNote   = rateCount > 0
      ? ` · ${rateCount} historical FX rate${rateCount !== 1 ? 's' : ''} applied`
      : ' · using live FX rate';
    const modeLabel = importMode === 'smart' ? 'Smart Update' : 'Full import';
    showToast(`✓ XTB ${modeLabel}: ${added} transaction${added !== 1 ? 's' : ''} added` +
              `${duplicateCount && importMode === 'smart' ? `, ${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} skipped` : ''}` +
              `${skipped ? `, ${skipped} invalid skipped` : ''}${fxNote}. Refresh prices to update.`);
  } catch(err) {
    alert('XTB import failed:\n' + (err?.message || String(err)));
  }
}

function exportPortfolioCSV() {
  const rows = [['Ticker','Asset Class','Shares','Avg Cost (€)','Last Price (€)','Today %','Total Cost (€)','Mkt Value (€)','Total Gain (€)','Gain %','Dividends (€)']];
  (ap().holdings||[]).forEach(h => {
    const price = h.currentPrice || h.buyPrice;
    const val = price * h.shares;
    const cost = h.buyPrice * h.shares;
    const gain = val - cost + Number(h.dividends || 0);
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

function deletePortfolio() {
  if ((state.portfolios||[]).length <= 1) return;
  const port = ap();
  if (!confirm(`Delete "${port.name}" and all its holdings? This cannot be undone.`)) return;
  state.portfolios = state.portfolios.filter(p => p.id !== port.id);
  state.activePortfolioId = state.portfolios[0].id;
  save();
  ['port-donut','pnl-bar','port-history','port-dynamics'].forEach(k => destroyChart(k));
  const hw = document.getElementById('hperf-chart-wrap');
  if (hw) hw.innerHTML = '';
  renderPortfolio();
}

