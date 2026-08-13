// ══════════════ BANK STATEMENT IMPORT ══════════════
// Spreadsheet in, categorised expenses out. Everything here runs locally — the
// statement is parsed on this machine and never uploaded. The only thing that
// can reach the network is the optional AI category guess, which sees a single
// merchant string ("CONTINENTE MATOSINHOS") and never the account or balance.
//
// Design notes that matter:
//  · Duplicates are the classic failure of statement importers — overlapping
//    exports or a re-upload silently double your spending. Every row carries a
//    fingerprint and anything already imported is shown, unticked.
//  · Every import is tagged with a batch id so the whole thing can be undone.
//  · Nothing is written to state until you press Import.

let _impRows   = null;  // parsed rows awaiting review
let _impGrid   = null;  // raw grid from the file
let _impMap    = null;  // { date, desc, amount, debit, credit, headerRow }
let _impFile   = '';

const IMP_IGNORE = '— Ignore —';        // internal transfers, not spending
const IMP_INVEST = '— Investment —';    // money to the broker: an allocation, not an expense
const IMP_EXTRA  = '— Extra Income —';  // a credit that is income: feeds the Budget tab's Extra
const IMP_CASH   = '— Cash —';          // money moved to the broker and sitting there uninvested

// ── Value parsing ────────────────────────────────────────────────────────────
// European first (1.234,56) then US (1,234.56) — same rules as the payslip parser
function impNum(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  let s = String(raw).replace(/\s|€|EUR/gi, '').trim();
  if (!s || !/\d/.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()]/g, '').replace(/^-/, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')   // 1.234,56
      : s.replace(/,/g, '');                     // 1,234.56
  } else if (s.includes(',')) {
    const dec = s.split(',')[1] || '';
    s = dec.length === 3 && !s.startsWith('0') ? s.replace(',', '') : s.replace(',', '.');
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

// DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD, plus Excel serials and real Dates
function impDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw)) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let y = Number(m[3]); if (y < 100) y += 2000;
    return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  }
  // Excel serial (days since 1899-12-30)
  const n = Number(s);
  if (isFinite(n) && n > 25000 && n < 60000) {
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

// ── Merchant normalisation ───────────────────────────────────────────────────
// Bank descriptors are noisy and bank-truncated. CGD gives "COMPRAS C.DEB
// AMAZON", "Trf Mbway 961XXX587", "MANUTENCAO CONTA ORDE" (cut at ~22 chars).
// Learning on the raw string would never produce a second match, so strip the
// transaction-type wrapper and any reference numbers down to the merchant.
// Note "Mbway" is deliberately NOT stripped: a CGD MB WAY line is
// "Trf Mbway 961XXX587", and the masked number can't identify anyone, so
// removing both leaves an empty merchant. Keeping the keyword groups every
// MB WAY transfer under one rule, which is the useful behaviour.
const IMP_PREFIXES = [
  /^compras?\s+c\.?\s*d[eé]b\.?\s*/i, /^compra\s+/i, /^pagamento\s+(de\s+)?/i,
  /^pag\.?\s+/i, /^trf\.?\s+/i, /^transfer[eê]ncia\s+(de\s+|para\s+)?/i,
  /^deb\.?\s*dir\.?\s*/i, /^d[eé]bito\s+direto\s+/i, /^levantamento\s+/i,
  /^card\s+payment\s+(to\s+)?/i, /^purchase\s+/i, /^payment\s+(to\s+)?/i,
];

function impMerchant(desc) {
  let s = String(desc || '').trim();
  for (const re of IMP_PREFIXES) s = s.replace(re, '');
  s = s
    .replace(/\b\d{2}[-/.]\d{2}([-/.]\d{2,4})?\b/g, ' ')  // embedded dates
    .replace(/\b[\dX]{6,}\b/gi, ' ')                       // card / phone / masked refs
    .replace(/\b\d{4,}\b/g, ' ')                           // long digit runs
    .replace(/[*#|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toUpperCase();
  return s || String(desc || '').trim().toUpperCase();
}

// Fingerprint for duplicate detection: same day, same amount, same merchant.
function impFingerprint(date, amount, desc) {
  return `${date}|${Math.round(Math.abs(amount) * 100)}|${impMerchant(desc).slice(0, 24)}`;
}

function existingFingerprints() {
  const set = new Set();
  for (const e of (state.expenses || [])) {
    set.add(e.importFp || impFingerprint(e.date, Number(e.amount), e.desc));
  }
  return set;
}

// Looser index: same day, same amount, any description. The exact fingerprint
// catches a re-imported statement, but not an expense you typed by hand — you
// wrote "Grocery run", the bank says "COMPRAS C.DEB CONTINENTE 1234 LIS". Same
// transaction, no match, silently counted twice. Importing months you already
// tracked manually is the likeliest case, so it needs its own check.
function existingByDateAmount() {
  const m = new Map();
  for (const e of (state.expenses || [])) {
    const k = `${e.date}|${Math.round(Math.abs(Number(e.amount)) * 100)}`;
    if (!m.has(k)) m.set(k, e.desc);
  }
  return m;
}

// ── Learned rules ────────────────────────────────────────────────────────────
// merchant → category, grown from every confirmed import. Deterministic, free
// and instant; the AI is only consulted for merchants never seen before.
function impRules() {
  if (!state.merchantRules) state.merchantRules = {};
  return state.merchantRules;
}

function impLearn(merchant, category) {
  if (!merchant || !category) return;
  impRules()[merchant] = category;
}

// Longest-prefix match, because banks truncate descriptions inconsistently
function impGuessCategory(desc) {
  const m = impMerchant(desc);
  const rules = impRules();
  if (rules[m]) return { cat: rules[m], src: 'learned' };
  let best = null;
  for (const key of Object.keys(rules)) {
    if ((m.startsWith(key) || key.startsWith(m)) && Math.min(key.length, m.length) >= 5) {
      if (!best || key.length > best.length) best = key;
    }
  }
  if (best) return { cat: rules[best], src: 'learned' };

  // Fall back to your own expense history before asking anyone
  const hist = (state.expenses || []).find(e => impMerchant(e.desc) === m && e.cat);
  if (hist) return { cat: hist.cat, src: 'history' };
  return { cat: null, src: 'new' };
}

// ── Header + column detection ────────────────────────────────────────────────
const IMP_HINTS = {
  date:   [/^data/i, /^date/i, /valuta/i, /mov/i],
  desc:   [/descri/i, /description/i, /hist[oó]ric/i, /detalh/i, /concept/i, /narrative/i],
  amount: [/montante/i, /^valor/i, /amount/i, /importe/i],
  debit:  [/d[eé]bito/i, /debit/i, /sa[ií]da/i],
  credit: [/cr[eé]dito/i, /credit/i, /entrada/i],
  balance:[/saldo/i, /balance/i],
};

// CGD prefixes the sheet with ~8 metadata rows ("Nome cliente", "Período"…), so
// the header is not row 1. Find the row whose *following* rows parse as data.
function impDetectLayout(grid) {
  let headerRow = -1, best = 0;
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const cells = grid[r].map(c => String(c || ''));
    if (cells.filter(c => c).length < 2) continue;
    let score = 0;
    for (const c of cells) {
      for (const pats of Object.values(IMP_HINTS)) if (pats.some(p => p.test(c))) { score++; break; }
    }
    // must be followed by something that actually looks like a transaction
    const nxt = grid[r + 1] || [];
    const looksData = nxt.some(c => impDate(c)) && nxt.some(c => impNum(c) != null);
    if (score >= 2 && looksData && score > best) { best = score; headerRow = r; }
  }

  if (headerRow === -1) {                       // no headers — infer from the data itself
    for (let r = 0; r < Math.min(grid.length, 30); r++) {
      if (grid[r].some(c => impDate(c)) && grid[r].some(c => impNum(c) != null)) { headerRow = r - 1; break; }
    }
  }

  const header = grid[headerRow] ? grid[headerRow].map(c => String(c || '')) : [];
  const body   = grid.slice(headerRow + 1).filter(r => r.some(c => String(c || '').trim()));
  const find = key => header.findIndex(c => IMP_HINTS[key].some(p => p.test(c)));

  const map = { headerRow, date: find('date'), desc: find('desc'),
                amount: find('amount'), debit: find('debit'), credit: find('credit') };

  // Heuristic fill for anything the headers didn't name: the column where most
  // cells parse as dates is the date, most-numeric is the amount, longest text
  // is the description.
  const cols = Math.max(...body.slice(0, 40).map(r => r.length), header.length);
  const stat = [];
  for (let c = 0; c < cols; c++) {
    let d = 0, n = 0, len = 0, cnt = 0;
    for (const row of body.slice(0, 40)) {
      const v = row[c]; if (v == null || v === '') continue;
      cnt++; if (impDate(v)) d++; if (impNum(v) != null) n++; len += String(v).length;
    }
    stat[c] = { d, n, avg: cnt ? len / cnt : 0, cnt };
  }
  const bal = header.findIndex(c => IMP_HINTS.balance.some(p => p.test(c)));
  if (map.date   < 0) map.date   = stat.reduce((b, s, i) => s.d > (stat[b]?.d ?? -1) ? i : b, 0);
  if (map.desc   < 0) map.desc   = stat.reduce((b, s, i) => s.avg > (stat[b]?.avg ?? -1) && s.d === 0 ? i : b, 0);
  if (map.amount < 0 && map.debit < 0 && map.credit < 0) {
    map.amount = stat.reduce((b, s, i) =>
      (i !== map.date && i !== bal && s.n > (stat[b]?.n ?? -1)) ? i : b, -1);
  }
  return { map, header, body };
}

// ── Build reviewable rows ────────────────────────────────────────────────────
function impBuildRows(body, map) {
  const seen  = existingFingerprints();
  const loose = existingByDateAmount();
  const rows = [];
  for (const r of body) {
    const date = impDate(r[map.date]);
    const desc = String(r[map.desc] ?? '').trim();
    let amount = null;
    if (map.amount >= 0) amount = impNum(r[map.amount]);
    else {
      const d = map.debit  >= 0 ? impNum(r[map.debit])  : null;
      const c = map.credit >= 0 ? impNum(r[map.credit]) : null;
      if (d != null && d !== 0) amount = -Math.abs(d);
      else if (c != null && c !== 0) amount = Math.abs(c);
    }
    if (!date || amount == null || amount === 0 || !desc) continue;

    const fp   = impFingerprint(date, amount, desc);
    const dup  = seen.has(fp);
    const near = dup ? null : loose.get(`${date}|${Math.round(Math.abs(amount) * 100)}`) || null;
    const isCredit = amount > 0;
    const g = isCredit ? { cat: IMP_IGNORE, src: 'credit' } : impGuessCategory(desc);
    rows.push({
      date, desc, amount, fp, dup,
      near,                                   // description of a same-day, same-amount expense
      merchant: impMerchant(desc),
      cat: g.cat, src: g.src,
      // Unticked by default when anything looks like a repeat. Double-counting
      // is worse than re-ticking a row, and the reason is shown either way.
      include: !dup && !near && !isCredit,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows;
}

// ── UI ───────────────────────────────────────────────────────────────────────
function impCategories() {
  const cats = (state.categories && state.categories.length)
    ? [...state.categories]
    : ['Housing','Food','Transport','Healthcare','Entertainment','Shopping','Utilities','Other'];
  return [...cats, IMP_EXTRA, IMP_CASH, IMP_INVEST, IMP_IGNORE];
}

// filePath set = file was dragged in; omitted = open the picker
async function impPickFile(filePath) {
  if (!window.electronAPI?.readStatement) { mardukAlert('File import is unavailable in this build.'); return; }
  const res = await window.electronAPI.readStatement(filePath);
  if (!res) return;                                   // cancelled
  if (!res.rows || !res.rows.length) { mardukAlert(`Could not read ${res.fileName}${res.error ? ': ' + res.error : ''}`); return; }

  _impFile = res.fileName;
  _impGrid = res.rows;
  const { map, header, body } = impDetectLayout(res.rows);
  _impMap = map;
  if (!body.length || map.date < 0) {
    mardukAlert('No transactions found in that file. Check it is an account-movements export.');
    return;
  }
  _impRows = impBuildRows(body, map);
  impRenderMapping(header);
  impRenderReview();
}

function impRenderMapping(header) {
  const card = document.getElementById('imp-map-card');
  const wrap = document.getElementById('imp-map-fields');
  if (!card || !wrap) return;
  card.style.display = '';
  const opts = (sel) => header.map((h, i) =>
    `<option value="${i}"${i === sel ? ' selected' : ''}>${h || `Column ${i + 1}`}</option>`).join('');
  const fields = [['date','Date'], ['desc','Description'], ['amount','Amount'],
                  ['debit','Debit (if split)'], ['credit','Credit (if split)']];
  wrap.innerHTML = fields.map(([k, label]) => `
    <div class="field"><label>${label}</label>
      <select data-impmap="${k}" style="width:100%;">
        <option value="-1"${(_impMap[k] ?? -1) < 0 ? ' selected' : ''}>— none —</option>
        ${opts(_impMap[k])}
      </select>
    </div>`).join('');
  wrap.querySelectorAll('select[data-impmap]').forEach(sel => {
    sel.addEventListener('change', () => {
      _impMap[sel.dataset.impmap] = Number(sel.value);
      const { body } = impDetectLayout(_impGrid);
      _impRows = impBuildRows(body, _impMap);
      impRenderReview();
    });
  });
  document.getElementById('imp-map-note').textContent =
    `${_impFile} · header detected on row ${_impMap.headerRow + 1}`;
}

function impRenderReview() {
  const card = document.getElementById('imp-review-card');
  const body = document.getElementById('imp-rows');
  if (!card || !body || !_impRows) return;
  card.style.display = '';

  const cats = impCategories();
  const catSel = (row, i) => `<select data-improw="${i}" style="width:100%;padding:4px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:Karla,sans-serif;font-size:12px;">
      <option value=""${!row.cat ? ' selected' : ''}>— choose —</option>
      ${cats.map(c => `<option${c === row.cat ? ' selected' : ''}>${c}</option>`).join('')}
    </select>`;
  // Where the suggested category came from. Colour carries the meaning at a
  // glance: green = already known, gold = needs a decision, blue = income.
  const srcLabel = { learned: 'Learned', history: 'From history', ai: 'AI', new: 'New', credit: 'Credit', manual: 'You' };
  const srcBadge = src => src && srcLabel[src]
    ? `<span class="src-badge src-${src}">${srcLabel[src]}</span>` : '';

  body.innerHTML = _impRows.map((r, i) => `
    <tr style="${r.dup ? 'opacity:.45;' : ''}">
      <td style="text-align:center;"><input type="checkbox" data-impinc="${i}"${r.include ? ' checked' : ''} style="width:15px;height:15px;accent-color:var(--gold);cursor:pointer;"></td>
      <td class="muted" style="white-space:nowrap;text-align:center;">${r.date}</td>
      <td>${r.desc}${
        r.dup  ? ' <span style="font-size:10px;color:var(--gold);">already imported</span>'
      : r.near ? ` <span style="font-size:10px;color:var(--gold);" title="You already have an expense for this date and amount">possibly already logged as “${r.near}”</span>`
      : ''}</td>
      <td style="text-align:right;font-weight:600;" class="${r.amount < 0 ? '' : 'up-text'}">${eur(Math.abs(r.amount))}</td>
      <td>${catSel(r, i)}</td>
      <td style="text-align:center;">${srcBadge(r.src)}</td>
    </tr>`).join('');

  body.querySelectorAll('select[data-improw]').forEach(sel => {
    sel.addEventListener('change', () => {
      const r = _impRows[Number(sel.dataset.improw)];
      r.cat = sel.value || null;
      r.src = 'manual';
      impRenderSummary();
    });
  });
  body.querySelectorAll('input[data-impinc]').forEach(cb => {
    cb.addEventListener('change', () => {
      _impRows[Number(cb.dataset.impinc)].include = cb.checked;
      impRenderSummary();
    });
  });

  const bulk = document.getElementById('imp-bulk-cat');
  if (bulk) bulk.innerHTML = cats.map(c => `<option>${c}</option>`).join('');
  impRenderSummary();
}

function impRenderSummary() {
  if (!_impRows) return;
  const inc  = _impRows.filter(r => r.include);
  const dups = _impRows.filter(r => r.dup).length;
  const near = _impRows.filter(r => r.near && !r.dup).length;
  const need = inc.filter(r => !r.cat).length;
  const sum  = inc.filter(r => ![IMP_IGNORE, IMP_INVEST, IMP_EXTRA, IMP_CASH].includes(r.cat))
                  .reduce((s, r) => s + Math.abs(r.amount), 0);
  const el = document.getElementById('imp-summary');
  if (el) el.innerHTML =
    `${_impRows.length} rows · <strong>${inc.length} selected</strong>` +
    (need ? ` · <span style="color:var(--gold);">${need} still need a category</span>` : ' · all categorised') +
    (dups ? ` · ${dups} already imported` : '') +
    (near ? ` · <span style="color:var(--gold);">${near} possibly already logged by hand</span>` : '');
  const tot = document.getElementById('imp-total');
  if (tot) tot.textContent = `Will add ${eur(sum)} of expenses`;
  const btn = document.getElementById('imp-commit');
  if (btn) { btn.disabled = !inc.length || need > 0; btn.style.opacity = btn.disabled ? .5 : 1; }
}

// ── Commit ───────────────────────────────────────────────────────────────────
function impCommit() {
  if (!_impRows) return;
  const inc = _impRows.filter(r => r.include && r.cat);
  if (!inc.length) return;
  const batch = 'imp_' + Date.now().toString(36);
  let added = 0, allocated = 0, ignored = 0, extras = 0, cashAdded = 0;
  const cashPort = (typeof ap === 'function' ? ap() : null) || (state.portfolios || [])[0] || null;

  for (const r of inc) {
    impLearn(r.merchant, r.cat);                    // learn from every confirmation
    if (r.cat === IMP_IGNORE) { ignored++; continue; }
    if (r.cat === IMP_CASH) {
      // Money that reached the broker but is not invested yet — the Cash card
      // in the Portfolio tab. Always EUR: statement amounts are account currency.
      if (cashPort) {
        if (!cashPort.cashEntries) cashPort.cashEntries = [];
        const eurEntry = cashPort.cashEntries.find(c => c.currency === 'EUR');
        const amt = parseFloat(Math.abs(r.amount).toFixed(2));
        if (eurEntry) eurEntry.amount = parseFloat((eurEntry.amount + amt).toFixed(2));
        else cashPort.cashEntries.push({ currency: 'EUR', amount: amt });
        cashAdded = parseFloat((cashAdded + amt).toFixed(2));
      }
      continue;
    }
    if (r.cat === IMP_EXTRA) {
      // A credit that is genuinely income — lands in the Budget tab's Extra
      // income list, same shape as logExtra() writes, so it counts toward that
      // month's income and savings rate instead of becoming a negative expense.
      if (!state.extraIncomes) state.extraIncomes = [];
      state.extraIncomes.push({
        id: uid(), desc: r.desc, amount: Math.abs(r.amount),
        date: r.date, month: r.date.slice(0, 7), importBatch: batch,
      });
      extras++;
      continue;
    }
    if (r.cat === IMP_INVEST) {
      // Money moved to the broker is an allocation, not spending
      const pid = (state.portfolios || [])[0]?.id;
      if (pid) {
        if (!state.allocations) state.allocations = [];
        state.allocations.push({
          id: uid(), portfolioId: pid, amountAllocated: Math.abs(r.amount), amountInvested: 0,
          allocationDate: r.date, status: 'open', notes: `From statement: ${r.desc}`,
          importBatch: batch, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        allocated++;
      }
      continue;
    }
    state.expenses.push({
      id: uid(), desc: r.desc, amount: Math.abs(r.amount), cat: r.cat,
      date: r.date, recurring: false, importBatch: batch, importFp: r.fp,
    });
    added++;
  }

  if (cashAdded && cashPort) cashPort.cash = getCashTotalEur();

  if (!state.importBatches) state.importBatches = [];
  state.importBatches.unshift({
    id: batch, file: _impFile, at: new Date().toISOString(),
    expenses: added, allocations: allocated, ignored, extras,
    cash: cashAdded, cashPortfolioId: cashPort ? cashPort.id : null,
  });
  state.importBatches = state.importBatches.slice(0, 20);

  save();
  impReset();
  renderAll();
  renderImportView();
  mardukAlert(`Imported ${added} expense${added === 1 ? '' : 's'}` +
        (extras ? `, ${extras} extra income entr${extras === 1 ? 'y' : 'ies'}` : '') +
        (cashAdded ? `, ${eur(cashAdded)} to cash` : '') +
        (allocated ? `, ${allocated} investment allocation${allocated === 1 ? '' : 's'}` : '') +
        (ignored ? `, ${ignored} ignored` : '') + '.', 'IMPORT COMPLETE');
}

async function impUndoBatch(batchId) {
  const b = (state.importBatches || []).find(x => x.id === batchId);
  if (!b) return;
  if (!await mardukConfirm(`Undo this import?\n\n${b.expenses} expense(s)` +
               (b.allocations ? `, ${b.allocations} allocation(s)` : '') +
               (b.extras ? `, ${b.extras} extra income entr${b.extras === 1 ? 'y' : 'ies'}` : '') +
               (b.cash ? `, ${eur(b.cash)} of cash` : '') +
               ` from ${b.file} will be removed.`)) return;
  state.expenses     = (state.expenses || []).filter(e => e.importBatch !== batchId);
  state.allocations  = (state.allocations || []).filter(a => a.importBatch !== batchId);
  state.extraIncomes = (state.extraIncomes || []).filter(x => x.importBatch !== batchId);
  if (b.cash) {
    const p = (state.portfolios || []).find(x => x.id === b.cashPortfolioId);
    const e = p && (p.cashEntries || []).find(c => c.currency === 'EUR');
    if (e) { e.amount = parseFloat(Math.max(0, e.amount - b.cash).toFixed(2)); p.cash = getCashTotalEur(); }
  }
  state.importBatches = (state.importBatches || []).filter(x => x.id !== batchId);
  save(); renderAll(); renderImportView();
}

function impReset() {
  _impRows = _impGrid = _impMap = null; _impFile = '';
  ['imp-map-card', 'imp-review-card'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
}

function impDeleteRule(merchant) {
  delete impRules()[merchant];
  save(); renderImportView();
}

// ── Sub-view render ──────────────────────────────────────────────────────────
function renderImportView() {
  const hist = document.getElementById('imp-history');
  if (hist) {
    const b = state.importBatches || [];
    hist.innerHTML = !b.length
      ? '<p class="muted" style="font-size:12px;">No imports yet.</p>'
      : `<table class="data-table"><thead><tr><th>File</th><th>When</th><th style="text-align:right;">Added</th><th></th></tr></thead><tbody>${
          b.map(x => `<tr>
            <td>${x.file}</td>
            <td class="muted">${new Date(x.at).toLocaleString('en-GB', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
            <td style="text-align:right;">${x.expenses} expense${x.expenses === 1 ? '' : 's'}${x.allocations ? ` · ${x.allocations} alloc` : ''}</td>
            <td style="text-align:right;"><button class="btn-ghost" data-impundo="${x.id}" style="font-size:11px;padding:4px 10px;">Undo</button></td>
          </tr>`).join('')}</tbody></table>`;
    hist.querySelectorAll('button[data-impundo]').forEach(btn =>
      btn.addEventListener('click', () => impUndoBatch(btn.dataset.impundo)));
  }

  const rules = document.getElementById('imp-rules');
  if (rules) {
    const keys = Object.keys(impRules()).sort();
    rules.innerHTML = !keys.length
      ? '<p class="muted" style="font-size:12px;">Nothing learned yet. Categories you assign during an import are remembered here.</p>'
      : `<table class="data-table"><thead><tr><th>Merchant</th><th>Category</th><th></th></tr></thead><tbody>${
          keys.map(k => `<tr>
            <td>${k}</td><td>${impRules()[k]}</td>
            <td style="text-align:right;"><button class="btn-ghost" data-imprule="${encodeURIComponent(k)}" style="font-size:11px;padding:4px 10px;">Forget</button></td>
          </tr>`).join('')}</tbody></table>`;
    rules.querySelectorAll('button[data-imprule]').forEach(btn =>
      btn.addEventListener('click', () => impDeleteRule(decodeURIComponent(btn.dataset.imprule))));
  }
}

// ── Wiring (once, after DOM is ready) ────────────────────────────────────────
// initApp() re-runs on every unlock, so without this guard each lock/unlock
// cycle stacked another set of listeners on the drop zone — three unlocks meant
// three file dialogs from a single drop.
let _impInited = false;

function initBankImport() {
  if (_impInited) return;
  _impInited = true;

  const drop = document.getElementById('imp-drop');
  if (drop) {
    drop.addEventListener('click', () => impPickFile());   // no arg — opens the picker
    drop.addEventListener('dragover', e => {
      e.preventDefault(); drop.style.borderColor = 'var(--gold)'; drop.style.background = 'rgba(201,168,76,0.06)';
    });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = 'var(--border)'; drop.style.background = ''; });
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.style.borderColor = 'var(--border)'; drop.style.background = '';
      // Electron exposes the real path on a dropped File, so use the file you
      // actually dropped instead of asking you to pick it again.
      const f = e.dataTransfer?.files?.[0];
      const p = f && (f.path || window.electronAPI?.getPathForFile?.(f));
      if (p) impPickFile(p);
      else if (f) mardukAlert(`Could not read the path for "${f.name}". Click the box to choose it instead.`);
      else impPickFile();
    });
  }
  document.getElementById('imp-commit')?.addEventListener('click', impCommit);
  document.getElementById('imp-cancel')?.addEventListener('click', () => { impReset(); renderImportView(); });
  document.getElementById('imp-check-all')?.addEventListener('change', e => {
    if (!_impRows) return;
    _impRows.forEach(r => { if (!r.dup) r.include = e.target.checked; });
    impRenderReview();
  });
  document.getElementById('imp-bulk-apply')?.addEventListener('click', () => {
    if (!_impRows) return;
    const cat = document.getElementById('imp-bulk-cat').value;
    _impRows.forEach(r => { if (r.include) { r.cat = cat; r.src = 'manual'; } });
    impRenderReview();
  });
}
