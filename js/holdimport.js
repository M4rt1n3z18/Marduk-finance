// ══════════════ HOLDINGS CSV IMPORT (Marduk template) ══════════════
// Portfolio → Holdings → Import CSV. Exactly one layout is accepted — the
// Marduk template, first row:
//
//   Symbol,Trade Date,Purchase Price,Quantity,Status
//
// Status (Open | Closed) is optional, so the original four-column file still
// works with every row treated as Open. Closed rows are listed but never
// imported: Marduk tracks what you hold now, and a sold lot counted as a
// holding is exactly the mistake a broker's closed-positions sheet invites.
// Any other header — broker exports, Yahoo's export, renamed or reordered
// columns — is rejected rather than half-understood.
//
// Columns are strict; formatting is not. A template edited and saved by a
// Portuguese Excel (`;` delimiter, decimal commas, D/M/Y dates) is the same
// template and is read as such.
//
// Parsed entirely in the renderer — the file never leaves this computer. The
// only network call is one ECB request for the historical rates the lots need.
// No Yahoo calls per row (prices arrive with the next refresh), so a 40-lot
// file can't trip the rate limit.
//
// Purchase Price is read in the symbol's own trading currency (USD for AAPL,
// EUR for VWCE.DE, pence for most .L listings); lots written in euros can be
// switched with the "Prices are in" selector. A rate is never guessed: a lot
// with no ECB rate for its date can't be imported.

const HI_TEMPLATE = ['Symbol', 'Trade Date', 'Purchase Price', 'Quantity', 'Status'];

const HI_CCYS = ['EUR','USD','GBP','GBp','CHF','CAD','SEK','DKK','NOK','PLN','CZK','JPY','HKD','AUD','NZD','SGD','BRL','MXN','INR','KRW'];

// Yahoo exchange suffix → trading currency. No suffix = US listing.
const HI_SUFFIX_CCY = {
  DE:'EUR', F:'EUR', BE:'EUR', DU:'EUR', HM:'EUR', HA:'EUR', MU:'EUR', SG:'EUR',
  PA:'EUR', AS:'EUR', BR:'EUR', MI:'EUR', MC:'EUR', LS:'EUR', VI:'EUR', HE:'EUR', IR:'EUR', AT:'EUR',
  L:'GBp', SW:'CHF', TO:'CAD', V:'CAD', NE:'CAD', ST:'SEK', CO:'DKK', OL:'NOK',
  WA:'PLN', PR:'CZK', T:'JPY', HK:'HKD', AX:'AUD', NZ:'NZD', SI:'SGD', SA:'BRL',
  MX:'MXN', NS:'INR', BO:'INR', KS:'KRW', KQ:'KRW',
};

let _hiRows   = null;   // parsed lots for the open review
let _hiFx     = {};     // unit currency → { 'YYYY-MM-DD': unitsPerEUR }
let _hiFxErr  = null;
let _hiRange  = null;   // { from, to } for the ECB request
let _hiGlobal = 'auto'; // "Prices are in" selector
let _hiInited = false;

const hiUnit = c => c === 'GBp' ? 'GBP' : c;   // pence convert via the pound rate
const hiDiv  = c => c === 'GBp' ? 100 : 1;
const _hiIso = d => d.toISOString().slice(0, 10);
const _hiEsc = s => String(s).replace(/[&<>"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch]));

// ── Parsing ────────────────────────────────────────────────────────────────
function hiParseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const count = ch => first.split(ch).length - 1;
  const delim = count(';') > count(',') ? ';' : (count('\t') > count(',') ? '\t' : ',');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return { delim, rows: rows.filter(r => r.some(c => String(c).trim() !== '')) };
}

// A ;-delimited file comes from a European Excel and uses decimal commas;
// a ,-delimited one can only carry commas inside quotes, as thousands.
function hiNum(raw, delim) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (delim === ';') return impNum(s);
  const n = parseFloat(s.replace(/[\s,]/g, ''));
  return isFinite(n) ? n : null;
}

// YYYY-MM-DD as in the template, or D/M/YYYY as a Portuguese Excel re-saves it.
// Slash dates are read day-first unless that's impossible — and flagged as
// ambiguous when both readings are valid, so the review can say so.
function hiDate(raw) {
  const s = String(raw ?? '').trim();
  let y, m, d, ambiguous = false, mt;
  if ((mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [, y, m, d] = mt;
  else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) {
    const a = +mt[1], b = +mt[2]; y = mt[3];
    if (a > 12)      { d = a; m = b; }
    else if (b > 12) { d = b; m = a; }
    else             { d = a; m = b; ambiguous = a !== b; }
  } else return null;
  y = +y; m = +m; d = +d;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { iso: _hiIso(dt), ambiguous };
}

function hiSuffixCcy(sym) {
  const crypto = sym.match(/-(USD|EUR|GBP)$/);
  if (crypto) return crypto[1];
  const dot = sym.lastIndexOf('.');
  if (dot < 0) return 'USD';
  return HI_SUFFIX_CCY[sym.slice(dot + 1)] || null;
}

// Which holding a symbol lands in. Exact match first; otherwise a bare/suffixed
// pair of the same code (VWCE ↔ VWCE.DE) is treated as the same holding —
// holdings from the old XTB import store bare codes, Yahoo symbols are
// suffixed, and splitting one position across two rows would be worse than
// merging.
function hiTarget(port, sym) {
  if (port.holdings.some(h => h.ticker === sym)) return { target: sym, merge: true };
  const bare = sym.split('.')[0];
  const cand = port.holdings.filter(h => h.ticker.split('.')[0] === bare && (h.ticker === bare || sym === bare));
  if (cand.length === 1) return { target: cand[0].ticker, merge: true, alias: true };
  return { target: sym, merge: false };
}

function hiClass(sym) {
  const dir = (typeof SYMBOL_DIR !== 'undefined' ? SYMBOL_DIR : []).find(x => x.t === sym);
  if (dir) return dir.c;
  if (/-(USD|EUR|GBP)$/.test(sym)) return 'Crypto';
  return guessAssetClass(sym);
}

// Returns { rows } or { error }
function hiBuildRows(text, port) {
  const { delim, rows } = hiParseCsv(text);
  if (!rows.length) return { error: 'The file is empty.' };

  // The first row must be the template's header, word for word and in order.
  // Trailing empty cells are ignored (spreadsheets add them).
  const header = rows[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, ' '));
  while (header.length && !header[header.length - 1]) header.pop();
  const want = HI_TEMPLATE.map(h => h.toLowerCase());
  const hasStatus = header.length === 5;
  if (!(header.length === 4 || hasStatus) || header.some((h, i) => h !== want[i])) {
    return { error: `Not the Marduk template — the first row must be: ${HI_TEMPLATE.join(', ')}. ` +
      'Download the template and copy your lots into it.' };
  }

  const today = _hiIso(new Date());
  const out = [];
  rows.slice(1).forEach(cells => {
    const get = i => String(cells[i] ?? '').trim();
    const sym = get(0).toUpperCase();
    if (!sym) return;
    const r = { sym, include: true };
    out.push(r);

    // Symbol characters only: the ticker ends up in the holdings table's HTML
    if (!/^[A-Z0-9][A-Z0-9.\-]{0,19}$/.test(sym)) { r.err = 'Not a valid symbol'; return; }
    if (hasStatus) {
      const st = get(4).toLowerCase();
      if (st === 'closed')                        { r.skip = 'Closed — not imported'; return; }
      if (st !== 'open' && st !== 'opened')       { r.err = 'Status must be Open or Closed'; return; }
    }
    const dRaw = get(1);
    r.price = hiNum(get(2), delim);
    r.qty   = hiNum(get(3), delim);
    const dt = hiDate(dRaw);
    if (!(r.qty > 0))                 { r.err = r.qty < 0 ? 'Short positions aren’t supported' : 'Missing quantity'; return; }
    if (!(r.price > 0))               { r.err = 'Missing purchase price'; return; }
    if (!dt)                          { r.err = dRaw ? `Unreadable date “${dRaw}”` : 'Missing trade date'; return; }
    if (dt.iso > today)               { r.err = 'Trade date is in the future'; return; }
    r.date = dt.iso;
    r.ambiguous = dt.ambiguous;

    Object.assign(r, hiTarget(port, sym));
    r.cls = hiClass(r.target);
  });
  if (!out.length) return { error: 'No rows found under the header.' };
  return { rows: out };
}

// ── Currency, rates, duplicates ────────────────────────────────────────────
function hiAutoCcy(r, port) {
  // What Yahoo actually quotes an existing holding in beats any suffix rule
  const h = port.holdings.find(h => h.ticker === r.target);
  if (h?.priceCurrency && HI_CCYS.includes(h.priceCurrency)) return h.priceCurrency;
  return hiSuffixCcy(r.sym);
}

function hiRateOn(unit, date) {
  const map = _hiFx[unit];
  if (!map) return null;
  // ECB publishes business days only; a weekend or holiday trade uses the last
  // published rate, which is also how the ECB defines the rate for those days.
  const d = new Date(date + 'T12:00:00Z');
  for (let k = 0; k <= 10; k++) {
    const v = map[_hiIso(d)];
    if (v) return v;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return null;
}

function hiRecompute(port) {
  for (const r of _hiRows) {
    if (r.skip || r.err) continue;
    r.ccy = r.ccyManual || (_hiGlobal !== 'auto' ? _hiGlobal : hiAutoCcy(r, port));
    r.rate = r.priceEur = r.costEur = null;
    r.block = null;
    if (!r.ccy) { r.block = 'Pick the currency'; continue; }
    const unit = hiUnit(r.ccy);
    if (unit !== 'EUR') {
      if (!_hiFx[unit]) { r.block = _hiFxErr ? 'Exchange rates unavailable — try again' : 'Loading rate…'; continue; }
      r.rate = hiRateOn(unit, r.date);
      if (!r.rate) { r.block = 'No ECB rate for this date'; continue; }
    } else r.rate = 1;
    r.priceEur = parseFloat((r.price / hiDiv(r.ccy) / r.rate).toFixed(4));
    r.costEur  = r.priceEur * r.qty;

    // Same lot already in this portfolio? Exact = same day, shares and price
    // (native or EUR). Near = same day and shares at a different price — most
    // likely the same buy typed by hand in another currency. Both start
    // unticked: a double-counted position is worse than re-ticking a row.
    const lots = (port.transactions || []).filter(t => t.type === 'Buy' && t.ticker === r.target && t.date === r.date
      && Math.round(t.shares * 1e4) === Math.round(r.qty * 1e4));
    r.dup  = lots.some(t => Math.round((t.priceOriginal ?? t.price) * 100) === Math.round(r.price * 100)
                         || Math.round(t.price * 100) === Math.round(r.priceEur * 100));
    r.near = !r.dup && lots.length > 0;
    if (!r.dupSeen && (r.dup || r.near)) r.include = false;
    r.dupSeen = true;
  }
}

async function hiEnsureRates() {
  const need = [...new Set(_hiRows.filter(r => r.ccy).map(r => hiUnit(r.ccy)))]
    .filter(c => c !== 'EUR' && !_hiFx[c]);
  if (!need.length || !_hiRange) return;
  const res = await window.electronAPI?.fetchFxHistory?.({ currencies: need, from: _hiRange.from, to: _hiRange.to });
  if (!res || res.error) { _hiFxErr = res?.error || 'unavailable'; return; }
  _hiFxErr = null;
  for (const c of need) _hiFx[c] = res[c] || {};
}

const hiSelectable = r => !r.skip && !r.err && !r.block && r.priceEur != null;

// ── Modal ──────────────────────────────────────────────────────────────────
function openHoldImport() {
  _hiRows = null; _hiFx = {}; _hiFxErr = null; _hiGlobal = 'auto';
  hiInitOnce();
  const port = ap();
  document.getElementById('hi-port-name').textContent = port.name || 'this portfolio';
  document.getElementById('hi-pick').style.display = '';
  document.getElementById('hi-review').style.display = 'none';
  document.getElementById('hi-error').style.display = 'none';
  document.getElementById('hi-commit').style.display = 'none';
  const g = document.getElementById('hi-global-ccy');
  if (g) g.value = 'auto';
  hiRefreshUndo();
  document.getElementById('hold-import-modal').style.display = 'flex';
}

function closeHoldImport() {
  document.getElementById('hold-import-modal').style.display = 'none';
  _hiRows = null;
}

function hiInitOnce() {
  if (_hiInited) return;
  _hiInited = true;
  const drop = document.getElementById('hi-drop');
  const file = document.getElementById('hi-file');
  drop.addEventListener('click', () => file.click());
  file.addEventListener('change', () => { if (file.files[0]) hiReadFile(file.files[0]); file.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--gold)'; });
  drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
  drop.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    drop.style.borderColor = '';
    const f = e.dataTransfer?.files?.[0];
    if (f) hiReadFile(f);
  });
  const g = document.getElementById('hi-global-ccy');
  g.innerHTML = `<option value="auto">Each stock’s own currency</option>` +
    HI_CCYS.map(c => `<option value="${c}">${c === 'GBp' ? 'GBp (pence)' : c}</option>`).join('');
  g.addEventListener('change', async () => {
    _hiGlobal = g.value;
    for (const r of _hiRows || []) r.ccyManual = null;
    await hiRefresh();
  });
  document.getElementById('hi-check-all').addEventListener('change', e => {
    for (const r of _hiRows || []) if (hiSelectable(r)) r.include = e.target.checked;
    hiRender();
  });
}

function hiShowError(msg) {
  const el = document.getElementById('hi-error');
  el.textContent = msg;
  el.style.display = '';
}

function hiReadFile(f) {
  document.getElementById('hi-error').style.display = 'none';
  if (!/\.(csv|txt)$/i.test(f.name)) {
    hiShowError(/\.(xlsx?|numbers)$/i.test(f.name)
      ? 'This needs a .csv file. Save the spreadsheet as CSV first (File → Export To → CSV in Numbers).'
      : 'Choose a .csv file made from the Marduk template.');
    return;
  }
  const fr = new FileReader();
  fr.onload = async () => {
    const port = ap();
    const res = hiBuildRows(fr.result, port);
    if (res.error) { hiShowError(res.error); return; }
    _hiRows = res.rows;
    const dates = _hiRows.filter(r => r.date).map(r => r.date).sort();
    if (dates.length) {
      const from = new Date(dates[0] + 'T12:00:00Z'); from.setUTCDate(from.getUTCDate() - 10);
      _hiRange = { from: _hiIso(from), to: dates[dates.length - 1] };
    }
    document.getElementById('hi-pick').style.display = 'none';
    document.getElementById('hi-review').style.display = '';
    document.getElementById('hi-commit').style.display = '';
    await hiRefresh();
  };
  fr.onerror = () => hiShowError('Couldn’t read that file.');
  fr.readAsText(f);
}

async function hiRefresh() {
  const port = ap();
  hiRecompute(port);
  hiRender();
  await hiEnsureRates();
  hiRecompute(port);
  hiRender();
}

function hiStatus(r) {
  if (r.skip)  return { cls: 'src-manual',  label: r.skip };
  if (r.err)   return { cls: 'src-new',     label: r.err };
  if (r.block) return { cls: 'src-new',     label: r.block };
  if (r.dup)   return { cls: 'src-manual',  label: 'Already added', title: 'This exact lot is already in this portfolio' };
  if (r.near)  return { cls: 'src-new',     label: 'Possible duplicate', title: 'You already have a buy of this many shares on this date, at a different price' };
  if (r.merge) return { cls: 'src-history', label: r.alias ? `Adds to ${r.target}` : 'Adds to holding' };
  return { cls: 'src-learned', label: 'New holding' };
}

function hiRender() {
  const body = document.getElementById('hi-rows');
  if (!body || !_hiRows) return;
  const ccyOpts = cur => `<option value=""${!cur ? ' selected' : ''}>—</option>` +
    HI_CCYS.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${c}</option>`).join('');
  const sel = 'width:100%;padding:4px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:Karla,sans-serif;font-size:12px;';

  body.innerHTML = _hiRows.map((r, i) => {
    const st = hiStatus(r);
    const dead = r.skip || r.err;
    const fmtQty = r.qty != null ? r.qty.toLocaleString('de-DE', { maximumFractionDigits: 6 }) : '';
    const fmtPx  = r.price != null ? r.price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '';
    const notes  = [
      r.ambiguous ? 'date read as day/month' : '',
      r.sym.endsWith('.L') && !r.ccyManual && _hiGlobal === 'auto' ? 'London: check GBp vs USD' : '',
    ].filter(Boolean).join(' · ');
    return `<tr style="${dead || r.dup ? 'opacity:.45;' : ''}">
      <td style="text-align:center;"><input type="checkbox" data-hiinc="${i}"${r.include && hiSelectable(r) ? ' checked' : ''}${hiSelectable(r) ? '' : ' disabled'} style="width:15px;height:15px;accent-color:var(--gold);cursor:pointer;"></td>
      <td><span style="font-weight:700;color:var(--gold);">${_hiEsc(r.sym)}</span>${notes ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;">${notes}</div>` : ''}</td>
      <td class="muted" style="text-align:center;white-space:nowrap;">${r.date || ''}</td>
      <td style="text-align:right;">${fmtQty}</td>
      <td style="text-align:right;">${fmtPx}</td>
      <td>${dead ? '' : `<select data-hiccy="${i}" style="${sel}">${ccyOpts(r.ccy)}</select>`}</td>
      <td style="text-align:right;font-weight:600;">${r.costEur != null ? eur(r.costEur) : ''}</td>
      <td style="text-align:center;"><span class="src-badge ${st.cls}"${st.title ? ` title="${_hiEsc(st.title)}"` : ''}>${_hiEsc(st.label)}</span></td>
    </tr>`;
  }).join('');

  body.querySelectorAll('input[data-hiinc]').forEach(cb => cb.addEventListener('change', () => {
    _hiRows[Number(cb.dataset.hiinc)].include = cb.checked;
    hiRenderSummary();
  }));
  body.querySelectorAll('select[data-hiccy]').forEach(s => s.addEventListener('change', async () => {
    _hiRows[Number(s.dataset.hiccy)].ccyManual = s.value || null;
    await hiRefresh();
  }));
  hiRenderSummary();
}

function hiRenderSummary() {
  const inc  = _hiRows.filter(r => r.include && hiSelectable(r));
  const newSyms = new Set(inc.filter(r => !r.merge).map(r => r.target));
  const cost = inc.reduce((s, r) => s + r.costEur, 0);
  const skipped = _hiRows.filter(r => r.skip || r.err || r.block).length;
  const selectable = _hiRows.filter(hiSelectable);
  const all = document.getElementById('hi-check-all');
  if (all) all.checked = selectable.length > 0 && selectable.every(r => r.include);
  const dups = _hiRows.filter(r => r.dup || r.near).length;
  document.getElementById('hi-summary').innerHTML =
    `${_hiRows.length} rows · <strong>${inc.length} selected</strong>` +
    (newSyms.size ? ` · ${newSyms.size} new holding${newSyms.size !== 1 ? 's' : ''}` : '') +
    (dups ? ` · ${dups} possibly already added` : '') +
    (skipped ? ` · ${skipped} can’t be imported` : '') +
    (_hiFxErr ? ` · <span style="color:var(--down);">ECB rates unavailable (${_hiEsc(_hiFxErr)})</span>` : '');
  const btn = document.getElementById('hi-commit');
  btn.textContent = inc.length ? `Import ${inc.length} lot${inc.length !== 1 ? 's' : ''} · ${eur(cost)}` : 'Import';
  btn.disabled = !inc.length;
  btn.style.opacity = inc.length ? '' : '.5';
}

// ── Commit and undo ────────────────────────────────────────────────────────
// Undo restores the portfolio as it was before the import — but only while
// nothing else has touched its positions since, which the fingerprint checks.
// Price refreshes don't count (they never change shares or cost).
function hiFingerprint(port, withAlloc) {
  return JSON.stringify({
    tx:  (port.transactions || []).map(t => t.id),
    pos: (port.holdings || []).map(h => [h.id, h.shares, h.buyPrice]),
    al:  withAlloc ? [(state.allocations || []).map(a => [a.id, a.amountInvested, a.status]),
                      state.unallocatedInvestment?.[port.id] || 0] : null,
  });
}

async function hiCommit() {
  if (!_hiRows) return;
  const port = ap();
  const lots = _hiRows.filter(r => r.include && hiSelectable(r)).sort((a, b) => a.date.localeCompare(b.date));
  if (!lots.length) return;
  if (!port.transactions) port.transactions = [];

  const clone = o => JSON.parse(JSON.stringify(o ?? null));
  const before = { holdings: clone(port.holdings), transactions: clone(port.transactions),
                   allocations: clone(state.allocations || []), unallocated: clone(state.unallocatedInvestment || {}) };
  const batch = 'hi-' + uid();
  let created = 0;
  for (const r of lots) {
    if (!port.holdings.some(h => h.ticker === r.target)) created++;
    applyBuy(port, { ticker: r.target, assetClass: r.cls, shares: r.qty, priceEur: r.priceEur,
      priceNative: r.price, currency: r.ccy, fxRate: r.rate !== 1 ? parseFloat(r.rate.toFixed(6)) : null, date: r.date,
      notes: 'CSV import' + (r.ccy !== 'EUR' ? ` (${r.ccy} ${r.price} @ ${r.rate} ECB)` : ''),
      txExtra: { importBatch: batch } });
  }

  // Only buys dated on/after the earliest open allocation consume it — a
  // back-filled history must not.
  const minDate = earliestOpenAllocationDate(port.id);
  const invested = minDate ? lots.filter(r => r.date >= minDate).reduce((s, r) => s + r.costEur, 0) : 0;
  if (invested > 0) consumeAllocations(port.id, parseFloat(invested.toFixed(2)));

  state.lastHoldingImport = { portfolioId: port.id, at: new Date().toISOString(), lots: lots.length,
    consumed: invested > 0, before, afterFp: hiFingerprint(port, invested > 0) };
  save();
  closeHoldImport();
  renderAll();
  hiRefreshUndo();
  showToast(`✓ Imported ${lots.length} lot${lots.length !== 1 ? 's' : ''}` +
    (created ? ` · ${created} new holding${created !== 1 ? 's' : ''}, fetching prices…` : ''));
  if (created) refreshPrices(true);
}

function hiUndoAvailable() {
  const u = state.lastHoldingImport;
  if (!u) return false;
  const port = (state.portfolios || []).find(p => p.id === u.portfolioId);
  return !!port && hiFingerprint(port, u.consumed) === u.afterFp;
}

function hiRefreshUndo() {
  const ok = hiUndoAvailable() && state.lastHoldingImport.portfolioId === state.activePortfolioId;
  const btn = document.getElementById('hi-undo-btn');
  if (btn) btn.style.display = ok ? '' : 'none';
}

async function hiUndo() {
  const u = state.lastHoldingImport;
  if (!u) return;
  const port = (state.portfolios || []).find(p => p.id === u.portfolioId);
  if (!port || !hiUndoAvailable()) {
    mardukAlert('This portfolio has changed since the import, so it can’t be undone in one step. Remove the holdings from the table instead.', 'Undo import');
    return;
  }
  const when = new Date(u.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (!await mardukConfirm(`Remove the ${u.lots} lot${u.lots !== 1 ? 's' : ''} imported on ${when} from ${port.name}?`, 'Undo import')) return;
  // Positions and history go back exactly; current prices stay fresh
  const live = new Map(port.holdings.map(h => [h.id, h]));
  port.holdings = u.before.holdings.map(h => {
    const l = live.get(h.id);
    return l ? { ...l, shares: h.shares, buyPrice: h.buyPrice, buyDate: h.buyDate } : h;
  });
  port.transactions = u.before.transactions;
  if (u.consumed) {
    state.allocations = u.before.allocations;
    state.unallocatedInvestment = u.before.unallocated;
  }
  state.lastHoldingImport = null;
  save();
  renderAll();
  hiRefreshUndo();
  showToast('Import undone');
}

function hiDownloadTemplate() {
  const csv = HI_TEMPLATE.join(',') + '\nAAPL,2024-03-15,172.50,10,Open\nVWCE.DE,2024-05-02,115.40,4,Open\nTSLA,2023-01-10,118.20,3,Closed\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'marduk-holdings-template.csv';
  a.click();
}

// ── Add Holding panel (collapsed by default — the import is the main way in) ─
function openAddHolding() {
  const p = document.getElementById('add-holding-panel');
  if (!p) return;
  p.style.display = '';
  const b = document.getElementById('add-holding-toggle');
  if (b) b.textContent = 'Close';
}
function toggleAddHolding() {
  const p = document.getElementById('add-holding-panel');
  if (!p) return;
  if (p.style.display === 'none') { openAddHolding(); document.getElementById('h-ticker')?.focus(); }
  else {
    p.style.display = 'none';
    const b = document.getElementById('add-holding-toggle');
    if (b) b.textContent = '+ Add holding';
  }
}
