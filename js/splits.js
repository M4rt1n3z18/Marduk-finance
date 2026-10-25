// ══════════════ STOCK SPLITS ══════════════
// A split multiplies the share count and divides the price. Lots are stored as
// entered, so a holding bought before a split kept its old share count and old
// price while Yahoo's quote moved to the new terms — a 10-for-1 split showed as
// a 90% loss, and dividends were credited on a tenth of the real shares.
//
// Not every pre-split lot needs fixing: broker exports (XTB, Yahoo) usually
// restate old lots in post-split terms already. So each lot's recorded price is
// compared with Yahoo's split-adjusted close on its date:
//   price ≈ close × (ratios of later splits) → entered in pre-split terms: adjust
//   price ≈ close                            → already adjusted: leave alone
//   matches neither                          → leave alone; never guess
// Comparing prices also makes this idempotent — once adjusted, a lot matches
// the adjusted close and is never touched again.
//
// Runs once a day after unlock, and on demand from Actions. Nothing changes
// until you confirm each holding's adjustment.

const SPLIT_CHECK_KEY   = 'nexora_split_check';
const SPLIT_CHECK_EVERY = 24 * 60 * 60 * 1000;
const SPLIT_TOLERANCE   = 0.25;   // |ln(price / expected)| — within ~28%
let _splitRunning = false;

// A lot's price in the listing's own currency, to compare with Yahoo's close.
// Exact when the lot was recorded in that currency; otherwise converted from
// euros at today's rate — close enough to tell 1× from 10×.
function _splitNativePrice(lot, quoteCcy) {
  if (lot.priceOriginal != null && lot.priceCurrency === quoteCcy) return lot.priceOriginal;
  if (!quoteCcy || quoteCcy === 'EUR') return lot.price;
  if (quoteCcy === 'GBp') return FX_RATES.GBP ? lot.price * FX_RATES.GBP * 100 : null;
  return FX_RATES[quoteCcy] ? lot.price * FX_RATES[quoteCcy] : null;
}

// The factor a lot still needs: 1 when it is already in post-split terms,
// the product of the later splits it predates when it isn't, null if unclear.
// A broker export taken between two splits is adjusted for the first only, so
// "the last k splits" is tried for every k.
function _splitFactorFor(lot, splits, closeOn, quoteCcy) {
  const later = splits.filter(s => s.date > lot.date);
  if (!later.length) return 1;
  const close = closeOn[lot.date];
  const p = _splitNativePrice(lot, quoteCcy);
  if (!(close > 0) || !(p > 0)) return null;
  let best = null, bestErr = Infinity;
  for (let k = 0; k <= later.length; k++) {
    const f = later.slice(later.length - k).reduce((m, s) => m * s.ratio, 1);
    const err = Math.abs(Math.log(p / (close * f)));
    if (err < bestErr) { bestErr = err; best = f; }
  }
  return bestErr <= SPLIT_TOLERANCE ? best : null;
}

function _splitRatioLabel(r) {
  if (r >= 1) return Number.isInteger(r) ? `${r}-for-1` : `${+r.toFixed(3)}-for-1`;
  const inv = 1 / r;
  return Number.isInteger(+inv.toFixed(6)) ? `1-for-${+inv.toFixed(6)} reverse` : `${+r.toFixed(3)}-for-1 reverse`;
}

async function checkStockSplits(manual = false) {
  if (_splitRunning || !window.electronAPI?.fetchSplits) return;
  if (!manual) {
    let last = 0;
    try { last = Number(localStorage.getItem(SPLIT_CHECK_KEY)) || 0; } catch (e) {}
    if (Date.now() - last < SPLIT_CHECK_EVERY) return;
  }
  _splitRunning = true;
  try {
    // Every lot of every holding, grouped by ticker across portfolios
    const byTicker = {};
    for (const port of (state.portfolios || [])) {
      for (const h of (port.holdings || [])) {
        if (/[-=^]/.test(h.ticker)) continue;          // crypto and FX pairs don't split
        const tx = (port.transactions || []).filter(t => t.ticker === h.ticker && t.date && (t.type === 'Buy' || t.type === 'Sell'));
        // A holding without lot history is treated as one lot on its buy date
        const lots = tx.length ? tx : (h.buyDate ? [{ date: h.buyDate, shares: h.shares, price: h.buyPrice, type: 'Buy', _holding: true }] : []);
        if (!lots.length) continue;
        (byTicker[h.ticker] ||= []).push({ port, h, lots });
      }
    }
    const tickers = Object.keys(byTicker);
    if (!tickers.length) { if (manual) showToast('No holdings to check'); return; }

    const res = await window.electronAPI.fetchSplits(tickers.map(t => {
      const dates = [...new Set(byTicker[t].flatMap(g => g.lots.map(l => l.date)))].sort();
      return { ticker: t, from: dates[0], dates };
    }));
    if (res?.rateLimited && manual) { showToast('Yahoo is rate-limiting requests — try again in a few minutes'); return; }
    try { localStorage.setItem(SPLIT_CHECK_KEY, String(Date.now())); } catch (e) {}

    if (!state.splitDismissed) state.splitDismissed = {};
    let adjusted = 0, offered = 0;

    for (const ticker of tickers) {
      const info = res?.data?.[ticker];
      if (!info?.splits?.length) continue;
      for (const g of byTicker[ticker]) {
        const plan = g.lots
          .map(lot => ({ lot, f: _splitFactorFor(lot, info.splits, info.closeOn || {}, info.currency) }))
          .filter(x => x.f != null && Math.abs(x.f - 1) > 1e-9);
        if (!plan.length) continue;

        const lastSplit = info.splits[info.splits.length - 1];
        const key = `${g.port.id}|${ticker}|${lastSplit.date}`;
        if (!manual && state.splitDismissed[key]) continue;
        offered++;

        const buyDelta  = plan.reduce((s, x) => s + (x.lot.type === 'Sell' ? -1 : 1) * x.lot.shares * (x.f - 1), 0);
        const oldShares = g.h.shares;
        const newShares = parseFloat((oldShares + buyDelta).toFixed(6));
        const relevant  = info.splits.filter(s => plan.some(x => s.date > x.lot.date));
        const when = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const what = relevant.map(s => `${_splitRatioLabel(s.ratio)} split on ${when(s.date)}`).join(', then ');
        const portName = (state.portfolios || []).length > 1 ? ` (${g.port.name})` : '';
        const newAvg = newShares > 0 ? g.h.buyPrice * oldShares / newShares : g.h.buyPrice;

        const ok = await nexoraConfirm(
          `${ticker}${portName} had a ${what}.\n\n` +
          `Your position was recorded before it: ${fmtShares(oldShares)} shares at ${eur(g.h.buyPrice)} each. ` +
          `In today's terms that is ${fmtShares(newShares)} shares at ${eur(newAvg)} each — the total cost stays ${eur(g.h.buyPrice * oldShares)}.\n\n` +
          'Adjust the holding and its lots?', 'STOCK SPLIT');
        if (!ok) { state.splitDismissed[key] = true; save(); continue; }

        // Apply: lots × f / ÷ f, position cost unchanged
        for (const { lot, f } of plan) {
          if (lot._holding) continue;
          lot.shares = parseFloat((lot.shares * f).toFixed(6));
          lot.price  = parseFloat((lot.price / f).toFixed(6));
          if (lot.priceOriginal != null) lot.priceOriginal = parseFloat((lot.priceOriginal / f).toFixed(6));
          lot.notes = `${lot.notes ? lot.notes + ' · ' : ''}split-adjusted ×${+f.toFixed(4)}`;
        }
        if (newShares > 0) {
          g.h.buyPrice = parseFloat(newAvg.toFixed(6));
          g.h.shares   = newShares;
          if (plan.some(x => x.lot._holding) && g.h.buyPriceOriginal != null) {
            g.h.buyPriceOriginal = parseFloat((g.h.buyPriceOriginal / plan[0].f).toFixed(6));
          }
        }
        // Dividends before the split were credited on the old share count —
        // drop them so the next sync re-credits them on the corrected one.
        const before = relevant[relevant.length - 1].date;
        state.dividendLog = (state.dividendLog || []).filter(d =>
          !(d.portfolioId === g.port.id && d.ticker === ticker && d.date < before));
        adjusted++;
      }
    }

    if (adjusted) {
      save();
      renderAll();
      syncDividendLog(true).then(changed => { if (changed) { renderReceivedDividends(); renderPortfolio(); } });
      showToast(`✓ ${adjusted} holding${adjusted !== 1 ? 's' : ''} adjusted for stock splits`);
    } else if (manual && !offered) {
      showToast('No stock splits to adjust');
    }
  } catch (e) {
    console.error('checkStockSplits:', e);
    if (manual) showToast('Couldn’t check for stock splits right now');
  } finally {
    _splitRunning = false;
  }
}
