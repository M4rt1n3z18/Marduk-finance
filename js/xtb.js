// ══════════════ XTB EXCEL IMPORT ══════════════
async function importXtbExcel() {
  if (!window.electronAPI?.importXtbExcel) {
    mardukAlert('XTB import is only available in the desktop app.');
    return;
  }
  try {
    const positions = await window.electronAPI.importXtbExcel();
    if (!positions) return; // user cancelled file picker
    if (!positions.length) {
      mardukAlert('No open positions found in that file. Make sure you exported "Open Positions" from XTB.');
      return;
    }

    const port = ap();
    if (!port.transactions) port.transactions = [];

    // ── Filter valid positions ─────────────────────────────────────────────
    const validPositions = positions.filter(pos => pos.ticker && pos.shares > 0);
    if (!validPositions.length) { mardukAlert('No valid positions found in that file.'); return; }

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
        mardukAlert(`All ${validPositions.length} transaction(s) in this file are already imported. Nothing new to add.`);
        return;
      }
      // Primary dialog: Smart Update
      const doSmartUpdate = await mardukConfirm(
        `Smart Update found ${newPositions.length} new transaction(s)` +
        (duplicateCount > 0 ? ` (${duplicateCount} already imported, skipped)` : '') + '.\n\n' +
        'Confirm → Smart Update: add only the new transactions\n' +
        'Cancel → Choose a different option…'
      );
      if (doSmartUpdate) {
        importMode = 'smart';
      } else {
        // Secondary dialog: Full Replace or Abort
        const doReplace = await mardukConfirm(
          'Full Replace?\n\n' +
          'Confirm → Clear all existing XTB data and re-import everything from this file\n' +
          'Cancel → Abort — do not import anything'
        );
        if (!doReplace) return; // truly abort
        importMode = 'replace';
      }
    } else {
      // No existing XTB data — import everything as a first-time import
      importMode = 'replace';
    }

    // ── Historical FX rates for an accurate EUR cost basis ────────────────
    // XTB records prices in the stock's native currency, converted here at the
    // ECB rate on each purchase date — every currency and date in one request.
    // This used to be one Yahoo call per lot, falling back to a hardcoded 1.08
    // (or 0.86 for GBP) whenever a call failed — and with that many calls, some
    // always did. Rates are fetched before anything is changed, so a missing
    // rate stops the import with your data untouched.
    const positionsToProcess = importMode === 'smart' ? newPositions : validPositions;

    const foreign = positionsToProcess.filter(p => (p.currency || 'USD') !== 'EUR');
    let fxHist = {};
    if (foreign.length) {
      showToast('Fetching ECB exchange rates for cost basis…');
      const dates = foreign.map(p => p.date).sort();
      const from = new Date(dates[0] + 'T12:00:00Z'); from.setUTCDate(from.getUTCDate() - 10);
      fxHist = await window.electronAPI?.fetchFxHistory?.({
        currencies: [...new Set(foreign.map(p => p.currency || 'USD'))],
        from: from.toISOString().slice(0, 10), to: dates[dates.length - 1],
      }) || { error: 'unavailable' };
    }
    // Last published rate on or before the date (weekends, holidays)
    const getFxRate = (currency, date) => {
      if (currency === 'EUR') return 1;
      const map = fxHist[currency] || {};
      const d = new Date(date + 'T12:00:00Z');
      for (let k = 0; k <= 10; k++, d.setUTCDate(d.getUTCDate() - 1)) {
        const r = map[d.toISOString().slice(0, 10)];
        if (r) return r;
      }
      return null;
    };
    const unrated = foreign.filter(p => !getFxRate(p.currency || 'USD', p.date));
    if (fxHist.error || unrated.length) {
      mardukAlert(`Couldn't get ECB exchange rates for ${fxHist.error ? 'this import' : unrated.length + ' lot(s)'}, ` +
        'so their cost in euros can\'t be worked out. Nothing was changed — check your connection and import again.');
      return;
    }

    // ── For Full Replace: clear existing XTB holdings and transactions ─────
    if (importMode === 'replace') {
      const xtbTickers = new Set(existingXtb.map(h => h.ticker));
      port.holdings    = port.holdings.filter(h => !h.importedFromXtb);
      port.transactions = port.transactions.filter(
        t => !(xtbTickers.has(t.ticker) && t.notes === 'XTB import')
      );
    }

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

    // ── Consume investment allocations with newly imported buys ────────────
    // Only buys dated on/after the earliest open allocation count — historical
    // imports from before the allocation existed must not consume it.
    {
      const minDate = earliestOpenAllocationDate(port.id);
      if (minDate) {
        const investedEur = positionsToProcess
          .filter(pos => pos.type === 'Buy' && pos.date >= minDate && pos.ticker && pos.shares > 0)
          .reduce((s, pos) => s + pos.shares * (pos.price / getFxRate(pos.currency || 'USD', pos.date)), 0);
        consumeAllocations(port.id, parseFloat(investedEur.toFixed(2)));
      }
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
    const fxNote = foreign.length
      ? ` · ${foreign.length} lot${foreign.length !== 1 ? 's' : ''} converted at the ECB rate on the trade date` : '';
    const modeLabel = importMode === 'smart' ? 'Smart Update' : 'Full import';
    showToast(`✓ XTB ${modeLabel}: ${added} transaction${added !== 1 ? 's' : ''} added` +
              `${duplicateCount && importMode === 'smart' ? `, ${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} skipped` : ''}` +
              `${skipped ? `, ${skipped} invalid skipped` : ''}${fxNote}. Refresh prices to update.`);
  } catch(err) {
    mardukAlert('XTB import failed:\n' + (err?.message || String(err)));
  }
}

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

