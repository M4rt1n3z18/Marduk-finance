// ══════════════ AUTOCOMPLETE ══════════════
let acIndex = -1;
let acSearchTimer = null;

function renderAcDrop(matches, input) {
  const drop = document.getElementById('ac-drop');
  if (!matches.length) { drop.classList.remove('open'); return; }
  drop.innerHTML = matches.map(m =>
    `<div class="ac-item" data-ticker="${m.t}" onmousedown="acSelect('${m.t}','${(m.c||'Stock').replace(/'/g,"\\'")}')">
      <span class="ac-ticker">${m.t}</span><span class="ac-name">${m.n}</span>
    </div>`
  ).join('');
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

  // 1. Show local results instantly
  const local = TICKER_DB.filter(x =>
    x.t.startsWith(q) || x.n.toUpperCase().includes(q)
  ).slice(0, 8);
  renderAcDrop(local, input);

  // 2. Debounce live search from Yahoo Finance (fires 400ms after typing stops)
  clearTimeout(acSearchTimer);
  acSearchTimer = setTimeout(async () => {
    if (!window.electronAPI) return;
    try {
      const live = await window.electronAPI.searchTickers(input.value.trim());
      if (!live || !live.length) return;
      // Merge: live results first, then local ones not already in live
      const liveSymbols = new Set(live.map(x => x.t));
      const merged = [...live, ...local.filter(x => !liveSymbols.has(x.t))].slice(0, 10);
      // Only re-render if the input still has the same value
      if (input.value.trim().toUpperCase() === q) renderAcDrop(merged, input);
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

