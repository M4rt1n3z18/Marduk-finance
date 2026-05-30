// ══════════════ CUSTOM CALENDAR ══════════════
(function() {
  // Inject calendar popup into DOM
  const pop = document.createElement('div');
  pop.id = 'cal-popup';
  document.body.appendChild(pop);

  let calTarget = null, calYear = 0, calMonth = 0;
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function openCal(inp) {
    calTarget = inp;
    const raw = inp.dataset.raw || '';
    const base = raw ? new Date(raw + 'T00:00:00') : new Date();
    calYear  = base.getFullYear();
    calMonth = base.getMonth();
    renderCalPop();
    const rect = inp.getBoundingClientRect();
    const win  = { w: window.innerWidth, h: window.innerHeight };
    pop.style.left = Math.min(rect.left, win.w - 290) + 'px';
    pop.style.top  = rect.bottom + 6 < win.h - 300 ? (rect.bottom + 6) + 'px' : (rect.top - 310) + 'px';
    pop.classList.add('open');
  }

  function closeCal() { pop.classList.remove('open'); calTarget = null; }

  function renderCalPop() {
    const today  = new Date();
    const selRaw = calTarget && calTarget.dataset.raw || '';
    const fd = new Date(calYear, calMonth, 1).getDay();
    const dm = new Date(calYear, calMonth + 1, 0).getDate();
    const pp = new Date(calYear, calMonth, 0).getDate();
    let cells = '';
    for (let i = fd - 1; i >= 0; i--)
      cells += `<div class="cal-day cal-other">${pp - i}</div>`;
    for (let d = 1; d <= dm; d++) {
      const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isT = today.getFullYear()===calYear && today.getMonth()===calMonth && today.getDate()===d;
      const isS = ds === selRaw;
      cells += `<div class="cal-day${isT?' cal-today':''}${isS?' cal-selected':''}" onclick="window._calSel('${ds}')">${d}</div>`;
    }
    const rem = (7 - ((fd + dm) % 7)) % 7;
    for (let d = 1; d <= rem; d++) cells += `<div class="cal-day cal-other">${d}</div>`;

    pop.innerHTML = `
      <div class="cal-header">
        <button class="cal-nav-btn" onclick="window._calNav(-12)" title="Previous year" style="font-size:11px;">«</button>
        <button class="cal-nav-btn" onclick="window._calNav(-1)">‹</button>
        <span class="cal-month-label" style="cursor:pointer;user-select:none;" onclick="window._calYearPick()" title="Click to pick year">${MONTHS[calMonth]} ${calYear}</span>
        <button class="cal-nav-btn" onclick="window._calNav(1)">›</button>
        <button class="cal-nav-btn" onclick="window._calNav(12)" title="Next year" style="font-size:11px;">»</button>
      </div>
      <div class="cal-grid">
        ${DAYS.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>
      <button class="cal-today-btn" onclick="window._calToday()">Today</button>`;
  }

  window._calNav = function(dir) {
    calMonth += dir;
    if (calMonth > 11) { calYear += Math.floor(calMonth / 12); calMonth = calMonth % 12; }
    if (calMonth < 0)  { calYear += Math.floor(calMonth / 12); calMonth = ((calMonth % 12) + 12) % 12; }
    renderCalPop();
  };

  window._calYearPick = function() {
    // Show a compact year grid centred on calYear
    const base = calYear - 4;
    const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let rows = '';
    // Year selector row
    rows += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <button class="cal-nav-btn" onclick="window._calYearScroll(-12)" style="font-size:11px;">«</button>
      <button class="cal-nav-btn" onclick="window._calYearScroll(-1)">‹</button>
      <span class="cal-month-label" id="cal-yr-label">${calYear}</span>
      <button class="cal-nav-btn" onclick="window._calYearScroll(1)">›</button>
      <button class="cal-nav-btn" onclick="window._calYearScroll(12)" style="font-size:11px;">»</button>
    </div>`;
    rows += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">`;
    for (let i = 0; i < 12; i++) {
      const active = i === calMonth ? 'background:var(--gold);color:#0d0d0f;font-weight:700;' : '';
      rows += `<button onclick="window._calMonthPick(${i})" style="padding:6px 4px;border:1px solid var(--border);border-radius:7px;background:var(--bg3);color:var(--text2);cursor:pointer;font-family:Karla,sans-serif;font-size:12px;transition:all .15s;${active}"
        onmouseover="if(!this.style.background.includes('gold'))this.style.background='var(--bg4)'"
        onmouseout="if(!this.style.background.includes('gold'))this.style.background='var(--bg3)'">${SHORT_MONTHS[i]}</button>`;
    }
    rows += `</div>`;
    pop.innerHTML = rows;
  };

  window._calYearScroll = function(dir) {
    calYear += dir;
    window._calYearPick();
  };

  window._calMonthPick = function(m) {
    calMonth = m;
    renderCalPop();
  };

  window._calToday = function() {
    const t = new Date();
    window._calSel(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`);
  };

  window._calSel = function(ds) {
    if (!calTarget) return;
    calTarget.dataset.raw = ds;
    calTarget.value = fmtDate(ds);
    calTarget.dispatchEvent(new Event('change', {bubbles:true}));
    closeCal();
  };

  window.fmtDate = function(raw) {
    if (!raw) return '';
    const [y,m,d] = raw.split('-');
    return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${y}`;
  };

  // Raw YYYY-MM-DD value getter (for code that needs it)
  window.getDateRaw = function(id) {
    const el = document.getElementById(id);
    return el ? (el.dataset.raw || el.value || '') : '';
  };

  // Programmatic setter
  window.setDateField = function(id, raw) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.raw = raw;
    el.value = raw ? fmtDate(raw) : '';
  };

  // Intercept mousedown to block native date picker
  document.addEventListener('mousedown', e => {
    if (pop.contains(e.target)) return;
    if (e.target.classList.contains('date-field')) {
      e.preventDefault();
      openCal(e.target);
      return;
    }
    closeCal();
  }, true);
})();
