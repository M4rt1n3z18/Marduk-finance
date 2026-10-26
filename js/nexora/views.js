// Redesigned views that still showed Marduk's layouts: Goals, Portfolio →
// Transactions, Dividends and Cash, the allocation strip on the Portfolio
// overview and Expenses → Allocations. Same approach as shell.js: the app's own
// renderers run as before (they keep the data and the old markup in sync), and
// each view is drawn beside them while the old markup is hidden.
(function () {
  const U = window.NX_UI;
  if (!U) return;
  const { I, icon, tile, escH, flagIc, CCY, cssv } = U;
  const tileI = (cls, name) => `<span class="nx-ic ${cls}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg></span>`;
  const SEARCH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
  const CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
  const money = v => eur(v, Number.isInteger(Math.round(+v * 100) / 100) ? 0 : 2);
  const dayMs = 864e5;
  const noon = iso => new Date(iso.slice(0, 10) + 'T12:00:00');
  const todayNoon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
  const hide = el => { if (el) el.style.display = 'none'; };
  // a view's root, created once after `after` (or at the end of `parent`)
  function rootOf(id, parent, after) {
    let r = document.getElementById(id);
    if (!r) {
      r = Object.assign(document.createElement('div'), { id });
      if (after) after.after(r); else parent.appendChild(r);
    }
    return r;
  }

  // ══════════════ GOALS ══════════════
  let goalForm = null;   // null · 'new' · the id of the goal being edited
  let goalAdd = null;    // the goal whose "Add money" box is open
  function goalDue(g) {
    if (!g.deadline) return { text: 'No deadline', days: null };
    const days = Math.round((noon(g.deadline) - todayNoon()) / dayMs);
    if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} overdue`, days, late: true };
    if (days === 0) return { text: 'Due today', days };
    const left = days < 45 ? `${days} day${days === 1 ? '' : 's'} left` : `${Math.round(days / 30.44)} months left`;
    return { text: `by ${fmtDay(g.deadline)} · ${left}`, days };
  }
  function goalFormHtml(g) {
    const edit = !!g;
    return `<form class="nx-goal-card nx-goal-form" id="nx-goal-form" novalidate>
      <div class="nx-goal-form-title">${edit ? 'Edit goal' : 'New goal'}</div>
      <label class="nx-f"><span>Name</span><input name="name" maxlength="60" placeholder="e.g. Emergency fund" value="${edit ? escH(g.name) : ''}"></label>
      <div class="nx-goal-form-row">
        <label class="nx-f"><span>Target (€)</span><input name="target" type="number" min="0" step="0.01" placeholder="10000" value="${edit ? +g.target : ''}"></label>
        <label class="nx-f"><span>Saved so far (€)</span><input name="current" type="number" min="0" step="0.01" placeholder="0" value="${edit ? (+g.current || '') : ''}"></label>
      </div>
      <label class="nx-f"><span>Deadline<em>optional</em></span><input id="nx-goal-deadline" class="date-field" readonly placeholder="Select date…"></label>
      <div class="nx-auth-err"></div>
      <div class="nx-nw-form-btns">${edit && g.deadline ? '<button type="button" class="nx-goal-link" data-act="no-deadline">Remove the deadline</button>' : ''}
        <button type="button" class="btn-ghost" data-act="cancel">Cancel</button><button class="btn" type="submit">${edit ? 'Save' : 'Add goal'}</button></div>
    </form>`;
  }
  function goalCard(g) {
    if (goalForm === g.id) return goalFormHtml(g);
    const target = +g.target || 0, cur = +g.current || 0;
    const pct = target > 0 ? Math.min(cur / target, 1) : 0, left = Math.max(target - cur, 0), done = target > 0 && cur >= target;
    const due = goalDue(g);
    let foot;
    if (done) foot = `<span class="nx-goal-ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${CHECK}</svg><span>Goal reached</span></span>`;
    else if (due.days > 31) foot = `<b>${money(left)}</b> <span>to go</span> · <span>save</span> <b>${eur(Math.ceil(left / Math.max(1, due.days / 30.44)), 0)}</b> <span>a month to make it</span>`;
    else foot = `<b>${money(left)}</b> <span>to go</span>`;
    const fill = done ? 'var(--up)' : 'linear-gradient(90deg, var(--gold), var(--mint))';
    const actions = done ? '' : goalAdd === g.id
      ? `<form class="nx-goal-addf" data-goal="${escH(g.id)}" novalidate><input name="amt" type="number" step="0.01" placeholder="Amount (€)"><button class="btn" type="submit">Add</button><button type="button" class="btn-ghost" data-act="cancel">Cancel</button></form>`
      : `<button type="button" class="nx-inc-act nx-goal-addbtn" data-act="add">${icon('plus', 13)}<span>Add money</span></button>`;
    return `<div class="nx-goal-card${done ? ' done' : ''}" data-goal="${escH(g.id)}">
      <div class="nx-goal-top">${done ? `<span class="nx-ic mint"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${CHECK}</svg></span>` : tile('blue', 'flag')}
        <div class="nx-goal-title"><b>${escH(g.name)}</b><small class="${due.late ? 'nx-stale' : ''}">${due.text}</small></div>
        <div class="nx-goal-tools"><button type="button" class="nx-row-del nx-row-edit" data-act="edit" title="Edit">${icon('pencil', 14)}</button><button type="button" class="nx-row-del" data-act="del" title="Delete">${icon('trash', 14)}</button></div></div>
      <div class="nx-goal-amt"><span class="nx-goal-saved">${money(cur)}</span><span class="nx-goal-of"><span>of</span> ${money(target)}</span><span class="nx-goal-pct">${Math.floor(pct * 100)}%</span></div>
      <div class="nx-limit-track nx-goal-track"><div class="nx-limit-fill" style="width:${(pct * 100).toFixed(1)}%;background:${fill};"></div></div>
      <div class="nx-goal-foot">${foot}</div>
      ${actions ? `<div class="nx-goal-actions">${actions}</div>` : ''}
    </div>`;
  }
  function nxGoals() {
    const tab = document.getElementById('tab-goals');
    if (!tab) return;
    let root = document.getElementById('nx-goals');
    if (!root) {
      hide(document.getElementById('goals-grid'));
      hide(document.getElementById('goal-name')?.closest('.card'));
      root = rootOf('nx-goals', tab);
      root.addEventListener('click', onGoalClick);
      root.addEventListener('submit', onGoalSubmit);
      root.addEventListener('keydown', e => { if (e.key === 'Escape' && (goalForm || goalAdd)) { goalForm = goalAdd = null; nxGoals(); } });
    }
    const goals = state.goals || [];
    const saved = goals.reduce((s, g) => s + (+g.current || 0), 0), target = goals.reduce((s, g) => s + (+g.target || 0), 0);
    const reached = goals.filter(g => +g.target > 0 && +g.current >= +g.target).length;
    const tiles = goals.length + 1, cols = tiles <= 2 || tiles === 4 ? 2 : 3;
    const add = goalForm === 'new' ? goalFormHtml(null)
      : `<button type="button" class="nx-goal-new" data-act="new">${icon('plus', 18)}<b>New goal</b><small>${goals.length ? 'Saving for something else?' : 'A trip, a car, a safety net — track what you’re saving for.'}</small></button>`;
    root.innerHTML = `
      <div class="nx-goals-head"><div><div class="nx-goals-title">Your goals</div>
        ${goals.length ? `<div class="nx-goals-sum"><span>Saved</span> <b>${money(saved)}</b> <span>of</span> <b>${money(target)}</b> · <span>${goals.length === 1 ? '1 goal' : goals.length + ' goals'}</span>${reached ? ` · <span>${reached} reached</span>` : ''}</div>` : ''}</div></div>
      <div class="nx-goal-grid" style="--cols:${cols};">${goals.map(goalCard).join('')}${add}</div>`;
    if (goalForm) {
      const g = goals.find(x => x.id === goalForm);
      if (g?.deadline) setDateField('nx-goal-deadline', g.deadline);
      setTimeout(() => root.querySelector('#nx-goal-form input[name="name"]')?.focus(), 30);
    }
    if (goalAdd) setTimeout(() => root.querySelector('.nx-goal-addf input')?.focus(), 30);
  }
  async function onGoalClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.closest('[data-goal]')?.dataset.goal;
    if (act === 'new') { goalForm = 'new'; goalAdd = null; return nxGoals(); }
    if (act === 'cancel') { goalForm = goalAdd = null; return nxGoals(); }
    if (act === 'edit') { goalForm = id; goalAdd = null; return nxGoals(); }
    if (act === 'add') { goalAdd = id; goalForm = null; return nxGoals(); }
    if (act === 'no-deadline') { setDateField('nx-goal-deadline', ''); b.remove(); return; }
    if (act === 'del') {
      const g = (state.goals || []).find(x => x.id === id); if (!g) return;
      if (!await nexoraConfirm(`Delete the goal “${g.name}”?`)) return;
      state.goals = state.goals.filter(x => x.id !== id);
      save(); renderAll();
    }
  }
  function onGoalSubmit(e) {
    e.preventDefault();
    const f = e.target;
    if (f.classList.contains('nx-goal-addf')) {
      const v = parseFloat(f.elements.amt.value), g = (state.goals || []).find(x => x.id === f.dataset.goal);
      if (!g || !v) { f.elements.amt.focus(); return; }
      g.current = Math.max(0, +((+g.current || 0) + v).toFixed(2));
      goalAdd = null; save(); renderAll(); return;
    }
    const val = n => (f.elements[n]?.value || '').trim(), err = s => { f.querySelector('.nx-auth-err').textContent = s; };
    const name = val('name'), target = parseFloat(val('target')), current = Math.max(0, parseFloat(val('current')) || 0);
    const deadline = getDateRaw('nx-goal-deadline') || '';
    if (!name) return err('Give the goal a name.');
    if (!(target > 0)) return err('Set a target above zero.');
    if (!state.goals) state.goals = [];
    if (goalForm === 'new') state.goals.push({ id: uid(), name, target, current, deadline });
    else { const g = state.goals.find(x => x.id === goalForm); if (g) Object.assign(g, { name, target, current, deadline }); }
    goalForm = null; save(); renderAll();
  }

  // ══════════════ PORTFOLIO → TRANSACTIONS ══════════════
  let txFilter = 'all', txQuery = '', txShow = 40;
  function nxTransactions() {
    const pane = document.getElementById('psub-portfolio-transactions');
    if (!pane) return;
    let root = document.getElementById('nx-tx');
    if (!root) {
      [...pane.children].forEach(hide);
      root = rootOf('nx-tx', pane);
      root.className = 'card';
      root.addEventListener('click', onTxClick);
      root.addEventListener('input', e => {
        if (!e.target.matches('.nx-tx-search input')) return;
        txQuery = e.target.value; txShow = 40;
        drawTxList();
      });
    }
    const all = ap().transactions || [];
    const bought = all.filter(t => t.type !== 'Sell').reduce((s, t) => s + t.price * t.shares, 0);
    const sold = all.filter(t => t.type === 'Sell').reduce((s, t) => s + t.price * t.shares, 0);
    const keepQuery = root.querySelector('.nx-tx-search input') === document.activeElement;
    if (keepQuery) return drawTxList();          // typing: only the list changes, so the field keeps focus
    root.innerHTML = `
      <div class="nx-tx-head"><div><div class="card-title" style="margin:0;">Transactions</div>
        <div class="nx-tx-sum">${all.length ? `<span>${all.length === 1 ? '1 trade' : all.length + ' trades'}</span> · <span>Bought</span> <b>${eur(bought)}</b>${sold ? ` · <span>Sold</span> <b>${eur(sold)}</b>` : ''}` : ''}</div></div>
        ${all.length ? `<div class="nx-tx-tools"><div class="nx-seg" data-txf>${[['all', 'All'], ['Buy', 'Buys'], ['Sell', 'Sells']].map(([v, l]) => `<button type="button" data-v="${v}" class="${txFilter === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          <label class="nx-tx-search">${SEARCH}<input type="search" placeholder="Search ticker or note" value="${escH(txQuery)}"></label></div>` : ''}</div>
      <div class="nx-tx-list"></div>`;
    drawTxList();
  }
  function drawTxList() {
    const list = document.querySelector('#nx-tx .nx-tx-list'); if (!list) return;
    const all = ap().transactions || [];
    if (!all.length) { list.innerHTML = '<div class="nx-empty-line">No trades yet — they’re recorded when you add or import a holding.</div>'; return; }
    const q = txQuery.trim().toLowerCase();
    const rows = all.filter(t => (txFilter === 'all' || (txFilter === 'Sell') === (t.type === 'Sell'))
      && (!q || t.ticker.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));
    if (!rows.length) { list.innerHTML = '<div class="nx-empty-line">No trades match.</div>'; return; }
    const shown = rows.slice(0, txShow), byMonth = new Map();
    for (const t of shown) { const k = t.date.slice(0, 7); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(t); }
    const sum = ts => ts.reduce((s, t) => s + t.price * t.shares, 0);
    let html = `<div class="nx-tx-row nx-tx-cols"><span>Type</span><span>Holding</span><span>Date</span><span>Shares × price</span><span>Amount</span><span></span></div>`;
    for (const [k, ts] of byMonth) {
      const full = rows.filter(t => t.date.startsWith(k));        // month totals count the whole month, not just what's shown
      const b = sum(full.filter(t => t.type !== 'Sell')), s = sum(full.filter(t => t.type === 'Sell'));
      const [y, m] = k.split('-').map(Number);
      html += `<div class="nx-tx-month"><span>${new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
        <small>${b ? `<span>Bought</span> ${eur(b, 0)}` : ''}${b && s ? ' · ' : ''}${s ? `<span>Sold</span> ${eur(s, 0)}` : ''}</small></div>`;
      html += ts.map(t => {
        const sell = t.type === 'Sell';
        return `<div class="nx-tx-row" data-tx="${escH(t.id)}">
          <span><span class="nx-tx-type ${sell ? 'sell' : 'buy'}">${sell ? 'Sell' : 'Buy'}</span></span>
          <span class="nx-tx-tk"><button type="button" class="nx-tx-open" data-open="${escH(t.ticker)}">${escH(t.ticker)}</button>${t.notes ? `<small>${escH(t.notes)}</small>` : ''}</span>
          <span class="nx-tx-date">${fmtDay(t.date, false)}</span>
          <span class="nx-tx-qty">${fmtShares(t.shares)} × ${eur(t.price)}</span>
          <span class="nx-tx-amt">${eur(t.price * t.shares)}${sell && t.costEur != null ? (g => `<small class="${g >= 0 ? 'up-text' : 'down-text'}">${g >= 0 ? '+' : '−'}${eur(Math.abs(g))} <span>gain</span></small>`)(t.price * t.shares - t.costEur) : ''}</span>
          <button type="button" class="nx-row-del" data-act="del" title="Delete this trade">${icon('trash', 14)}</button></div>`;
      }).join('');
    }
    if (rows.length > txShow) html += `<button type="button" class="nx-tx-more" data-act="more">Show ${Math.min(40, rows.length - txShow)} more <span class="nx-tx-more-of">· ${rows.length - txShow} left</span></button>`;
    list.innerHTML = html;
  }
  async function onTxClick(e) {
    const seg = e.target.closest('[data-txf] [data-v]');
    if (seg) { txFilter = seg.dataset.v; txShow = 40; return nxTransactions(); }
    const open = e.target.closest('[data-open]');
    if (open) return openCompanyModal(open.dataset.open);
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'more') { txShow += 40; return drawTxList(); }
    if (b.dataset.act === 'del') {
      const t = (ap().transactions || []).find(x => x.id === b.closest('[data-tx]').dataset.tx); if (!t) return;
      if (!await nexoraConfirm(`Delete this ${t.type === 'Sell' ? 'sale' : 'purchase'} of ${fmtShares(t.shares)} ${t.ticker} on ${fmtDay(t.date)}? The holding is adjusted to match.`)) return;
      delTransaction(t.id);
    }
  }

  // ══════════════ PORTFOLIO → DIVIDENDS ══════════════
  let divAll = false, _divChart = null;
  const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  // Each payment of the last 12 months, repeated a year later on the shares held now.
  // Yahoo's next payment date wins for the holding's first one when it has it.
  function divProjection(port, log) {
    const t = todayNoon(), yearAgo = new Date(t.getTime() - 365 * dayMs), out = [];
    for (const h of port.holdings || []) {
      const recent = log.filter(d => d.ticker === h.ticker && noon(d.date) > yearAgo).sort((a, b) => a.date.localeCompare(b.date));
      recent.forEach(d => {
        const when = noon(d.date); when.setFullYear(when.getFullYear() + 1);
        const perShare = d.shares > 0 ? d.amountEur / d.shares : 0;
        if (perShare > 0 && h.shares > 0) out.push({ ticker: h.ticker, date: localIso(when), amountEur: perShare * h.shares });
      });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  function nxDividends() {
    const pane = document.getElementById('psub-portfolio-dividends');
    if (!pane) return;
    let root = document.getElementById('nx-div');
    if (!root) {
      ['div-received-card', 'div-analysis-card', 'div-calendar-card'].forEach(id => hide(document.getElementById(id)));
      root = rootOf('nx-div', pane);
      root.addEventListener('click', e => {
        if (e.target.closest('[data-act="all"]')) { divAll = !divAll; nxDividends(); }
        const open = e.target.closest('[data-open]'); if (open) openCompanyModal(open.dataset.open);
      });
    }
    ['div-received-card', 'div-analysis-card', 'div-calendar-card'].forEach(id => hide(document.getElementById(id)));
    const port = ap(), t = todayNoon(), yr = t.getFullYear();
    const log = (state.dividendLog || []).filter(d => d.portfolioId === port.id).sort((a, b) => b.date.localeCompare(a.date));
    const proj = divProjection(port, log), next12 = proj.filter(p => noon(p.date) >= t);
    // what a holding pays a year: Yahoo's dividend per share when it has one, else the next 12 months of the projection
    const yearOf = h => (h.dividendPerShare || 0) > 0 ? h.dividendPerShare * h.shares
      : next12.filter(p => p.ticker === h.ticker).reduce((s, p) => s + p.amountEur, 0);
    const payers = (port.holdings || []).filter(h => yearOf(h) > 0);
    if (!log.length && !payers.length) { root.innerHTML = ''; if (_divChart) { _divChart.destroy(); _divChart = null; } return; }
    hide(document.getElementById('psub-div-empty'));

    const value = h => (h.currentPrice || h.buyPrice) * h.shares;
    const portValue = (port.holdings || []).reduce((s, h) => s + value(h), 0);
    const annual = payers.reduce((s, h) => s + yearOf(h), 0);
    const ytd = log.filter(d => d.date.startsWith(String(yr))).reduce((s, d) => s + d.amountEur, 0);
    const sameDayLastYear = `${yr - 1}${localIso(t).slice(4)}`;
    const lastYtd = log.filter(d => d.date.startsWith(String(yr - 1)) && d.date <= sameDayLastYear).reduce((s, d) => s + d.amountEur, 0);
    const allTime = log.reduce((s, d) => s + d.amountEur, 0);
    const delta = lastYtd > 0 ? ytd - lastYtd : null;

    // by holding: what it pays a year, what it has paid, when it pays next
    const rows = [...new Set([...payers.map(h => h.ticker), ...log.map(d => d.ticker)])].map(tk => {
      const h = (port.holdings || []).find(x => x.ticker === tk);
      const perYear = h ? yearOf(h) : 0;
      const yieldPct = !h || !perYear ? null
        : h.dividendPerShare > 0 && h.forwardYield != null ? h.forwardYield * 100
        : value(h) > 0 ? perYear / value(h) * 100 : null;
      const yahooNext = h?.nextPayDate && noon(h.nextPayDate) >= t ? h.nextPayDate : null;
      const next = yahooNext || next12.find(p => p.ticker === tk)?.date || null;
      return { tk, h, perYear, yieldPct, received: log.filter(d => d.ticker === tk).reduce((s, d) => s + d.amountEur, 0), next, estimated: !yahooNext && !!next };
    }).filter(r => r.h || r.received > 0).sort((a, b) => b.perYear - a.perYear || b.received - a.received);
    // a column only when some row has something to put in it
    const has = { yield: rows.some(r => r.yieldPct != null), year: rows.some(r => r.perYear > 0), next: rows.some(r => r.next) };
    const cols = ['minmax(0, 1.1fr)', has.yield && '64px', has.year && 'minmax(0, 1.3fr)', '96px', has.next && '108px'].filter(Boolean).join(' ');
    const maxYear = Math.max(...rows.map(r => r.perYear), 1);

    const recent = divAll ? log : log.slice(0, 6);
    root.innerHTML = `
      <div class="card nx-div-hero">
        <div class="nx-div-hero-main">
          <div class="nx-nw-label">Dividends received in ${yr}</div>
          <div class="nx-nw-big">${eur(ytd)}</div>
          <div class="nx-nw-chips">${delta != null ? `<span class="nx-delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : '−'}${eur(Math.abs(delta), 0)} <span>vs this time last year</span></span>` : ''}
            ${allTime > ytd ? `<span class="nx-delta nx-delta-flat"><span>All time</span> ${eur(allTime, 0)}</span>` : ''}</div>
        </div>
        ${annual > 0 ? `<div class="nx-div-figs">
          <div class="nx-div-fig">${tile('mint', 'coins')}<div><small>Expected a year</small><b>${eur(annual)}</b></div></div>
          <div class="nx-div-fig">${tileI('blue', 'cal')}<div><small>A month, on average</small><b>${eur(annual / 12)}</b></div></div>
          <div class="nx-div-fig">${tile('amber', 'pie')}<div><small>Portfolio yield</small><b>${portValue ? (annual / portValue * 100).toFixed(2) : '0.00'}%</b></div></div>
        </div>` : ''}
      </div>
      <div class="card">
        <div class="nx-nw-head"><div><div class="card-title" style="margin:0;">Month by month</div>
          <div class="nx-div-note">The last 12 months as received; the next 12 repeat them on the shares you hold today.</div></div>
          <div class="nx-sal-keys"><span><i style="background:var(--up)"></i>Received</span><span><i class="nx-key-exp"></i>Expected</span></div></div>
        <div class="chart-wrap" style="height:220px;"><canvas id="nx-div-chart"></canvas></div>
      </div>
      <div class="nx-div-grid">
        <div class="card">
          <div class="card-title">By holding</div>
          <div class="nx-div-table" style="--div-cols:${cols};">
            <div class="nx-div-row nx-div-cols"><span>Holding</span>${has.yield ? '<span class="r">Yield</span>' : ''}${has.year ? '<span>A year</span>' : ''}<span class="r">Received</span>${has.next ? '<span>Next payment</span>' : ''}</div>
            ${rows.map(r => `<div class="nx-div-row">
              <span class="nx-div-tk"><button type="button" class="nx-tx-open" data-open="${escH(r.tk)}">${escH(r.tk)}</button>${r.h ? `<small>${fmtShares(r.h.shares)} sh</small>` : '<small>Sold</small>'}</span>
              ${has.yield ? `<span class="nx-div-num">${r.yieldPct != null ? r.yieldPct.toFixed(2) + '%' : ''}</span>` : ''}
              ${has.year ? `<span class="nx-div-year">${r.perYear ? `<b>${eur(r.perYear)}</b><i><em style="width:${(r.perYear / maxYear * 100).toFixed(1)}%"></em></i>` : ''}</span>` : ''}
              <span class="nx-div-num nx-div-rec">${r.received ? eur(r.received) : ''}</span>
              ${has.next ? `<span class="nx-div-next">${r.next ? `<span>${fmtDay(r.next)}</span>${r.estimated ? '<small>estimated</small>' : ''}` : ''}</span>` : ''}
            </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="nx-nw-head"><div class="card-title" style="margin:0;">Payments</div>${log.length ? `<span class="nx-div-count">${log.length}</span>` : ''}</div>
          ${log.length ? `<div class="nx-div-pays">${recent.map(d => `<div class="nx-div-pay">
              <div class="nx-div-pay-main"><b>${escH(d.ticker)}</b><small>${fmtShares(d.shares)} sh × ${d.currency && d.currency !== 'EUR' ? (CURRENCY_SYMBOLS[d.currency] || d.currency + ' ') : '€'}${(+d.perShare).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</small></div>
              <span class="nx-div-pay-date">${fmtDay(d.date)}</span><span class="nx-div-pay-amt">+${eur(d.amountEur)}</span></div>`).join('')}</div>
            ${log.length > 6 ? `<button type="button" class="nx-tx-more" data-act="all">${divAll ? 'Show fewer' : `Show all ${log.length}`}</button>` : ''}`
          : '<div class="nx-empty-line">Payments appear here as they’re paid — Nexora checks what you held on each payment date.</div>'}
        </div>
      </div>`;
    nxDivChart(log, proj);
  }
  function nxDivChart(log, proj) {
    if (_divChart) { _divChart.destroy(); _divChart = null; }
    const cv = document.getElementById('nx-div-chart');
    if (!cv || !cv.offsetParent) return;
    const t = todayNoon(), months = [];
    for (let i = -11; i <= 12; i++) months.push(new Date(t.getFullYear(), t.getMonth() + i, 1));
    const cur = monthKey(t);
    const sumIn = (list, k) => list.filter(d => d.date.startsWith(k)).reduce((s, d) => s + d.amountEur, 0);
    const got = months.map(m => { const k = monthKey(m); return k <= cur ? +sumIn(log, k).toFixed(2) : null; });
    // this month: what's still to come on top of what arrived
    const exp = months.map(m => { const k = monthKey(m); if (k < cur) return null; const v = sumIn(proj.filter(p => noon(p.date) >= t), k); return v ? +v.toFixed(2) : null; });
    const up = cssv('--up'), rgb = cssv('--mint-rgb');
    _divChart = new Chart(cv, {
      type: 'bar',
      data: { labels: months.map(m => m.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })),
        datasets: [{ label: 'Received', data: got, backgroundColor: up, stack: 'd' },
          // expected: an outline, so it never reads as money already in
          { label: 'Expected', data: exp, backgroundColor: `rgba(${rgb},.12)`, borderColor: `rgba(${rgb},.75)`, borderWidth: 1.5, borderRadius: 8, borderSkipped: false, maxBarThickness: 42, stack: 'd', nxKeep: true }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { filter: i => i.raw != null && i.raw > 0, callbacks: { label: c => ` ${c.dataset.label}  ${eur(c.raw)}` } } },
        scales: { x: { stacked: true, ticks: { color: cssv('--text3'), maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
                  y: { stacked: true, beginAtZero: true, ticks: { color: cssv('--text3'), callback: v => eur(v, 0) }, grid: {} } } },
    });
  }

  // ══════════════ PORTFOLIO → CASH ══════════════
  let cashForm = false;
  function nxCash() {
    const pane = document.getElementById('psub-portfolio-cash');
    const wrap = document.getElementById('cash-table-wrap');
    if (!pane || !wrap) return;
    const card = wrap.closest('.card');
    let root = document.getElementById('nx-cash');
    if (!root) {
      [...card.children].forEach(ch => { if (ch.id !== 'cash-add-form') hide(ch); });
      root = Object.assign(document.createElement('div'), { id: 'nx-cash' });
      card.prepend(root);
      card.classList.add('nx-cash-card');
      root.addEventListener('click', onCashClick);
      root.addEventListener('submit', onCashSubmit);
      root.addEventListener('keydown', e => {
        if (e.target.classList.contains('nx-nw-edit')) {
          if (e.key === 'Enter') e.target.blur();
          if (e.key === 'Escape') { e.target.dataset.cancel = '1'; e.target.blur(); }
        } else if (e.key === 'Escape' && cashForm) { cashForm = false; nxCash(); }
      });
      root.addEventListener('focusout', e => { if (e.target.classList.contains('nx-nw-edit')) commitCash(e.target); });
    }
    hide(document.getElementById('cash-add-form'));
    const port = ap(), entries = (typeof getCashEntries === 'function' ? getCashEntries() : port.cashEntries || []);
    const total = getCashTotalEur();
    const invested = (port.holdings || []).reduce((s, h) => s + (h.currentPrice || h.buyPrice) * h.shares, 0);
    const share = invested + total > 0 ? total / (invested + total) * 100 : 0;
    const name = c => (CCY.find(x => x[0] === c) || [c, '', c])[2];
    const native = (amt, c) => (CURRENCY_SYMBOLS[c] || c + ' ') + (+amt).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const used = new Set(entries.map(e => e.currency));
    const free = CCY.filter(([c]) => !used.has(c));
    root.innerHTML = `
      <div class="nx-nw-head"><div><div class="card-title" style="margin:0;">Uninvested cash</div><div class="nx-nw-tot">${eur(total)}</div>
        <div class="nx-cash-sub">${entries.length ? `<span>${share.toFixed(1)}% of this portfolio</span> · ` : ''}<span>counts toward its value</span></div></div>
        <button type="button" class="nx-inc-act" data-act="form">${cashForm ? 'Close' : '+ Add cash'}</button></div>
      ${cashForm ? `<form class="nx-cash-form" novalidate>
          <label class="nx-f"><span>Currency</span><select name="ccy" class="nx-select">${CCY.map(([c, s, n]) => `<option value="${c}">${c} — ${n}</option>`).join('')}</select></label>
          <label class="nx-f"><span>Amount</span><input name="amt" type="number" min="0" step="0.01" placeholder="0.00"></label>
          <div class="nx-nw-form-btns"><button type="button" class="btn-ghost" data-act="cancel">Cancel</button><button class="btn" type="submit">Add</button></div>
          <small class="nx-cash-hint">Adding to a currency you already hold tops it up.</small></form>` : ''}
      ${entries.length ? `<div class="nx-cash-grid">${entries.map((e, i) => {
          const rate = FX_RATES[e.currency] || 1, inEur = e.amount / rate;
          return `<div class="nx-cash-tile" data-i="${i}">
            <div class="nx-cash-top">${flagIc(e.currency, 22)}<div class="nx-cash-name"><b>${escH(name(e.currency))}</b><small>${e.currency}</small></div>
              <button type="button" class="nx-row-del" data-act="del" title="Remove">${icon('trash', 14)}</button></div>
            <button type="button" class="nx-nw-val nx-cash-amt" data-edit="${i}" title="Click to change">${native(e.amount, e.currency)}</button>
            <div class="nx-cash-eur">${e.currency === 'EUR' ? `<span>${(inEur / (total || 1) * 100).toFixed(0)}% of your cash</span>` : `≈ ${eur(inEur)} <span class="nx-cash-rate">· 1 EUR = ${rate.toFixed(4)} ${e.currency}</span>`}</div>
          </div>`; }).join('')}</div>`
        : `<div class="nx-empty-line">No cash recorded. Money waiting to be invested — in any currency — goes here, and counts toward the portfolio’s value.</div>`}`;
    if (cashForm) {
      const sel = root.querySelector('select[name="ccy"]'); if (free.length && sel) sel.value = free[0][0];
      setTimeout(() => root.querySelector('.nx-cash-form input')?.focus(), 30);
    }
  }
  async function onCashClick(e) {
    const b = e.target.closest('[data-act], [data-edit]'); if (!b) return;
    if (b.dataset.act === 'form') { cashForm = !cashForm; return nxCash(); }
    if (b.dataset.act === 'cancel') { cashForm = false; return nxCash(); }
    if (b.dataset.act === 'del') {
      const i = +b.closest('[data-i]').dataset.i, e0 = (ap().cashEntries || [])[i]; if (!e0) return;
      if (!await nexoraConfirm(`Remove the ${e0.currency} cash from this portfolio?`)) return;
      return removeCashEntry(i);
    }
    if (b.dataset.edit != null && !b.querySelector('input')) {
      const e0 = (ap().cashEntries || [])[+b.dataset.edit]; if (!e0) return;
      const inp = Object.assign(document.createElement('input'), { type: 'number', min: 0, step: '0.01', value: e0.amount, className: 'nx-nw-edit nx-cash-edit' });
      inp.dataset.i = b.dataset.edit;
      b.replaceWith(inp); inp.focus(); inp.select();
    }
  }
  function commitCash(inp) {
    const port = ap(), e0 = (port.cashEntries || [])[+inp.dataset.i];
    const v = parseFloat(inp.value);
    if (e0 && !inp.dataset.cancel && inp.value !== '' && v >= 0) {
      e0.amount = +v.toFixed(2);
      port.cash = getCashTotalEur();
      save(); renderCashTable(); renderPortfolio();
    } else nxCash();
  }
  function onCashSubmit(e) {
    e.preventDefault();
    const f = e.target, ccy = f.elements.ccy.value, amt = parseFloat(f.elements.amt.value);
    if (!(amt > 0)) { f.elements.amt.focus(); return; }
    // the app's own add (it tops up a currency already held)
    document.getElementById('cash-add-currency').value = ccy;
    document.getElementById('cash-add-amount').value = amt;
    cashForm = false;
    saveCashEntry();
  }

  // ══════════════ ALLOCATIONS: the strip on the Portfolio overview ══════════════
  function nxAllocStrip() {
    const row = document.getElementById('alloc-stats-row');
    if (!row) return;
    const shown = row.style.display !== 'none';
    hide(row);
    const strip = rootOf('nx-alloc-strip', null, row);
    if (!shown) { strip.innerHTML = ''; strip.className = ''; return; }
    const t = allocationTotals(ap().id), pct = t.allocated > 0 ? Math.min(t.invested / t.allocated, 1) : 0;
    strip.className = 'card nx-alloc-strip';
    strip.innerHTML = `${tile('amber', 'target')}
      <div class="nx-as-main"><div class="nx-as-k">Set aside to invest</div>
        <div class="nx-as-line"><b>${eur(t.invested, 0)}</b> <span>of</span> <b>${eur(t.allocated, 0)}</b> <span>invested</span> · <b class="nx-as-left">${eur(t.remaining, 0)}</b> <span>left</span></div>
        <div class="nx-limit-track nx-as-track"><div class="nx-limit-fill" style="width:${(pct * 100).toFixed(1)}%;background:linear-gradient(90deg, var(--gold), var(--mint));"></div></div></div>
      ${t.excess > 0 ? `<div class="nx-as-extra"><small>Invested beyond what you set aside</small><b>${eur(t.excess, 0)}</b></div>` : ''}
      <button type="button" class="nx-inc-act" onclick="navToSub('expenses','allocations')">Manage</button>`;
  }

  // ══════════════ EXPENSES → ALLOCATIONS: the history ══════════════
  function nxAllocHistory() {
    const el = document.getElementById('allocation-history');
    if (!el) return;
    const list = [...(state.allocations || [])].sort((a, b) => (b.allocationDate || '').localeCompare(a.allocationDate || ''));
    if (!list.length) { el.innerHTML = ''; return; }
    const portName = id => ((state.portfolios || []).find(p => p.id === id) || {}).name || 'Deleted portfolio';
    el.innerHTML = `<div class="nx-al-title">History</div><div class="nx-al-list">${list.map(a => {
      const alloc = +a.amountAllocated || 0, inv = +a.amountInvested || 0, left = Math.max(0, alloc - inv), pct = alloc > 0 ? Math.min(inv / alloc, 1) : 0, open = a.status === 'open';
      return `<div class="nx-al-row">
        <div class="nx-al-when"><b>${fmtDay(a.allocationDate)}</b><small><span>${escH(portName(a.portfolioId))}</span>${a.notes ? ` · ${escH(a.notes)}` : ''}</small></div>
        <div class="nx-al-prog"><div class="nx-al-nums"><b>${eur(inv, 0)}</b> <span>of</span> ${eur(alloc, 0)} <span>invested</span></div>
          <div class="nx-limit-track"><div class="nx-limit-fill" style="width:${(pct * 100).toFixed(1)}%;background:${open ? 'linear-gradient(90deg, var(--gold), var(--mint))' : 'var(--text3)'};"></div></div></div>
        <span class="nx-al-left ${open ? 'open' : 'used'}">${open ? `<b>${eur(left, 0)}</b> <span>left</span>` : '<span>Fully used</span>'}</span>
        <button type="button" class="nx-row-del" onclick="delAllocation('${escH(a.id)}')" title="Delete">${icon('trash', 14)}</button>
      </div>`; }).join('')}</div>`;
  }

  // ══════════════ CLOSE A POSITION ══════════════
  // Every purchase still open is listed, like a broker's positions: tick the ones
  // sold (all or part of each), give the sale price and date. Each one is
  // recorded as its own sale, with what it cost, by closeLots() in actions.js.
  let _close = null;    // { ticker, lots }
  const num = (v, d = 2) => (+v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 4) });
  const ccyOf = c => c === 'GBp' ? 'GBP' : c;
  function nxClosePosition(ticker) {
    const port = ap(), h = (port.holdings || []).find(x => x.ticker === ticker);
    if (!h) return;
    const lots = positionLots(port, h);
    _close = { ticker, lots };
    let el = document.getElementById('nx-close');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'nx-close' });
      document.body.appendChild(el);
      el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-act="cancel"]')) closeDialog(); });
      el.addEventListener('input', e => {
        if (e.target.type === 'checkbox') return;   // ticks are handled on change, after the box has its new state
        if (e.target.name === 'q') { const r = e.target.closest('.nx-close-lot'); r.querySelector('[name="pick"]').checked = true; r.classList.add('on'); }   // typing a number ticks the row
        closeSummary();
      });
      el.addEventListener('change', e => {
        if (e.target.name === 'all') el.querySelectorAll('input[name="pick"]').forEach(c => { c.checked = e.target.checked; });
        if (e.target.name === 'pick' || e.target.name === 'all') el.querySelectorAll('.nx-close-lot').forEach(r => r.classList.toggle('on', r.querySelector('[name="pick"]').checked));
        closeSummary();
      });
      el.addEventListener('submit', onCloseSubmit);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('open') && !document.getElementById('cal-popup')?.classList.contains('open')) closeDialog(); });
    }
    // the sale price starts at today's price, in the currency the holding trades in
    const qc = h.priceCurrency || lots.find(l => l.currency)?.currency || 'EUR', ccy = CURRENCY_SYMBOLS[ccyOf(qc)] ? ccyOf(qc) : 'EUR';
    let px = ccy === 'EUR' ? h.currentPrice : h.currentPriceNative;
    if (qc === 'GBp' && px) px /= 100;
    const sym = c => CURRENCY_SYMBOLS[c] || c + ' ';
    const lotPx = l => l.priceNative != null && l.currency ? `${sym(ccyOf(l.currency))}${num(l.currency === 'GBp' ? l.priceNative / 100 : l.priceNative)}` : eur(l.priceEur);
    el.innerHTML = `<form class="nx-close-panel" novalidate>
      <div class="nx-close-head"><div><div class="nx-close-title">Close a position</div>
        <div class="nx-close-sub"><b>${escH(ticker)}</b> · <span>${fmtShares(h.shares)} sh</span> · <span>${lots.length === 1 ? '1 purchase open' : lots.length + ' purchases open'}</span></div></div>
        <button type="button" class="nx-row-del" data-act="cancel" title="Cancel">${icon('close', 16)}</button></div>
      <p class="nx-close-help">Tick what you sold. To sell part of a purchase, change its number of shares.</p>
      <div class="nx-close-lots">
        <label class="nx-close-row nx-close-cols"><input type="checkbox" name="all"${lots.length === 1 ? ' checked' : ''}><span>Bought</span><span>Shares × price</span><span>Gain now</span><span>Shares to sell</span></label>
        ${lots.map((l, i) => {
          const g = h.currentPrice ? (h.currentPrice - l.priceEur) * l.left : null, gp = g != null && l.priceEur ? (h.currentPrice / l.priceEur - 1) * 100 : null;
          return `<label class="nx-close-row nx-close-lot${lots.length === 1 ? ' on' : ''}" data-i="${i}"><input type="checkbox" name="pick" value="${i}"${lots.length === 1 ? ' checked' : ''}>
            <span class="nx-close-when">${l.earlier ? '<b>Earlier shares</b><small>before purchases were recorded</small>' : `<b>${fmtDay(l.date)}</b>${l.left < l.shares - 1e-6 ? `<small><span>${fmtShares(l.left)} of ${fmtShares(l.shares)} left</span></small>` : ''}`}</span>
            <span class="nx-close-qty">${fmtShares(l.left)} × ${lotPx(l)}</span>
            <span class="nx-close-gain ${g == null ? '' : g >= 0 ? 'up-text' : 'down-text'}">${g == null ? '' : `${g >= 0 ? '+' : '−'}${eur(Math.abs(g))}<small>${gp >= 0 ? '+' : '−'}${Math.abs(gp).toFixed(1)}%</small>`}</span>
            <input class="nx-close-n" name="q" type="number" min="0" step="any" max="${l.left}" value="${l.left}" aria-label="Shares to sell"></label>`;
        }).join('')}
      </div>
      <div class="nx-close-sale">
        <label class="nx-f"><span>Sale price per share</span><span class="nx-close-px"><select name="ccy" class="nx-select">${Object.keys(CURRENCY_SYMBOLS).map(c => `<option value="${c}"${c === ccy ? ' selected' : ''}>${c}</option>`).join('')}</select>
          <input name="px" type="number" min="0" step="any" value="${px ? +(+px).toFixed(4) : ''}" placeholder="0.00"></span></label>
        <label class="nx-f"><span>Date sold</span><input id="nx-close-date" class="date-field" readonly placeholder="Select date…"></label>
      </div>
      <label class="nx-close-cash"><input type="checkbox" name="cash" checked><span>Add what the sale brought in to this portfolio’s cash</span></label>
      <div class="nx-close-sum"></div>
      <div class="nx-auth-err"></div>
      <div class="nx-nw-form-btns"><button type="button" class="btn-ghost" data-act="cancel">Cancel</button><button class="btn" type="submit">Close position</button></div>
    </form>`;
    setDateField('nx-close-date', localIso());
    el.classList.add('open');
    closeSummary();
  }
  // what's picked: [{ lot, shares }]
  function closePicks(el) {
    return [...el.querySelectorAll('.nx-close-lot')].map(r => {
      const l = _close.lots[+r.dataset.i], n = parseFloat(r.querySelector('[name="q"]').value);
      return { l, n, on: r.querySelector('[name="pick"]').checked };
    }).filter(p => p.on);
  }
  function closeSummary() {
    const el = document.getElementById('nx-close'); if (!el || !_close) return;
    const f = el.querySelector('form'), picks = closePicks(el), sum = el.querySelector('.nx-close-sum');
    const all = el.querySelector('[name="all"]'), boxes = [...el.querySelectorAll('[name="pick"]')];
    if (all) { all.checked = boxes.length > 0 && boxes.every(c => c.checked); all.indeterminate = !all.checked && boxes.some(c => c.checked); }
    const n = picks.reduce((s, p) => s + (p.n > 0 ? Math.min(p.n, p.l.left) : 0), 0), cost = picks.reduce((s, p) => s + (p.n > 0 ? Math.min(p.n, p.l.left) * p.l.priceEur : 0), 0);
    const pxEur = nativeToEur(parseFloat(f.elements.px.value), f.elements.ccy.value);
    const total = _close.lots.reduce((s, l) => s + l.left, 0);
    f.querySelector('button[type="submit"]').textContent = n > 0 && n >= total - 1e-6 ? 'Close position' : picks.length > 1 ? `Close ${picks.length} purchases` : 'Close purchase';
    if (!(n > 0)) { sum.innerHTML = '<span>Nothing ticked yet.</span>'; return; }
    const proceeds = pxEur > 0 ? n * pxEur : null, gain = proceeds != null ? proceeds - cost : null;
    sum.innerHTML = `<span>Selling</span> <b>${fmtShares(n)}</b> <span>of</span> ${fmtShares(total)} <span>shares</span>${proceeds != null ? ` · <span>about</span> <b>${eur(proceeds)}</b> · <b class="${gain >= 0 ? 'up-text' : 'down-text'}">${gain >= 0 ? '+' : '−'}${eur(Math.abs(gain))}</b> <span>gain</span>` : ''}`;
  }
  async function onCloseSubmit(e) {
    e.preventDefault();
    const el = document.getElementById('nx-close'), f = e.target, err = s => { f.querySelector('.nx-auth-err').textContent = s; };
    const picks = closePicks(el);
    if (!picks.length) return err('Tick at least one purchase to close.');
    const bad = picks.find(p => !(p.n > 0) || p.n > p.l.left + 1e-6);
    if (bad) return err(`Shares to sell must be more than 0 and at most ${fmtShares(bad.l.left)} for that purchase.`);
    const px = parseFloat(f.elements.px.value), ccy = f.elements.ccy.value, date = getDateRaw('nx-close-date') || localIso();
    if (!(px > 0)) return err('Add the price you sold at.');
    let rate = 1;
    if (ccy !== 'EUR') {
      const btn = f.querySelector('button[type="submit"]'), label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Converting…';
      try { rate = await window.electronAPI?.fetchFxRate?.({ date, fromCurrency: ccy }); } catch (x) { rate = null; }
      btn.disabled = false; btn.textContent = label;
      // never a guessed rate: without one the sale's value in euros isn't known
      if (!(rate > 0)) return err(`Couldn’t get the ${ccy}→EUR rate for ${fmtDay(date)}. Check your connection and try again, or give the price in EUR.`);
    }
    const ticker = _close.ticker;
    const res = closeLots(ap(), ticker, picks.map(p => ({ lotId: p.l.id, shares: p.n })),
      { priceEur: px / rate, priceNative: px, currency: ccy, fxRate: ccy !== 'EUR' ? +(+rate).toFixed(6) : null, date, toCash: f.elements.cash.checked });
    if (!res) return err('Nothing was closed — check the shares and the price.');
    closeDialog();
    save(); renderAll();
    showToast(`Closed ${fmtShares(res.sold)} ${ticker} · ${res.gain >= 0 ? '+' : '−'}${eur(Math.abs(res.gain))} gain`);
  }
  function closeDialog() { document.getElementById('nx-close')?.classList.remove('open'); _close = null; }
  window.nxClosePosition = nxClosePosition;

  // ══════════════ HOLDINGS WITHOUT A PRICE ══════════════
  // A holding Yahoo hasn't priced counts at what it cost, so its gain is simply
  // missing from the totals — which looked like Nexora disagreeing with the
  // broker. Say so, by name, on the Overview and above the holdings table.
  function nxPriceNote() {
    const port = ap(), now = Date.now();
    const none = (port.holdings || []).filter(h => !h.currentPrice).map(h => h.ticker);
    const old = (port.holdings || []).filter(h => h.currentPrice && h.priceUpdatedAt && now - new Date(h.priceUpdatedAt).getTime() > 4 * dayMs).map(h => h.ticker);
    const list = a => a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
    const html = !none.length && !old.length ? '' : `${tileI('amber', 'alert')}<div>${none.length ? `<p><b>${escH(list(none))}</b> ${none.length === 1 ? 'has' : 'have'} no price yet, so ${none.length === 1 ? 'it counts' : 'they count'} at what you paid and ${none.length === 1 ? 'its' : 'their'} gain isn’t in these totals.</p>` : ''}
      ${old.length ? `<p>The price${old.length === 1 ? '' : 's'} of <b>${escH(list(old))}</b> ${old.length === 1 ? 'is' : 'are'} more than 4 days old.</p>` : ''}
      <p class="nx-price-note-how">Refresh prices from Actions; if it stays, check the symbol — European listings need their exchange suffix, like VWCE.DE.</p></div>`;
    for (const [id, anchor] of [['nx-price-note-ov', document.querySelector('#psub-portfolio-overview > .stats-grid')], ['nx-price-note-hd', document.getElementById('holdings-table-wrap')]]) {
      if (!anchor) continue;
      let n = document.getElementById(id);
      if (!n) { n = Object.assign(document.createElement('div'), { id, className: 'nx-price-note' }); id.endsWith('ov') ? anchor.after(n) : anchor.before(n); }
      n.innerHTML = html; n.style.display = html ? '' : 'none';
    }
  }

  // ══════════════ wiring ══════════════
  const after = (name, fn) => {
    const orig = window[name]; if (typeof orig !== 'function') return;
    window[name] = function () { const out = orig.apply(this, arguments); try { fn(); } catch (e) { console.error(e); } return out; };
  };
  window.addEventListener('load', () => {
    after('renderGoals', nxGoals);
    after('renderTransactions', nxTransactions);
    after('renderReceivedDividends', nxDividends);
    after('renderCashTable', nxCash);
    after('renderAllocationStats', nxAllocStrip);
    after('renderAllocations', nxAllocHistory);
    after('renderPortfolio', nxPriceNote);
  });
})();
