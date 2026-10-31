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
      : `<button type="button" class="nx-goal-new" data-act="new">${icon('plus', 18)}<b>New goal</b><small>${goals.length ? 'Saving for something else?' : 'A trip, a car, a safety net: track what you’re saving for.'}</small></button>`;
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
    if (!all.length) { list.innerHTML = '<div class="nx-empty-line">No trades yet. They’re recorded when you add or import a holding.</div>'; return; }
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
          : '<div class="nx-empty-line">Payments appear here as they’re paid. Nexora checks what you held on each payment date.</div>'}
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
          <label class="nx-f"><span>Currency</span><select name="ccy" class="nx-select">${CCY.map(([c, s, n]) => `<option value="${c}">${c} · ${n}</option>`).join('')}</select></label>
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
        : `<div class="nx-empty-line">No cash recorded. Money waiting to be invested, in any currency, goes here, and counts toward the portfolio’s value.</div>`}`;
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
      el = Object.assign(document.createElement('div'), { id: 'nx-close', className: 'nx-dialog' });
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
    if (!res) return err('Nothing was closed. Check the shares and the price.');
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
      <p class="nx-price-note-how">Refresh prices from Actions; if it stays, check the symbol: European listings need their exchange suffix, like VWCE.DE.</p></div>`;
    for (const [id, anchor] of [['nx-price-note-ov', document.querySelector('#psub-portfolio-overview > .stats-grid')], ['nx-price-note-hd', document.getElementById('holdings-table-wrap')]]) {
      if (!anchor) continue;
      let n = document.getElementById(id);
      if (!n) { n = Object.assign(document.createElement('div'), { id, className: 'nx-price-note' }); id.endsWith('ov') ? anchor.after(n) : anchor.before(n); }
      n.innerHTML = html; n.style.display = html ? '' : 'none';
    }
  }

  // ══════════════ PURCHASES SAVED IN EUROS ══════════════
  // purchasesSavedAsEur() (actions.js) finds holdings that trade in another
  // currency whose purchases were taken as euros; this names them and lets you
  // convert the ones whose prices were really in that currency.
  const CCY_WORD = { USD: 'dollars', GBP: 'pounds', CHF: 'Swiss francs', BRL: 'reais', CAD: 'Canadian dollars', HKD: 'Hong Kong dollars', JPY: 'yen', DKK: 'Danish kroner', SEK: 'Swedish kronor', NOK: 'Norwegian kroner', AUD: 'Australian dollars', PLN: 'złoty' };
  const listOf = a => a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  function nxFxNote() {
    const items = purchasesSavedAsEur(ap()), ccys = [...new Set(items.map(x => x.currency))];
    const word = ccys.length === 1 ? (CCY_WORD[ccys[0]] || ccys[0]) : null;
    const html = !items.length ? '' : `${tileI('amber', 'alert')}<div><p><b>${escH(listOf(items.map(x => x.h.ticker)))}</b> ${items.length === 1 ? 'trades' : 'trade'} in ${word || 'other currencies'}, but ${items.length === 1 ? 'its purchases were' : 'their purchases were'} saved in euros.</p>
      <p class="nx-price-note-how">If the prices you entered were in ${word || 'those currencies'}, what ${items.length === 1 ? 'it' : 'they'} cost is overstated and the gain understated.</p></div>
      <button type="button" class="nx-inc-act nx-note-act" onclick="nxFxCheck()">Check them</button>`;
    for (const [id, anchor] of [['nx-fx-note-ov', document.querySelector('#psub-portfolio-overview > .stats-grid')], ['nx-fx-note-hd', document.getElementById('holdings-table-wrap')]]) {
      if (!anchor) continue;
      let n = document.getElementById(id);
      if (!n) { n = Object.assign(document.createElement('div'), { id, className: 'nx-price-note' }); id.endsWith('ov') ? anchor.after(n) : anchor.before(n); }
      n.innerHTML = html; n.style.display = html ? '' : 'none';
    }
  }
  let _fx = null;   // { items, rateOn }
  async function nxFxCheck() {
    const port = ap(), items = purchasesSavedAsEur(port);
    if (!items.length) return;
    let el = document.getElementById('nx-fxfix');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'nx-fxfix', className: 'nx-dialog' });
      document.body.appendChild(el);
      el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-act="cancel"]')) el.classList.remove('open'); });
      el.addEventListener('change', e => {
        if (e.target.name === 'all') el.querySelectorAll('[name="pick"]').forEach(c => { c.checked = e.target.checked; });
        fxSummary();
      });
      el.addEventListener('submit', onFxSubmit);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('open')) el.classList.remove('open'); });
    }
    el.innerHTML = `<div class="nx-close-panel"><div class="nx-close-head"><div class="nx-close-title">Check purchase currencies</div>
      <button type="button" class="nx-row-del" data-act="cancel" title="Cancel">${icon('close', 16)}</button></div>
      <div class="nx-close-sum"><span>Getting the ECB rates for each purchase date…</span></div></div>`;
    el.classList.add('open');
    // one ECB request for every currency and date involved
    const dates = items.flatMap(x => x.buys.map(t => t.date).concat(x.h.buyDate || [])).filter(Boolean).sort();
    const from = new Date(dates[0] + 'T12:00:00Z'); from.setUTCDate(from.getUTCDate() - 10);
    let hist = null;
    try { hist = await window.electronAPI?.fetchFxHistory?.({ currencies: [...new Set(items.map(x => x.currency))], from: from.toISOString().slice(0, 10), to: dates[dates.length - 1] }); } catch (x) {}
    const rateOn = c => date => { const m = hist?.[c]; if (!m || !date) return null; const d = new Date(date + 'T12:00:00Z');
      for (let k = 0; k <= 10; k++) { const v = m[d.toISOString().slice(0, 10)]; if (v) return v; d.setUTCDate(d.getUTCDate() - 1); } return null; };
    const rows = items.map(x => {
      const copy = structuredClone(port), ok = convertPurchasesFrom(copy, x.h.ticker, x.currency, rateOn(x.currency));
      const nb = ok ? copy.holdings.find(h => h.ticker === x.h.ticker).buyPrice : null, cp = x.h.currentPrice;
      return { ...x, ok, nb, gain: cp ? (cp - x.h.buyPrice) * x.h.shares : null, gainAfter: cp && ok ? (cp - nb) * x.h.shares : null };
    });
    _fx = { rows, rateOn };
    const signed = v => v == null ? '' : `<span class="${v >= 0 ? 'up-text' : 'down-text'}">${v >= 0 ? '+' : '−'}${eur(Math.abs(v), 0)}</span>`;
    el.innerHTML = `<form class="nx-close-panel" novalidate>
      <div class="nx-close-head"><div><div class="nx-close-title">Check purchase currencies</div>
        <div class="nx-close-sub"><span>${port.name ? escH(port.name) + ' · ' : ''}</span><span>${rows.length === 1 ? '1 holding' : rows.length + ' holdings'}</span></div></div>
        <button type="button" class="nx-row-del" data-act="cancel" title="Cancel">${icon('close', 16)}</button></div>
      <p class="nx-close-help">Tick each holding whose prices you entered in the currency it trades in. They’re converted at the ECB rate of each purchase date. The ones you leave unticked stay in euros and won’t be flagged again.</p>
      ${!hist || hist.error ? '<div class="nx-auth-err">Couldn’t get the ECB rates. Check your connection and try again.</div>' : ''}
      <div class="nx-close-lots">
        <label class="nx-close-row nx-fx-row nx-close-cols"><input type="checkbox" name="all"><span>Holding</span><span>Saved as</span><span>In its currency</span><span>Gain now</span></label>
        ${rows.map((r, i) => `<label class="nx-close-row nx-fx-row nx-close-lot" data-i="${i}"><input type="checkbox" name="pick" value="${i}"${r.ok ? '' : ' disabled'}>
          <span class="nx-close-when"><b>${escH(r.h.ticker)}</b><small><span>${r.buys.length === 1 ? '1 purchase' : r.buys.length ? r.buys.length + ' purchases' : 'no purchases recorded'}</span> · ${r.currency}</small></span>
          <span class="nx-close-qty">${eur(r.h.buyPrice)} <small>a share</small></span>
          <span class="nx-close-qty">${r.ok ? `${eur(r.nb)} <small>a share</small>` : '<small>no rate</small>'}</span>
          <span class="nx-fx-gain">${signed(r.gain)}${r.ok && r.gainAfter != null ? ` <span class="nx-fx-arrow">→</span> ${signed(r.gainAfter)}` : ''}</span></label>`).join('')}
      </div>
      <div class="nx-close-sum"></div>
      <div class="nx-auth-err"></div>
      <div class="nx-nw-form-btns"><button type="button" class="btn-ghost" data-act="cancel">Cancel</button><button class="btn" type="submit">Save</button></div>
    </form>`;
    fxSummary();
  }
  function fxSummary() {
    const el = document.getElementById('nx-fxfix'); if (!el || !_fx) return;
    const picks = [...el.querySelectorAll('[name="pick"]')].filter(c => c.checked).map(c => _fx.rows[+c.value]);
    const all = el.querySelector('[name="all"]'), boxes = [...el.querySelectorAll('[name="pick"]:not(:disabled)')];
    if (all) { all.checked = boxes.length > 0 && boxes.every(c => c.checked); all.indeterminate = !all.checked && boxes.some(c => c.checked); }
    const before = _fx.rows.reduce((s, r) => s + (r.gain || 0), 0), after = _fx.rows.reduce((s, r) => s + ((picks.includes(r) ? r.gainAfter : r.gain) || 0), 0);
    const sum = el.querySelector('.nx-close-sum'), btn = el.querySelector('button[type="submit"]');
    if (btn) btn.textContent = picks.length ? (picks.length === 1 ? 'Convert 1 holding' : `Convert ${picks.length} holdings`) : 'Keep them in euros';
    if (sum) sum.innerHTML = picks.length ? `<span>Their gain</span> <b>${before >= 0 ? '+' : '−'}${eur(Math.abs(before), 0)}</b> <span>becomes</span> <b class="${after >= 0 ? 'up-text' : 'down-text'}">${after >= 0 ? '+' : '−'}${eur(Math.abs(after), 0)}</b>`
      : '<span>Nothing ticked: every holding listed stays in euros.</span>';
  }
  function onFxSubmit(e) {
    e.preventDefault();
    const el = document.getElementById('nx-fxfix'), port = ap();
    const picked = new Set([...el.querySelectorAll('[name="pick"]')].filter(c => c.checked).map(c => +c.value));
    let n = 0;
    state.fxCheckDismissed = state.fxCheckDismissed || {};
    _fx.rows.forEach((r, i) => {
      if (picked.has(i)) { if (convertPurchasesFrom(port, r.h.ticker, r.currency, _fx.rateOn(r.currency))) n++; }
      else state.fxCheckDismissed[port.id + '|' + r.h.ticker] = true;
    });
    el.classList.remove('open'); _fx = null;
    save(); renderAll();
    showToast(n ? (n === 1 ? 'Converted 1 holding' : `Converted ${n} holdings`) : 'Kept in euros');
  }
  window.nxFxCheck = nxFxCheck;

  // ══════════════ RISK ══════════════
  // The Risk view in the order of the questions it answers: how much could I
  // lose, where does the risk come from, was it worth it; the specialist
  // measures folded under "More measures". risk.js computes and still draws
  // Concentration, Currency and Risk by Holding, which are moved here, not
  // redrawn. The 1Y/3Y switch drives what it always did (volatility, falls,
  // beta, capture, Risk by Holding); every other card names its own fixed
  // period, so two different volatilities never sit side by side unexplained.
  // Prices for the fixed periods: a year of daily prices (bad day, expected
  // shortfall, correlation, volatility over time), three years of weekly
  // prices (the ratios, bad month) and ten years of daily prices (the crises).
  let _rmSeq = 0, _rvChart = null, _ddChart = null;
  // negatives in brackets, like the rest of the app: (0.9%), (0.22)
  const rNum = (v, d, unit = '') => { const t = Math.abs(v).toFixed(d) + unit; return v < 0 && +t.replace(/[^\d.]/g, '') ? `(${t})` : t; };
  const rPct = (v, d = 1) => v == null || !isFinite(v) ? '–' : rNum(v * 100, d, '%');
  const rSigned = (v, d = 1) => v == null || !isFinite(v) ? '–' : (v >= 0 ? '+' : '') + rNum(v * 100, d, '%');
  const rDay = s => s ? fmtDay(s) : '';
  const span2 = (a, b) => `<span>${a}</span> – <span>${b}</span>`;   // two dates, each translated on its own
  const chip = (txt, cls) => `<em class="nx-rr-chip ${cls}">${txt}</em>`;
  function grade(v, cuts) {   // cuts: [[upper, label, cls], …], first match wins
    for (const [u, l, c] of cuts) if (v < u) return chip(l, c);
    return chip(cuts[cuts.length - 1][1], cuts[cuts.length - 1][2]);
  }
  const SHARPE_CUTS = [[0, 'Below cash', 'bad'], [0.5, 'Low', 'low'], [1, 'Fair', 'mid'], [1.5, 'Good', 'good'], [Infinity, 'Very good', 'good']];
  const SORTINO_CUTS = [[0, 'Below cash', 'bad'], [0.75, 'Low', 'low'], [1.5, 'Fair', 'mid'], [2, 'Good', 'good'], [Infinity, 'Very good', 'good']];
  const IR_CUTS = [[0, 'Behind', 'bad'], [0.25, 'Low', 'low'], [0.5, 'Fair', 'mid'], [1, 'Good', 'good'], [Infinity, 'Very good', 'good']];
  const STRESS_SCALE = 0.5;   // a 50% fall fills the bar, in both stress columns, so they compare
  const RK = () => U.risk;
  const perLabel = () => typeof riskRange !== 'undefined' && riskRange === '3Y' ? 'Last 3 years' : 'Last 12 months';
  const tipH = t => `<span class="info-tip">i<span class="tip-body">${t}</span></span>`;
  const rkHead = (title, tip, tag) => `<div class="nx-rk-head"><div class="card-title">${title}${tip ? tipH(tip) : ''}</div>${tag ? `<span class="nx-rk-tag">${tag}</span>` : ''}</div>`;
  const waiting = t => `<div class="nx-empty-line">${t}</div>`;
  const $ = id => document.getElementById(id);

  const TIP = {
    falls: 'How far below its previous high the portfolio was on each day, and how long its worst fall took to recover.',
    loss: 'Value at risk at 95%, from the portfolio’s own past days and months (historical simulation, no bell curve), applied to today’s value. Bad days come in clusters, so a bad month can be far worse than a few bad days. Past movements, not a forecast.',
    stress: 'Two ways to see a crash: real ones replayed on what you hold today, and an estimate of a sudden fall in the index from how closely you have followed it.',
    crises: 'Each holding you have today moved by what its own price did between the two dates, in euros at the exchange rate of the time. Holdings that weren’t listed yet are left out and named below.',
    whatIf: 'An estimate from your beta over the chosen period. Real falls rarely follow beta exactly: sectors and currencies move on their own.',
    effN: 'How many equally sized holdings would give the same concentration (1 ÷ the sum of squared weights). Fifteen holdings with one at 40% behave like far fewer than fifteen.',
    reward: 'The return above cash (the ECB’s €STR rate) for each unit of swing, over the last 3 years of weekly prices. The label is the rough scale professionals use: below 0.5 low, 0.5 to 1 fair, 1 to 1.5 good, above 1.5 very good. Past results, not a forecast.',
    market: 'Volatility: how much the value swings in a year. Beta: how much you move with the index (1.0 in step, 0.7 moves 30% less); correlation: how closely you follow it at all. Capture: your average gain on the index’s up days and loss on its down days, against its own; 100% moves exactly like it.',
    detail: 'Sortino is the Sharpe ratio counting only the falls. The information ratio is how much you beat or lagged the index for each unit you strayed from it (the tracking error). Expected shortfall is the average loss on the days beyond the value at risk. Past results, not a forecast.',
    corr: 'Correlation of daily returns over the last 12 months: 1 moves as one, 0 unrelated, below 0 opposite. Holdings that move as one add up to one bigger bet. Red is together, green is apart.',
    rv: 'Volatility over the 3 months before each day, a year. A rising line means the portfolio has been swinging more.',
  };

  // The page's frame, built once: the app's own cards are moved into it
  function rmLayout() {
    const body = $('risk-body');
    if (!body || $('nx-rk-top')) return body;
    const conc = $('risk-conc'), pair = conc?.closest('.chart-grid-2'), hold = $('risk-table')?.closest('.card'), ranges = $('risk-ranges');
    if (!pair || !hold || !ranges) return null;
    body.querySelector('.stats-grid')?.classList.add('nx-rk-old');
    const C = (id, cls = 'card') => `<div class="${cls}" id="${id}"></div>`;
    body.insertAdjacentHTML('afterbegin', `
      <div class="card nx-rk-hero" id="nx-rk-top">
        <div class="nx-rk-hero-head"><label class="nx-rk-vs"><span>You vs</span><select class="nx-select" id="nx-rk-bench"></select></label><span class="nx-rk-period" id="nx-rk-period"></span></div>
        <div id="nx-rk-cmp">${waiting('Loading prices…')}</div>
        <p class="nx-rk-lede" id="nx-rk-lede"></p>
      </div>
      <h3 class="nx-rk-sec">How much could I lose?</h3>
      <div class="chart-grid-2 nx-rk-row">${C('nx-rk-falls')}${C('nx-rk-loss')}</div>
      <div class="card" id="nx-rk-stress">${rkHead('Stress tests', TIP.stress)}
        <div class="nx-rk-cols">
          <div><div class="nx-rk-sub"><span>Real crises, replayed</span>${tipH(TIP.crises)}</div><div id="nx-rk-crises">${waiting('Loading ten years of prices…')}</div></div>
          <div><div class="nx-rk-sub" id="nx-rk-whatif-h"></div><div id="nx-rk-whatif">${waiting('Loading prices…')}</div></div>
        </div></div>
      <h3 class="nx-rk-sec" id="nx-rk-sec-where">Where does the risk come from?</h3>
      <h3 class="nx-rk-sec">Was it worth it?</h3>
      <div class="chart-grid-2 nx-rk-row">${C('nx-rk-reward')}${C('nx-rk-market')}</div>
      <details class="nx-rk-more" id="nx-rk-more"><summary><span>More measures</span><small>Sortino, information ratio, tracking error, expected shortfall, correlation, volatility over time</small></summary>
        <div class="nx-rk-more-body">${C('nx-rk-detail')}<div class="chart-grid-2 nx-rk-row">${C('nx-rk-corr')}${C('nx-rk-rv')}</div></div>
      </details>`);
    $('nx-rk-period').appendChild(ranges);
    ranges.querySelectorAll('.range-btn').forEach((btn, i) => { btn.textContent = ['12 months', '3 years'][i]; });   // the words every card tag uses
    $('nx-rk-sec-where').after(hold); hold.after(pair);
    hold.id = 'nx-rk-holdings'; hold.style.marginBottom = '';
    hold.firstElementChild.insertAdjacentHTML('beforeend', '<span class="nx-rk-tag" id="nx-rk-hold-tag"></span>');
    $('risk-table').insertAdjacentHTML('afterend', '<p class="nx-rk-note" id="nx-rk-mix"></p>');
    $('nx-rk-bench').addEventListener('change', e => setRiskBenchmark(e.target.value));
    const more = $('nx-rk-more');
    try { more.open = localStorage.getItem('nexora_risk_more') === '1'; } catch (e) {}
    more.addEventListener('toggle', () => {
      try { localStorage.setItem('nexora_risk_more', more.open ? '1' : '0'); } catch (e) {}
      if (more.open) _rvChart?.resize();
    });
    $('nx-rk-falls').innerHTML = rkHead('Falls and recoveries', TIP.falls) + waiting('Loading prices…');
    $('nx-rk-loss').innerHTML = rkHead('How much you could lose', TIP.loss) + waiting('Loading prices…');
    $('nx-rk-reward').innerHTML = rkHead('Risk vs reward', TIP.reward, 'Last 3 years') + waiting('Loading three years of prices…');
    $('nx-rk-market').innerHTML = rkHead('How you move with the market', TIP.market) + waiting('Loading prices…');
    $('nx-rk-detail').innerHTML = rkHead('In more detail', TIP.detail) + waiting('Loading three years of prices…');
    $('nx-rk-corr').innerHTML = rkHead('How holdings move together', TIP.corr, 'Last 12 months') + waiting('Loading prices…');
    $('nx-rk-rv').innerHTML = rkHead('Volatility over time', TIP.rv, 'Last 12 months') + waiting('Loading prices…');
    return body;
  }

  async function nxRiskMore() {
    const body = rmLayout();
    if (!body || !body.offsetParent) return;
    const port = ap(), holdings = (port.holdings || []).filter(h => h.shares > 0);
    if (!holdings.length) return;
    const seq = ++_rmSeq, b = riskBenchmark(), r = RK().data(), per = perLabel();
    $('nx-rk-bench').innerHTML = RISK_BENCHMARKS.map(x => `<option value="${x.ticker}"${x.ticker === b.ticker ? ' selected' : ''}>${escH(x.name)}</option>`).join('');
    $('nx-rk-hold-tag').textContent = per;
    const value = holdings.reduce((s, h) => s + (h.currentPrice || h.buyPrice || 0) * h.shares, 0);

    // straight away: what the app's own pass computed for the chosen period
    nxRkHero(r, b);
    nxRkFalls(r, per);
    nxRkMarket(r, b, per);
    nxRkWhatIf(r, b, per, value);
    nxRkEffN(holdings);
    nxDollarShock(holdings, port);

    const tickers = [...new Set([...holdings.map(h => h.ticker), 'EURUSD=X', b.ticker])];
    // a year of daily prices: the same request as the app's own 1Y view
    const d1 = await riskFetch(tickers, '1d', '1y');
    if (seq !== _rmSeq) return;
    const s1 = riskValueSeries(holdings, d1, b.ticker);
    nxRkTogether(s1, b);
    // three years of weekly prices, and €STR over the same dates
    const w3 = await riskFetch(tickers, '1wk', '3y');
    if (seq !== _rmSeq) return;
    const s3 = riskValueSeries(holdings, w3, b.ticker);
    let rf = null;
    if (s3) { try { rf = await window.electronAPI?.fetchRiskFree?.({ from: s3.d[0], to: s3.d[s3.d.length - 1] }); } catch (e) {} }
    if (seq !== _rmSeq) return;
    const R = s3 && rf ? riskRatios(s3.V, s3.bv, 52, rf.avg) : null;
    nxRkLoss(s1, s3, value);
    nxRkReward(s3, rf, R, b);
    nxRkDetail(s1, s3, rf, R, b, value);
    // ten years of daily prices: crises replayed on today's holdings
    const d10 = await riskFetch(tickers, '1d', '10y');
    if (seq !== _rmSeq) return;
    nxRkCrises(holdings, d10, b);
  }

  // You against the index over the chosen period, then what that comes to in words.
  // Return is a year's: the 12 months as they are, 3 years compounded to a year
  // the way the Sharpe card does it, so the two agree.
  function nxRkHero(r, b) {
    const cmp = $('nx-rk-cmp'), lede = $('nx-rk-lede');
    if (!r) { cmp.innerHTML = waiting('Not enough price history yet.'); lede.innerHTML = ''; return; }
    const { d, V, bv } = r.series, rec = RK().recovery, dur = RK().dur;
    const ayear = ret => typeof riskRange !== 'undefined' && riskRange === '3Y' ? Math.pow(1 + ret, 52 / (V.length - 1)) - 1 : ret;
    const me = { ret: ayear(r.ret), vol: r.vol, fall: rec(V, d) };
    const ix = r.bench && bv ? { ret: ayear(r.bench.ret), vol: r.bench.vol, fall: rec(bv, d) } : null;
    const fallCell = f => f.dd > -0.0005 ? '<b>–</b><small>No fall</small>'
      : `<b>${rPct(f.dd)}</b><small>${f.recDays != null ? `back in ${dur(f.recDays)}` : `still ${rPct(Math.abs(f.below))} below`}</small>`;
    const row = (who, sub, x, cls) => `<div class="nx-rk-cmp-row ${cls}"><div class="nx-rk-who"><b>${who}</b>${sub ? `<small>${sub}</small>` : ''}</div>
        <div class="nx-rk-val"><b>${rSigned(x.ret)}</b></div><div class="nx-rk-val"><b>${rPct(x.vol)}</b></div><div class="nx-rk-val">${fallCell(x.fall)}</div></div>`;
    cmp.innerHTML = `<div class="nx-rk-cmp"><div class="nx-rk-cmp-row nx-rk-cmp-h"><span></span><span>Return, a year</span><span>Volatility</span><span>Worst fall</span></div>
      ${row('You', '', me, 'me')}${ix ? row(escH(b.name), escH(b.label), ix, 'ix') : ''}</div>${ix ? '' : waiting('Needs the benchmark’s prices.')}`;
    if (!ix) { lede.innerHTML = ''; return; }
    const v = me.vol < ix.vol * 0.9 ? 'less than' : me.vol > ix.vol * 1.1 ? 'more than' : 'about as much as';
    const f = Math.abs(me.fall.dd) - Math.abs(ix.fall.dd), shown = x => +(x * 100).toFixed(1), gap = shown(me.ret) - shown(ix.ret);   // from the figures on screen, so the sentence adds up
    lede.innerHTML = [
      `Swings ${v} ${escH(b.name)}.`,
      Math.abs(f) < 0.01 ? 'Its worst fall was about the same.' : f < 0 ? 'Its worst fall was smaller.' : 'Its worst fall was deeper.',
      Math.abs(gap) < 0.5 ? 'Returned about the same.' : `Returned ${Math.abs(gap).toFixed(1)} points a year ${gap > 0 ? 'more' : 'less'}.`,
    ].map(x => `<span>${x}</span>`).join(' ');
  }

  function nxRkFalls(r, per) {
    const el = $('nx-rk-falls');
    if (_ddChart) { _ddChart.destroy(); _ddChart = null; }
    if (!r) { el.innerHTML = rkHead('Falls and recoveries', TIP.falls, per) + waiting('Not enough price history yet.'); return; }
    const rec = RK().recovery(r.series.V, r.series.d), dur = RK().dur;
    el.innerHTML = rkHead('Falls and recoveries', TIP.falls, per) + (rec.dd > -0.0005 ? waiting('No fall from a high in this period.') : `
      <div class="nx-rec">
        <div><span>Worst fall</span><b>${rPct(rec.dd)}</b><small>${_riskDate(rec.peak)} → ${_riskDate(rec.trough)} · over ${dur(rec.fallDays)}</small></div>
        <div><span>Time to recover</span><b>${rec.recDays != null ? dur(rec.recDays) : 'Not yet'}</b><small>${rec.recovered ? `back at the old high on ${_riskDate(rec.recovered)}` : `still ${(Math.abs(rec.below) * 100).toFixed(1)}% below the high`}</small></div>
      </div>
      <div class="chart-wrap" style="height:170px;"><canvas id="nx-dd-chart"></canvas></div>`);
    const cv = $('nx-dd-chart'); if (!cv) return;
    _ddChart = new Chart(cv, {
      type: 'line',
      data: { labels: r.series.d.map(x => fmtDay(x, false)), datasets: [{ label: 'Below previous high', data: rec.underwater.map(x => +(x * 100).toFixed(2)), borderColor: cssv('--down'), backgroundColor: cssv('--down'), fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw.toFixed(1)}% below the high` } } },
        scales: { x: { ticks: { color: cssv('--text3'), maxTicksLimit: 6, maxRotation: 0 } }, y: { max: 0, ticks: { color: cssv('--text3'), callback: v => v + '%' }, grid: {} } } },
    });
  }

  function nxRkLoss(s1, s3, value) {
    const v1 = s1 ? riskVaR(s1.V, 1) : null, v4 = s3 ? riskVaR(s3.V, 4) : null;
    const line = (k, sub, per, f) => `<div class="nx-loss-row"><div><b>${k}</b><small>${sub} · ${per}</small></div><span class="nx-loss-amt">${eurPort(-f * value)}</span><span class="nx-loss-pct">${rPct(-f)}</span></div>`;
    $('nx-rk-loss').innerHTML = rkHead('How much you could lose', TIP.loss) +
      (v1 ? line('On a bad day', '1 day in 20 lost at least this', 'last 12 months', v1.var) : '') +
      (v4 ? line('In a bad month', '1 month in 20 lost at least this', 'last 3 years', v4.var) : '') +
      (!v1 && !v4 ? waiting('Not enough price history yet.') : '') +
      `<div class="nx-rr-foot"><span>Value at risk at 95%, on today’s value of</span> ${eurPort(value)}.</div>`;
  }

  // what-if rows and crisis rows share one look and one bar scale
  const scRow = (name, ret, eur, dates, bench) => `<div class="nx-sc-row"><b class="nx-sc-name">${name}</b>
      ${ret == null ? '<span class="nx-sc-none">No prices for today’s holdings then.</span>' : `<span class="nx-sc-pct ${ret < 0 ? 'down-text' : 'up-text'}">${rSigned(ret)}</span><span class="nx-sc-eur">${eurPort(eur)}</span>
      <span class="nx-sc-bar"><span class="${ret < 0 ? 'down' : 'up'}" style="width:${Math.min(100, Math.abs(ret) / STRESS_SCALE * 100).toFixed(1)}%"></span></span>`}
      ${dates ? `<small class="nx-sc-dates">${dates}</small>` : ''}${bench ? `<small class="nx-sc-bench">${bench}</small>` : ''}</div>`;

  function nxRkWhatIf(r, b, per, value) {
    const beta = r?.bench?.beta;
    $('nx-rk-whatif-h').innerHTML = `<span>If ${escH(b.name)} fell…</span>${tipH(TIP.whatIf)}<span class="nx-rk-tag">${beta != null ? `<span>beta</span> ${rNum(beta, 2)} · ` : ''}<span>${per}</span></span>`;
    $('nx-rk-whatif').innerHTML = beta == null ? waiting(r ? 'Needs the benchmark’s prices.' : 'Not enough price history yet.')
      : [0.1, 0.2, 0.3].map(f => { const est = Math.max(-1, -f * beta); return scRow(`A ${f * 100}% fall`, est, est * value); }).join('');
  }

  function nxRkCrises(holdings, hist, b) {
    const scs = RISK_SCENARIOS.map(sc => riskScenario(holdings, hist, b.ticker, sc));
    const missing = [...new Set(scs.flatMap(s => s.missing))];
    $('nx-rk-crises').innerHTML = scs.map(s => scRow(s.name, s.ret, s.eur, span2(rDay(s.from), rDay(s.to)), s.bench != null ? `${escH(b.name)} ${rSigned(s.bench)}` : '')).join('') +
      (missing.length ? `<div class="nx-rr-foot"><span>Not included where they weren’t listed yet:</span> ${missing.map(escH).join(', ')}.</div>` : '');
  }

  function nxRkMarket(r, b, per) {
    const el = $('nx-rk-market');
    if (!r) { el.innerHTML = rkHead('How you move with the market', TIP.market, per) + waiting('Not enough price history yet.'); return; }
    const cap = r.series.rb ? RK().capture(r.series.rp, r.series.rb) : null, name = escH(b.name);
    const capRow = (label, v, good, sub) => `<div class="nx-cap-row"><div class="nx-cap-top"><span>${label}</span><b class="${good === true ? 'up-text' : good === false ? 'down-text' : ''}">${rNum(Math.round(v * 100), 0, '%')}</b></div>
        <div class="nx-cap-track"><span class="nx-cap-fill" style="width:${Math.max(0, Math.min(100, v / 2 * 100)).toFixed(1)}%;background:${good === true ? 'var(--up)' : good === false ? 'var(--down)' : 'var(--gold)'};"></span><i class="nx-cap-mark" title="100% = moves exactly like the benchmark"></i></div><small>${sub}</small></div>`;
    el.innerHTML = rkHead('How you move with the market', TIP.market, per) + `
      <div class="nx-rec">
        <div><span>Volatility</span><b>${rPct(r.vol)}</b><small>${r.bench ? `per year · ${name} ${rPct(r.bench.vol)}` : 'per year'}</small></div>
        <div><span>Beta</span><b>${r.bench?.beta != null ? rNum(r.bench.beta, 2) : '–'}</b><small>${r.bench?.corr != null ? `correlation ${rNum(r.bench.corr, 2)}` : 'Needs the benchmark’s prices.'}</small></div>
      </div>` + (cap && cap.up != null && cap.down != null
      ? capRow(`On days ${name} rose`, cap.up, cap.up >= 1 ? true : null,
          cap.up < 0 ? 'On those days you fell slightly, on average.' : `You rose ${Math.round(cap.up * 100)}% as much as it did${cap.up >= 1 ? ', more than the market' : ''}.`) +
        capRow(`On days ${name} fell`, cap.down, cap.down <= 1,
          cap.down < 0 ? 'On those days you rose slightly, on average.' : `You fell ${Math.round(cap.down * 100)}% as much as it did${cap.down < 1 ? ', a cushion' : ', harder than the market'}.`)
      : '');
  }

  // a row of Concentration, above its note (risk.js redraws the card each time)
  function nxRkEffN(holdings) {
    const c = riskConcentration(holdings), box = $('risk-conc');
    if (!c || !box) return;
    box.querySelector('.nx-rk-effn')?.remove();
    const row = `<div class="nx-rk-effn"><span>Effective holdings${tipH(TIP.effN)}</span><small>from ${c.count} holdings</small><b>${c.effN.toFixed(1)}</b></div>`;
    const note = box.querySelector('.risk-note');
    note ? note.insertAdjacentHTML('beforebegin', row) : box.insertAdjacentHTML('beforeend', row);
  }

  function nxRkReward(s, rf, R, b) {
    const el = $('nx-rk-reward'), head = rkHead('Risk vs reward', TIP.reward, 'Last 3 years');
    if (!s) { el.innerHTML = head + waiting('Couldn’t load three years of prices. Yahoo may be busy; try again in a few minutes.'); return; }
    if (!rf) { el.innerHTML = head + waiting('Couldn’t get the euro cash rate (€STR) from the ECB, so these are left out for now.'); return; }
    if (R.years < 1) { el.innerHTML = head + waiting('Needs at least a year of prices for today’s holdings.'); return; }
    el.innerHTML = head + `<div class="nx-rk-sharpe"><span class="nx-rr-k">Sharpe ratio</span><div class="nx-rr-v"><b>${R.sharpe != null ? rNum(R.sharpe, 2) : '–'}</b>${R.sharpe != null ? grade(R.sharpe, SHARPE_CUTS) : ''}</div>
        <small>${R.sharpe != null && R.sharpe < 0 ? 'Returned less than cash, for the risk taken.' : 'Return above cash per unit of volatility.'}</small></div>
      <div class="nx-rr-facts">
        <span><i>Period</i><b>${span2(rDay(s.d[0]), rDay(s.d[s.d.length - 1]))}</b></span>
        <span><i>Return, a year</i><b>${rSigned(R.ret)}</b></span>
        <span><i>Volatility, a year</i><b>${rPct(R.vol)}</b></span>
        <span><i>Cash (€STR), a year</i><b>${rf.avg.toFixed(2)}%</b></span>
        ${R.benchRet != null ? `<span><i>${escH(b.name)}, a year</i><b>${rSigned(R.benchRet)}</b></span>` : ''}
      </div>${s.excluded.length ? `<div class="nx-rr-foot"><span>Not included (too little history):</span> ${s.excluded.map(escH).join(', ')}.</div>` : ''}`;
  }

  function nxRkDetail(s1, s3, rf, R, b, value) {
    const tile = (k, v, c, line, per) => `<div class="nx-rr-tile"><span class="nx-rr-k">${k}</span><div class="nx-rr-v"><b>${v}</b>${c}</div><small>${line}</small><span class="nx-rk-tag">${per}</span></div>`;
    const v1 = s1 ? riskVaR(s1.V, 1) : null, ok = R && R.years >= 1;
    const tiles = [
      ok && R.sortino != null ? tile('Sortino ratio', rNum(R.sortino, 2), grade(R.sortino, SORTINO_CUTS), 'The Sharpe ratio, counting only the falls.', 'Last 3 years') : '',
      ok && R.ir != null ? tile('Information ratio', rNum(R.ir, 2), grade(R.ir, IR_CUTS),
        `<span>${R.active >= 0 ? 'Beat' : 'Lagged'} ${escH(b.name)} by ${rPct(Math.abs(R.active))} a year.</span> <span>Tracking error ${rPct(R.te)} a year: how far your returns strayed from it.</span> ${chip(R.te < 0.02 ? 'Close to the index' : R.te < 0.05 ? 'Moderate' : 'Its own path', 'mid')}`, 'Last 3 years') : '',
      v1 ? tile('Expected shortfall', eurPort(-v1.es * value), `<em class="nx-rr-chip mid">${rPct(-v1.es)}</em>`, 'The average loss on the worst 1 day in 20.', 'Last 12 months') : '',
    ].filter(Boolean);
    $('nx-rk-detail').innerHTML = rkHead('In more detail', TIP.detail) + (tiles.length ? `<div class="nx-rr-grid nx-rk-3">${tiles.join('')}</div>`
      : waiting(!s3 ? 'Couldn’t load three years of prices. Yahoo may be busy; try again in a few minutes.' : !rf ? 'Couldn’t get the euro cash rate (€STR) from the ECB, so these are left out for now.' : 'Needs at least a year of prices for today’s holdings.'));
  }

  // correlation, the diversification line under Risk by Holding, volatility over time
  function nxRkTogether(s1, b) {
    if (_rvChart) { _rvChart.destroy(); _rvChart = null; }
    if (!s1) {
      $('nx-rk-mix').innerHTML = '';
      $('nx-rk-corr').innerHTML = rkHead('How holdings move together', TIP.corr, 'Last 12 months') + waiting('Not enough price history yet.');
      $('nx-rk-rv').innerHTML = rkHead('Volatility over time', TIP.rv, 'Last 12 months') + waiting('Not enough price history yet.');
      return;
    }
    const C = riskCorrelation(s1.holdingCols, s1.V), n = C.tickers.length, short = t => t.replace(/\.[A-Z]+$/, '');
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([C.tickers[i], C.tickers[j], C.m[i][j]]);
    pairs.sort((x, y) => y[2] - x[2]);
    const close = pairs.filter(p => p[2] >= 0.6).slice(0, 3);
    const cell = (v, i, j) => {
      const a = Math.min(1, Math.abs(v)) * 0.85, bg = i === j ? 'var(--bg3)' : v >= 0 ? `rgba(242,112,109,${a.toFixed(2)})` : `rgba(var(--mint-rgb),${a.toFixed(2)})`;
      return `<span class="nx-corr-c" style="background:${bg}" title="${escH(C.tickers[i])} · ${escH(C.tickers[j])}: ${rNum(v, 2)}">${n <= 9 ? (i === j ? '' : rNum(v, 2)) : ''}</span>`;
    };
    $('nx-rk-mix').innerHTML = C.reduction != null ? `<span>Last 12 months:</span> Mixing them makes the portfolio swing ${rPct(C.reduction, 0)} less than its holdings would on their own.` : '';
    $('nx-rk-corr').innerHTML = rkHead('How holdings move together', TIP.corr, 'Last 12 months') + `
      <div class="nx-corr" style="--n:${n}"><span></span>${C.tickers.map(t => `<span class="nx-corr-h" title="${escH(t)}">${escH(short(t))}</span>`).join('')}
        ${C.m.map((row, i) => `<span class="nx-corr-l" title="${escH(C.tickers[i])}">${escH(short(C.tickers[i]))}</span>${row.map((v, j) => cell(v, i, j)).join('')}`).join('')}</div>
      <div class="nx-corr-sum">${close.length ? `<p><span>Move most closely together:</span> ${close.map(p => `<b>${escH(short(p[0]))} · ${escH(short(p[1]))}</b> ${rNum(p[2], 2)}`).join(', ')}.</p>` : '<p>No two holdings move closely together.</p>'}</div>`;
    const rv = riskRollingVol(s1.V, 63, 252), rb = s1.bv ? riskRollingVol(s1.bv, 63, 252) : null;
    $('nx-rk-rv').innerHTML = rkHead('Volatility over time', TIP.rv, 'Last 12 months') + `
      <div class="nx-sal-keys nx-rk-keys"><span><i style="background:var(--gold)"></i>Portfolio</span>${rb ? `<span><i class="nx-key-dash"></i>${escH(b.name)}</span>` : ''}</div>
      <div class="chart-wrap" style="height:210px;"><canvas id="nx-rv-chart"></canvas></div>`;
    const d = s1.d.slice(s1.d.length - rv.length);
    _rvChart = new Chart($('nx-rv-chart'), {
      type: 'line',
      data: { labels: d.map(x => fmtDay(x, false)), datasets: [
        { label: 'Portfolio', data: rv.map(x => +(x * 100).toFixed(2)), borderColor: cssv('--gold'), backgroundColor: cssv('--gold'), fill: false },
        ...(rb ? [{ label: b.name, data: rb.slice(rb.length - rv.length).map(x => +(x * 100).toFixed(2)), borderColor: cssv('--text3'), borderDash: [5, 4], backgroundColor: cssv('--text3'), fill: false }] : []) ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}  ${c.raw.toFixed(1)}%` } } },
        scales: { x: { ticks: { color: cssv('--text3'), maxTicksLimit: 6, maxRotation: 0 } }, y: { beginAtZero: true, ticks: { color: cssv('--text3'), callback: v => v + '%' }, grid: {} } } },
    });
  }

  // A fall in a foreign currency, in euros: the holdings priced in it lose that much
  function nxDollarShock(holdings, port) {
    const box = $('risk-ccy'); if (!box) return;
    box.querySelector('.nx-fx-shock')?.remove();
    const all = riskCurrencyExposure(holdings, port.cashEntries), total = all.reduce((s, c) => s + c.v, 0);
    const ccys = all.filter(c => c.ccy !== 'EUR' && c.ccy !== 'Unknown' && c.w >= 0.05);
    if (!ccys.length) return;
    box.insertAdjacentHTML('beforeend', `<div class="nx-fx-shock"><div class="nx-fx-shock-t">If a currency fell 10% against the euro</div>
      ${ccys.map(c => `<div class="nx-fx-shock-r"><span><span>${CCY.find(x => x[0] === c.ccy)?.[2] || c.ccy}</span> (${c.ccy})</span><b>${eurPort(-0.1 * c.v)}</b><small>${rPct(-0.1 * c.v / total)} <span>of the portfolio</span></small></div>`).join('')}</div>`);
  }

  // ══════════════ EXPENSES → LOGS ══════════════
  // One card: search and category inside it, expenses grouped by day with the
  // day's total, and any expense opens in place to be changed or deleted.
  let elQuery = '', elCat = 'All', elShow = 60, elEdit = null;
  const REC = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5"/></svg>';
  function dayLabel(iso) {
    const t = todayNoon(), d = noon(iso), diff = Math.round((t - d) / dayMs);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  }
  function nxExpenseLog() {
    const pane = document.getElementById('psub-expenses-logs');
    const body = document.getElementById('expenses-body');
    if (!pane || !body) return;
    let root = document.getElementById('nx-elog');
    if (!root) {
      hide(document.getElementById('e-search')?.parentElement);
      hide(document.getElementById('expense-filters'));
      hide(body.closest('.card'));
      root = Object.assign(document.createElement('div'), { id: 'nx-elog', className: 'card' });
      pane.appendChild(root);
      root.addEventListener('input', e => { if (e.target.matches('.nx-tx-search input')) { elQuery = e.target.value; elShow = 60; drawElog(); } });
      root.addEventListener('change', e => { if (e.target.matches('.nx-elog-cat')) { elCat = e.target.value; elShow = 60; nxExpenseLog(); } });
      root.addEventListener('click', onElogClick);
      root.addEventListener('submit', onElogSubmit);
      root.addEventListener('keydown', e => { if (e.key === 'Escape' && elEdit) { elEdit = null; drawElog(); } });
    }
    if (root.querySelector('.nx-tx-search input') === document.activeElement) return drawElog();
    const month = state.expenses.filter(e => expenseBelongsToMonth(e, selectedExpenseMonth));
    const counts = {}; month.forEach(e => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
    if (elCat !== 'All' && !CATS.includes(elCat)) elCat = 'All';
    const total = month.reduce((s, e) => s + Number(e.amount), 0);
    root.innerHTML = `
      <div class="nx-tx-head"><div><div class="card-title" style="margin:0;">Expenses</div>
        <div class="nx-tx-sum">${month.length ? `<span>${month.length === 1 ? '1 expense' : month.length + ' expenses'}</span> · <b>${eur(total)}</b>` : ''}</div></div>
        <div class="nx-tx-tools">
          <select class="nx-select nx-elog-cat">${['All', ...CATS].map(c => `<option value="${escH(c)}"${c === elCat ? ' selected' : ''}>${escH(c)}${(c === 'All' ? month.length : counts[c]) ? ` (${c === 'All' ? month.length : counts[c]})` : ''}</option>`).join('')}</select>
          <label class="nx-tx-search">${SEARCH}<input type="search" placeholder="Search expenses…" value="${escH(elQuery)}"></label></div></div>
      <div class="nx-elog-list"></div>`;
    drawElog();
  }
  function drawElog() {
    const list = document.querySelector('#nx-elog .nx-elog-list'); if (!list) return;
    const q = elQuery.trim().toLowerCase();
    const month = state.expenses.filter(e => expenseBelongsToMonth(e, selectedExpenseMonth));
    const rows = month.filter(e => (elCat === 'All' || e.cat === elCat) && (!q || e.desc.toLowerCase().includes(q) || e.cat.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!rows.length) { list.innerHTML = `<div class="nx-empty-line">${month.length ? 'Nothing matches.' : 'No expenses this month yet.'}</div>`; return; }
    const shown = rows.slice(0, elShow), days = new Map();
    for (const e of shown) { if (!days.has(e.date)) days.set(e.date, []); days.get(e.date).push(e); }
    let html = '';
    for (const [d, es] of days) {
      const dayTotal = rows.filter(e => e.date === d).reduce((s, e) => s + Number(e.amount), 0);
      html += `<div class="nx-tx-month"><span>${dayLabel(d)}</span><small>${eur(dayTotal)}</small></div>`;
      html += es.map(e => {
        const ci = CATS.indexOf(e.cat), col = ci >= 0 ? CAT_COLORS[ci] : 'var(--text3)';
        if (elEdit === e.id) return `<form class="nx-el-edit" data-id="${escH(e.id)}" novalidate>
            <label class="nx-f"><span>Description</span><input name="desc" value="${escH(e.desc)}"></label>
            <label class="nx-f"><span>Amount (€)</span><input name="amount" type="number" step="any" min="0" value="${+e.amount}"></label>
            <label class="nx-f"><span>Category</span><select name="cat" class="nx-select">${CATS.map(c => `<option${c === e.cat ? ' selected' : ''}>${escH(c)}</option>`).join('')}</select></label>
            <label class="nx-f"><span>Date</span><input id="nx-el-date" class="date-field" readonly></label>
            <label class="nx-ae-rec"><input type="checkbox" name="rec"${e.recurring ? ' checked' : ''}><span>Every month</span></label>
            <div class="nx-el-edit-btns"><button type="button" class="nx-goal-link" data-act="del">Delete</button>
              <button type="button" class="btn-ghost" data-act="cancel">Cancel</button><button class="btn" type="submit">Save</button></div>
          </form>`;
        return `<div class="nx-el-row" data-id="${escH(e.id)}" title="Click to change">
          <span class="nx-el-dot" style="background:${col}"></span>
          <span class="nx-el-desc"><b>${escH(e.desc)}</b>${e.recurring ? `<span class="nx-el-rec">${REC}<span>Monthly</span></span>` : ''}</span>
          <span class="nx-el-cat">${escH(e.cat)}</span>
          <span class="nx-el-amt">${eur(e.amount)}</span>
          <button type="button" class="nx-row-del" data-act="del" title="Delete">${icon('trash', 14)}</button></div>`;
      }).join('');
    }
    if (rows.length > elShow) html += `<button type="button" class="nx-tx-more" data-act="more">Show ${Math.min(60, rows.length - elShow)} more <span class="nx-tx-more-of">· ${rows.length - elShow} left</span></button>`;
    list.innerHTML = html;
    const ed = elEdit && state.expenses.find(x => x.id === elEdit);
    if (ed) { setDateField('nx-el-date', ed.date); setTimeout(() => list.querySelector('.nx-el-edit input[name="desc"]')?.focus(), 30); }
  }
  async function onElogClick(ev) {
    const b = ev.target.closest('[data-act]'), row = ev.target.closest('[data-id]');
    if (b?.dataset.act === 'more') { elShow += 60; return drawElog(); }
    if (b?.dataset.act === 'cancel') { elEdit = null; return drawElog(); }
    if (b?.dataset.act === 'del' && row) {
      const e = state.expenses.find(x => x.id === row.dataset.id); if (!e) return;
      if (!await nexoraConfirm(`Delete the expense “${e.desc}” of ${eur(e.amount)}?`)) return;
      elEdit = null; return delExpense(e.id);
    }
    if (row && row.classList.contains('nx-el-row') && !b) { elEdit = row.dataset.id; drawElog(); }
  }
  function onElogSubmit(ev) {
    ev.preventDefault();
    const f = ev.target, amount = parseFloat(f.elements.amount.value), desc = f.elements.desc.value.trim();
    if (!desc) return f.elements.desc.focus();
    if (!(amount > 0)) return f.elements.amount.focus();
    const id = f.dataset.id; elEdit = null;
    editExpense(id, { desc, amount, cat: f.elements.cat.value, date: getDateRaw('nx-el-date') || localIso(), recurring: f.elements.rec.checked });
  }

  // ══════════════ ADD A PURCHASE: the line under the form ══════════════
  // Says which company the ticker is, what you already hold of it, and what the
  // purchase comes to in euros at the ECB rate of its date, before it's saved.
  // That last part is what would have shown dollar prices being taken as euros.
  const _acNames = new Map(), _rates = new Map();
  let _ahSeq = 0;
  const pxFmt = v => (+v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  async function nxAhInfo() {
    const out = document.getElementById('h-info'); if (!out) return;
    const t = (document.getElementById('h-ticker').value || '').trim().toUpperCase();
    const n = parseFloat(document.getElementById('h-shares').value), px = parseFloat(document.getElementById('h-buy').value);
    const ccy = document.getElementById('h-buy-currency').value, date = getDateRaw('h-date') || localIso();
    const seq = ++_ahSeq;
    if (!t) { out.innerHTML = '<span>Type a ticker or a company name. The price goes in the currency it trades in, and Nexora works out the euros.</span>'; return; }
    const name = _acNames.get(t) || TICKER_DB.find(x => x.t === t)?.n || SYMBOL_DIR.find(x => x.t === t)?.n;
    const held = (ap().holdings || []).find(h => h.ticker === t);
    const parts = [];
    if (name) parts.push(`<b>${escH(name)}</b>`);
    if (held) parts.push(`<span>you hold</span> ${fmtShares(held.shares)} <span>sh at</span> ${eur(held.buyPrice)} <span>average</span>`);
    let calc = '';
    if (n > 0 && px > 0) {
      const sym = CURRENCY_SYMBOLS[ccy] || ccy + ' ';
      calc = `${fmtShares(n)} × ${sym}${pxFmt(px)} = <b>${sym}${pxFmt(n * px)}</b>`;
      if (ccy !== 'EUR') {
        const key = ccy + '|' + date;
        if (!_rates.has(key)) {
          out.innerHTML = [...parts, calc + ' · <span>getting the ECB rate…</span>'].join(' · ');
          let r = null;
          try { r = await window.electronAPI?.fetchFxRate?.({ date, fromCurrency: ccy }); } catch (e) {}
          if (r > 0) _rates.set(key, r);
          if (seq !== _ahSeq) return;   // something changed while waiting
        }
        const r = _rates.get(key);
        calc += r ? ` = <b class="nx-ah-eur">${eur(n * px / r)}</b> <span>at the ECB rate of</span> ${fmtDay(date)} <span class="nx-ah-rate">(1 EUR = ${(+r).toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ${ccy})</span>`
                  : ` · <span class="nx-stale">Couldn’t get the ECB rate for that date, so this can’t be added yet.</span>`;
      }
    }
    out.innerHTML = [...parts, calc].filter(Boolean).join(' · ') || '<span>New to this portfolio.</span>';
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
    after('renderPortfolio', nxFxNote);
    after('renderExpenses', nxExpenseLog);
    // the Risk view: its frame goes up first, the cards fill in once the app's own pass has drawn
    window.buildRiskView = (orig => async function () {
      try { rmLayout(); } catch (e) { console.error(e); }
      const out = await orig.apply(this, arguments);
      try { await nxRiskMore(); } catch (e) { console.error(e); }
      return out;
    })(window.buildRiskView);
    if (typeof SUB_BUILDERS !== 'undefined' && SUB_BUILDERS.portfolio) SUB_BUILDERS.portfolio.risk = window.buildRiskView;
    // the purchase line follows every field, including picks from the suggestions and the date picker
    const panel = document.getElementById('add-holding-panel');
    if (panel) { panel.addEventListener('input', () => nxAhInfo()); panel.addEventListener('change', () => nxAhInfo()); }
    for (const f of ['acSelect', 'acAutoDetect', 'openAddHolding']) after(f, () => setTimeout(nxAhInfo, 0));
    window.addHolding = (orig => async function () { const r = await orig.apply(this, arguments); nxAhInfo(); return r; })(window.addHolding);
    window.renderAcDrop = (orig => function (matches) { (matches || []).forEach(m => m?.t && m.n && _acNames.set(m.t, m.n)); return orig.apply(this, arguments); })(window.renderAcDrop);
  });
})();
