// ══════════════ AUTOCOMPLETE ══════════════
let acIndex = -1;
let acSearchTimer = null;

// Tickers you already own, as autocomplete entries. TICKER_DB holds ~314 large
// caps, so most real portfolios contain symbols it has never heard of — and when
// Yahoo's live search is rate-limited the dropdown came up empty, which looked
// like "Marduk doesn't know this ticker". Whatever you hold is always known.
function ownedTickerEntries() {
  const seen = new Map();
  for (const p of (state.portfolios || [])) {
    for (const h of (p.holdings || [])) {
      if (!h.ticker || seen.has(h.ticker)) continue;
      const known = TICKER_DB.find(x => x.t === h.ticker);
      seen.set(h.ticker, { t: h.ticker, n: known ? known.n : (h.sector || 'In your portfolio'), c: h.assetClass || 'Stock' });
    }
  }
  return [...seen.values()];
}

function renderAcDrop(matches, input, note) {
  const drop = document.getElementById('ac-drop');
  if (!matches.length && !note) { drop.classList.remove('open'); return; }
  drop.innerHTML = matches.map(m =>
    `<div class="ac-item" data-ticker="${m.t}" onmousedown="acSelect('${m.t}','${(m.c||'Stock').replace(/'/g,"\\'")}')">
      <span class="ac-ticker">${m.t}</span><span class="ac-name">${m.n}</span>
    </div>`
  ).join('') + (note
    ? `<div style="padding:8px 14px;font-size:11px;color:var(--text3);border-top:1px solid var(--border);">${note}</div>`
    : '');
  const rect = input.getBoundingClientRect();
  drop.style.top = (rect.bottom + 4) + 'px';
  drop.style.left = rect.left + 'px';
  drop.style.width = Math.max(rect.width, 280) + 'px';
  drop.classList.add('open');
}

function acTicker(input) {
  const q = input.value.trim().toUpperCase();
  const drop = document.getElementById('ac-drop');
  acIndex = -1;
  if (!q || q.length < 1) { drop.classList.remove('open'); clearTimeout(acSearchTimer); return; }

  // 1. Show local results instantly — your own holdings first, then the built-in DB
  const pool = [...ownedTickerEntries(), ...TICKER_DB];
  const seen = new Set();
  const local = pool.filter(x => {
    if (seen.has(x.t)) return false;
    if (!(x.t.startsWith(q) || x.n.toUpperCase().includes(q))) return false;
    seen.add(x.t); return true;
  }).slice(0, 8);
  renderAcDrop(local, input);

  // 2. Debounce live search from Yahoo Finance (fires 400ms after typing stops)
  clearTimeout(acSearchTimer);
  acSearchTimer = setTimeout(async () => {
    if (!window.electronAPI) return;
    try {
      const live = await window.electronAPI.searchTickers(input.value.trim());
      if (input.value.trim().toUpperCase() !== q) return; // user kept typing
      // null = rate limited (couldn't ask). [] = asked, genuinely nothing found.
      if (live === null) {
        renderAcDrop(local, input, local.length
          ? 'Live search unavailable — showing known tickers only'
          : 'Live search rate-limited. Type the exact ticker and continue.');
        return;
      }
      if (!live.length) return;
      // Merge: live results first, then local ones not already in live
      const liveSymbols = new Set(live.map(x => x.t));
      const merged = [...live, ...local.filter(x => !liveSymbols.has(x.t))].slice(0, 10);
      renderAcDrop(merged, input);
    } catch(e) {}
  }, 400);
}
function setClassBadge(cls) {
  const map = {'Stock':'stock','ETF/Fund':'etf','Crypto':'crypto','Bond':'bond','Cash':'cash'};
  const badge = document.getElementById('h-class-badge');
  if (!badge) return;
  badge.className = 'badge ' + (map[cls] || 'stock');
  badge.textContent = cls;
  document.getElementById('h-class').value = cls;
}
function acSelect(ticker, cls) {
  document.getElementById('h-ticker').value = ticker;
  document.getElementById('ac-drop').classList.remove('open');
  clearTimeout(acSearchTimer);
  acIndex = -1;
  const entry = TICKER_DB.find(x => x.t === ticker);
  const assetClass = (entry && entry.c) || cls || 'Stock';
  setClassBadge(assetClass);
}
function acAutoDetect(input) {
  const ticker = input.value.trim().toUpperCase();
  if (!ticker) return;
  const entry = TICKER_DB.find(x => x.t === ticker);
  if (entry && entry.c) setClassBadge(entry.c);
}
function acKey(e) {
  const drop = document.getElementById('ac-drop');
  const items = drop.querySelectorAll('.ac-item');
  if (!drop.classList.contains('open')) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = Math.min(acIndex+1, items.length-1); items.forEach((el,i)=>el.classList.toggle('selected',i===acIndex)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = Math.max(acIndex-1, 0); items.forEach((el,i)=>el.classList.toggle('selected',i===acIndex)); }
  else if (e.key === 'Enter' && acIndex >= 0 && acIndex < items.length) { e.preventDefault(); acSelect(items[acIndex].dataset.ticker); }
  else if (e.key === 'Escape') { drop.classList.remove('open'); }
}
document.addEventListener('click', e => {
  if (!e.target.closest('.autocomplete-wrap')) document.getElementById('ac-drop').classList.remove('open');
});


const uid = () => Math.random().toString(36).slice(2,9);
const eur = (n, d=2) => '€' + Number(n).toLocaleString('de-DE', {minimumFractionDigits:d, maximumFractionDigits:d});
const pct = n => (n>=0?'+':'')+Number(n).toFixed(2)+'%';

let _toastTimer;
function showToast(msg, duration = 4000) {
  const el = document.getElementById('marduk-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}
// `now` is refreshed at the start of every renderAll() so it always reflects the current date
let now = new Date();

