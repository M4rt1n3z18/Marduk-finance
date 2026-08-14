// ══════════════ NAV ══════════════
function showTab(name, el) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  if (el) el.classList.add('active');

  // rebuild charts for that tab
  if (name==='overview') { buildSpendingChart(); buildAllocChart(); buildCatSpendChart(); buildNwHistoryChart(); buildSavRateChart(); buildIncomeHistoryChart(); }
  if (name==='portfolio') { buildPortDonut(); buildPnlBar(); buildPortHistoryChart(); buildSectorChart(); renderCashTable(); renderTransactions(); autoFetchPortfolioMetadata(); }
  if (name==='expenses') { renderExpenses(); }
  if (name==='budget') { renderBudget(); }
  if (name==='networth') { buildNwHistoryTabChart(); }
  if (name==='goals')   { renderGoals(); }
  if (name==='salary')  { renderSalary(); buildSalaryCharts(); }
}

// ══════════════ THEME ══════════════
// Three modes, persisted across launches: 'light' | 'dark' | 'system'.
// 'system' follows the OS appearance and reacts to live changes.
const THEME_MODE_KEY = 'marduk_theme_mode';

function getThemeMode() {
  const m = localStorage.getItem(THEME_MODE_KEY);
  return ['light', 'dark', 'system'].includes(m) ? m : 'dark';
}

function _resolveTheme(mode) {
  if (mode === 'system') {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode === 'light' ? 'light' : 'dark';
}

function applyTheme(rebuildCharts = true) {
  document.body.dataset.theme = _resolveTheme(getThemeMode());
  if (!rebuildCharts) return;
  // Rebuild charts with new colors (CSS vars don't resolve inside canvas)
  setTimeout(() => {
    try {
      buildSpendingChart(); buildAllocChart(); buildCatSpendChart();
      buildPortDonut(); buildPnlBar(); buildPortHistoryChart();
      buildNwHistoryChart(); buildSavRateChart(); buildIncomeHistoryChart();
      buildExpCatChart(state.expenses.filter(e => e.date && e.date.startsWith(selectedExpenseMonth||'')));
      buildSalaryCharts();
    } catch(e) {}
  }, 50);
}

function setThemeMode(mode) {
  localStorage.setItem(THEME_MODE_KEY, mode);
  applyTheme();
  _syncThemeMenu();
}

function _syncThemeMenu() {
  const mode = getThemeMode();
  const labels = { light: 'Light', dark: 'Dark', system: 'Device' };
  const labelEl = document.getElementById('settings-theme-label');
  if (labelEl) labelEl.textContent = `${labels[mode]} ▸`;
  ['light', 'dark', 'system'].forEach(m => {
    const el = document.getElementById('theme-opt-' + m);
    if (el) el.classList.toggle('active', m === mode);
  });
}

// Follow live OS appearance changes when in 'system' mode
if (window.matchMedia) {
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (getThemeMode() === 'system') applyTheme();
    });
  } catch(e) {}
}

// Apply the saved theme immediately at load (lock screen included)
applyTheme(false);

// ══════════════ SETTINGS MENU ══════════════
function toggleSettingsMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('settings-menu');
  const opening = !menu.classList.contains('open');
  menu.classList.toggle('open', opening);
  if (opening) { _syncThemeMenu(); _syncAutolockMenu(); _fillSettingsFooter(); }
}

function closeSettingsMenu() {
  const menu = document.getElementById('settings-menu');
  if (menu) menu.classList.remove('open');
  ['theme-submenu', 'autolock-submenu'].forEach(id => {
    const sub = document.getElementById(id);
    if (sub) sub.classList.remove('open');
  });
}

function toggleThemeSubmenu(e) {
  if (e) e.stopPropagation();
  document.getElementById('theme-submenu').classList.toggle('open');
}

async function _fillSettingsFooter() {
  const el = document.getElementById('settings-footer');
  if (!el) return;
  let version = '';
  try { version = window.electronAPI?.getVersion ? await window.electronAPI.getVersion() : ''; } catch(e) {}
  el.textContent = version ? `MARDUK v${version}` : 'MARDUK';
}

// ── Change password ───────────────────────────────────────────────────────────
function openChangePwModal() {
  ['cpw-current', 'cpw-new', 'cpw-confirm'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('cpw-hint').textContent = '';
  document.getElementById('changepw-modal').style.display = 'flex';
  document.getElementById('cpw-current').focus();
}

function closeChangePwModal() {
  document.getElementById('changepw-modal').style.display = 'none';
}

async function submitChangePw() {
  const hint = document.getElementById('cpw-hint');
  const current = document.getElementById('cpw-current').value;
  const next = document.getElementById('cpw-new').value.trim();
  const confirmVal = document.getElementById('cpw-confirm').value.trim();

  const stored = await getPw();
  if (!stored) { hint.textContent = 'No password is set yet — lock the app to create one.'; return; }

  // Verify current password (supports the legacy base64 format too)
  const matches = isHashed(stored)
    ? (await hashPw(current)) === stored
    : current === atob(stored);
  if (!matches) { hint.textContent = 'Current password is incorrect.'; return; }

  if (next.length < 4) { hint.textContent = 'New password must be at least 4 characters.'; return; }
  if (next !== confirmVal) { hint.textContent = 'New passwords do not match.'; return; }
  if (next === current) { hint.textContent = 'New password is the same as the current one.'; return; }

  await setPw(await hashPw(next));
  closeChangePwModal();
  showToast('✓ Password changed');
}

// ── Portfolio actions dropdown ────────────────────────────────────────────────
function toggleActionsMenu(e) {
  if (e) e.stopPropagation();
  document.getElementById('actions-menu').classList.toggle('open');
}

function closeActionsMenu() {
  const menu = document.getElementById('actions-menu');
  if (menu) menu.classList.remove('open');
}

// Close open dropdowns on any outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#settings-wrap')) closeSettingsMenu();
  if (!e.target.closest('#actions-wrap')) closeActionsMenu();
});

// ══════════════ LOCK SCREEN ══════════════
const LOCK_KEY = 'marduk_pw';

// ══════════════ SECURITY ══════════════

// ── Auto-lock after inactivity (configurable: 5/10/30 min or off) ─────────────
const AUTOLOCK_KEY = 'marduk_autolock_min';

function getAutolockMode() {
  const m = localStorage.getItem(AUTOLOCK_KEY);
  return ['5', '10', '30', 'off'].includes(m) ? m : '10';
}

function _autolockMs() {
  const m = getAutolockMode();
  return m === 'off' ? Infinity : parseInt(m) * 60 * 1000;
}

let _autoLockTimer   = null;
let _lastActivity    = Date.now();

function _onActivity() { _lastActivity = Date.now(); }

function startAutoLock() {
  stopAutoLock();
  if (getAutolockMode() === 'off') return; // auto-lock disabled
  ['mousemove','keydown','click','scroll','touchstart'].forEach(e =>
    document.addEventListener(e, _onActivity, { passive: true })
  );
  _lastActivity = Date.now();
  _autoLockTimer = setInterval(() => {
    if (Date.now() - _lastActivity >= _autolockMs()) {
      stopAutoLock();
      lockApp();
    }
  }, 30_000); // check every 30 s
}

function setAutolockMode(mode) {
  localStorage.setItem(AUTOLOCK_KEY, mode);
  startAutoLock(); // restart (or stop) the timer with the new setting
  _syncAutolockMenu();
}

function _syncAutolockMenu() {
  const mode = getAutolockMode();
  const labels = { '5': '5 min', '10': '10 min', '30': '30 min', 'off': 'Never' };
  const labelEl = document.getElementById('settings-autolock-label');
  if (labelEl) labelEl.textContent = `${labels[mode]} ▸`;
  ['5', '10', '30', 'off'].forEach(m => {
    const el = document.getElementById('autolock-opt-' + m);
    if (el) el.classList.toggle('active', m === mode);
  });
}

function toggleAutolockSubmenu(e) {
  if (e) e.stopPropagation();
  document.getElementById('autolock-submenu').classList.toggle('open');
}

function stopAutoLock() {
  if (_autoLockTimer) { clearInterval(_autoLockTimer); _autoLockTimer = null; }
  ['mousemove','keydown','click','scroll','touchstart'].forEach(e =>
    document.removeEventListener(e, _onActivity)
  );
}

// ── Brute-force protection ────────────────────────────────────────────────────
let _failedAttempts = 0;
let _lockoutUntil   = 0;
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 30_000; // 30 s

function _checkLockout() {
  if (Date.now() < _lockoutUntil) {
    const secs = Math.ceil((_lockoutUntil - Date.now()) / 1000);
    showLockError(`Too many attempts. Try again in ${secs}s.`);
    return false;
  }
  return true;
}

function _recordFailedAttempt() {
  _failedAttempts++;
  if (_failedAttempts >= MAX_ATTEMPTS) {
    _lockoutUntil = Date.now() + LOCKOUT_MS;
    _failedAttempts = 0;
    showLockError(`Too many incorrect attempts. Locked for 30 seconds.`);
  } else {
    const left = MAX_ATTEMPTS - _failedAttempts;
    showLockError(`Incorrect password. ${left} attempt${left !== 1 ? 's' : ''} remaining.`);
  }
}

function _clearFailedAttempts() { _failedAttempts = 0; _lockoutUntil = 0; }

// Helper: get/set password using Electron or localStorage
function getPw() {
  if (window.electronAPI) return window.electronAPI.getPw();
  return Promise.resolve(localStorage.getItem(LOCK_KEY));
}
async function setPw(val) {
  if (window.electronAPI) await window.electronAPI.setPw(val);
  else localStorage.setItem(LOCK_KEY, val);
}
async function clearPw() {
  if (window.electronAPI) await window.electronAPI.clearPw();
  else localStorage.removeItem(LOCK_KEY);
}
async function hashPw(val) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(val));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function isHashed(stored) {
  return /^[0-9a-f]{64}$/.test(stored);
}

async function handleLock() {
  if (!_checkLockout()) return; // enforce lockout before doing anything
  const pwVal = await getPw();
  const hasPassword = !!pwVal;
  const input = document.getElementById('lock-input');
  const confirm = document.getElementById('lock-confirm');
  const val = input.value.trim();
  if (!val) { showLockError('Please enter a password.'); return; }
  if (!hasPassword) {
    if (confirm.style.display !== 'block') {
      confirm.style.display = 'block';
      document.getElementById('lock-title').textContent = 'Confirm Password';
      document.getElementById('lock-btn').textContent = 'Set Password';
      document.getElementById('lock-hint').textContent = 'Re-enter your password to confirm.';
      document.getElementById('lock-hint').className = 'lock-hint';
      confirm.focus(); return;
    }
    const confirmVal = confirm.value.trim();
    if (val !== confirmVal) { showLockError('Passwords do not match.'); confirm.value=''; confirm.focus(); return; }
    if (val.length < 4) { showLockError('Password must be at least 4 characters.'); return; }
    await setPw(await hashPw(val));
    unlockApp();
  } else {
    let match = false;
    if (isHashed(pwVal)) {
      // Modern: compare SHA-256 hashes
      match = (await hashPw(val)) === pwVal;
    } else {
      // Legacy migration: old base64 password — check and re-save as hash
      match = val === atob(pwVal);
      if (match) await setPw(await hashPw(val));
    }
    if (match) { _clearFailedAttempts(); unlockApp(); }
    else {
      _recordFailedAttempt();
      input.value = ''; input.classList.add('error');
      setTimeout(() => input.classList.remove('error'), 400);
      input.focus();
    }
  }
}

function showLockError(msg) {
  const hint = document.getElementById('lock-hint');
  hint.textContent = msg; hint.className = 'lock-hint err';
}

async function unlockApp() {
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('app-wrapper').style.display = 'block';
  await initApp();
  startAutoLock(); // begin inactivity timer
  // Charts need the DOM to be visible first
  setTimeout(() => {
    buildSpendingChart(); buildAllocChart(); buildCatSpendChart();
    buildNwHistoryChart(); buildSavRateChart(); buildIncomeHistoryChart();
    // Auto-refresh prices on load if there are holdings
    if ((state.portfolios||[]).some(p=>(p.holdings||[]).length>0)) refreshPrices(true);
  }, 50);
}

function lockApp() {
  stopAutoLock(); // cancel inactivity timer
  document.getElementById('lock-screen').style.display = 'flex';
  document.getElementById('app-wrapper').style.display = 'none';
  document.getElementById('lock-input').value = '';
  document.getElementById('lock-confirm').value = '';
  document.getElementById('lock-confirm').style.display = 'none';
  document.getElementById('lock-hint').textContent = '';
  document.getElementById('lock-title').textContent = 'Enter Password';
  document.getElementById('lock-btn').textContent = 'Unlock';
  document.getElementById('lock-input').focus();
}

async function resetPassword() {
  const answer = prompt('To reset your password (data will be kept), type RESET and click OK:');
  if (answer === null) return; // cancelled
  if (answer.trim().toUpperCase() !== 'RESET') {
    document.getElementById('lock-hint').textContent = 'Password reset cancelled.';
    document.getElementById('lock-hint').className = 'lock-hint err';
    return;
  }
  await clearPw();
  // Data is kept — only the password is cleared
  location.reload();
}

async function initLock() {
  const hasPassword = !!(await getPw());
  const input = document.getElementById('lock-input');
  const confirm = document.getElementById('lock-confirm');
  confirm.style.display = 'none';
  if (!hasPassword) {
    document.getElementById('lock-title').textContent = 'Create Your Password';
    document.getElementById('lock-btn').textContent = 'Continue';
    document.getElementById('lock-hint').textContent = 'Choose a password with letters and numbers.';
  } else {
    document.getElementById('lock-title').textContent = 'Enter Password';
    document.getElementById('lock-btn').textContent = 'Unlock';
    document.getElementById('lock-hint').textContent = '';
  }
  input.value = '';
  input.focus();
}

async function initApp() {
  setDateField('e-date', now.toISOString().slice(0,10));
  setDateField('h-date', now.toISOString().slice(0,10));
  await load();
  // Migration guards for old saves
  if (!state.salaries) state.salaries = [];
  if (!state.extraIncomes) state.extraIncomes = [];
  if (!state.goals) state.goals = [];
  if (!state.categories || !state.categories.length) state.categories = [...DEFAULT_CATS];
  if (!state.expenses) state.expenses = [];
  if (!state.assets) state.assets = [];
  if (!state.liabilities) state.liabilities = [];
  if (!state.budgets) state.budgets = DEFAULT_CATS.map(c => ({ cat: c, limit: 0 }));
  if (state.paycheckDay === undefined) state.paycheckDay = null;
  if (!state.paycheckDays) state.paycheckDays = {};
  if (!state.payslips) state.payslips = [];
  if (!state.allocations) state.allocations = [];
  if (!state.unallocatedInvestment) state.unallocatedInvestment = {};
  if (!state.aiSummaries) state.aiSummaries = {};
  if (!state.dividendLog) state.dividendLog = [];

  // Migrate old flat holdings/transactions/portHistory → portfolios array
  if (!state.portfolios || !state.portfolios.length) {
    const legacyHoldings     = state.holdings     || [];
    const legacyTransactions = state.transactions || [];
    const legacyPortHistory  = state.portHistory  || [];
    state.portfolios = [{
      id: uid(), name: 'Main Portfolio',
      holdings: legacyHoldings, transactions: legacyTransactions, portHistory: legacyPortHistory
    }];
    state.activePortfolioId = state.portfolios[0].id;
  }
  if (!state.activePortfolioId || !state.portfolios.find(p => p.id === state.activePortfolioId)) {
    state.activePortfolioId = state.portfolios[0].id;
  }
  // Ensure every portfolio has the required arrays and fields
  state.portfolios.forEach(p => {
    if (!p.holdings)     p.holdings = [];
    if (!p.transactions) p.transactions = [];
    if (!p.portHistory)  p.portHistory = [];
    if (p.cash == null)  p.cash = 0;
    // Migrate old single cash number → cashEntries array
    if (!p.cashEntries) {
      p.cashEntries = p.cash > 0 ? [{ currency: p.currency || 'EUR', amount: p.cash }] : [];
    }
  });
  // Clean up legacy top-level fields
  delete state.holdings; delete state.transactions; delete state.portHistory;
  // Ensure all existing categories have a budget entry
  state.categories.forEach(c => { if (!state.budgets.find(b => b.cat === c)) state.budgets.push({ cat: c, limit: 0 }); });
  // Clean legacy fields
  delete state.incomes;

  // ── One-time migration: fix ETFs/Crypto that were saved as 'Stock' ──────────
  // Runs every load — guessAssetClass is fast and only mutates when necessary.
  {
    let _classFixed = false;
    for (const p of (state.portfolios || [])) {
      for (const h of (p.holdings || [])) {
        if (h.assetClass !== 'Stock') continue; // never downgrade a non-Stock entry
        const correct = guessAssetClass(h.ticker);
        if (correct !== 'Stock') { h.assetClass = correct; _classFixed = true; }
      }
    }
    if (_classFixed) { save(); }
  }

  syncCats();
  snapshotNetWorth();
  setDateField('al-date', now.toISOString().slice(0,10));
  initAiCategorize(); // AI/history-based category suggestions on the expense form
  renderAll();
  checkRecurring();
  // Live FX before anything renders — otherwise a USD-display portfolio paints
  // once at the seed rate. Cheap: ECB is cached 12h in the main process.
  syncFxRates().then(() => renderAll());
  loadSymbolDirectory(); // ~13k US symbols for offline ticker search (weekly cache)
  initBankImport();      // statement import drop zone + review wiring
  maybeShowChangelog();  // "what's new", once per version
  startAutoRefresh(); // begin market-hours-aware price polling

  // Auto-generate this month's AI summary once (no-op without an AI key)
  setTimeout(() => generateMonthlySummary(false), 2500);

  // Background: detect newly received dividends (6h cooldown inside)
  setTimeout(() => {
    syncDividendLog(false).then(changed => {
      if (changed) { renderReceivedDividends(); renderPortfolio(); }
    });
  }, 6000);
}

// ══════════════ INIT ══════════════
// Attach Enter key listeners once only (prevents accumulation on each lockApp() call)
document.getElementById('lock-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleLock(); });
document.getElementById('lock-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') handleLock(); });

// Close company modal with Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('company-modal-overlay');
    if (overlay && overlay.classList.contains('open')) { overlay.classList.remove('open'); }
    closeSettingsMenu();
    closeActionsMenu();
  }
});

initSalaryDropZone();
initLock();

// ══════════════ DYNAMIC CATEGORIES ══════════════
function syncCats() {
  if (state.categories && state.categories.length) {
    CATS = [...state.categories];
  } else {
    CATS = [...DEFAULT_CATS];
  }
  CAT_COLORS = CATS.map((_, i) => CAT_COLORS_PALETTE[i % CAT_COLORS_PALETTE.length]);
  renderCatOptions();
  // Reset the category filter so it rebuilds against the new list — the
  // selected category may no longer exist.
  expenseCatFilter = 'All';
  const filterEl = document.getElementById('expense-filters');
  if (filterEl) filterEl.innerHTML = '';
}

function renderCatOptions() {
  const sel = document.getElementById('e-cat');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = CATS.map(c => `<option${c === cur ? ' selected' : ''}>${c}</option>`).join('');
}

function addCategory() {
  const input = document.getElementById('new-cat-input');
  const name = input.value.trim();
  if (!name) return;
  if (state.categories.includes(name)) { input.value = ''; return; }
  state.categories.push(name);
  if (!state.budgets.find(b => b.cat === name)) state.budgets.push({ cat: name, limit: 0 });
  input.value = '';
  syncCats();
  save(); renderBudget(); renderExpenses();
}

async function delCategory(cat) {
  const expenseCount = state.expenses.filter(e => e.cat === cat).length;
  const msg = expenseCount > 0
    ? `Delete "${cat}"? It has ${expenseCount} expense${expenseCount > 1 ? 's' : ''} — they will keep the label but won't show in budget. Continue?`
    : `Delete category "${cat}"?`;
  if (!await mardukConfirm(msg)) return;
  state.categories = (state.categories || CATS).filter(c => c !== cat);
  state.budgets = state.budgets.filter(b => b.cat !== cat);
  syncCats();
  save(); renderBudget(); renderExpenses();
}

// ══════════════ GOALS ══════════════
function addGoal() {
  const name = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value);
  const current = parseFloat(document.getElementById('goal-current').value) || 0;
  const deadline = getDateRaw('goal-deadline');
  if (!name || isNaN(target) || target <= 0) return;
  if (!state.goals) state.goals = [];
  state.goals.push({ id: uid(), name, target, current, deadline });
  document.getElementById('goal-name').value = '';
  document.getElementById('goal-target').value = '';
  document.getElementById('goal-current').value = '';
  save(); renderGoals();
}

function delGoal(id) {
  state.goals = (state.goals || []).filter(g => g.id !== id);
  save(); renderGoals();
}

function updateGoalProgress(id, val) {
  state.goals = (state.goals || []).map(g => g.id === id ? {...g, current: parseFloat(val) || 0} : g);
  save(); renderGoals();
}

// ── FIRE Calculator ─────────────────────────────────────────────────────────
// slider init flag — prevents overwriting user's manual slider position
let _fireSliderReady = false;

function renderFire() {
  const section = document.getElementById('fire-section');
  if (!section || !section.offsetParent) return; // only render if tab is visible

  const today = new Date();

  // ── 1. Average monthly expenses (last 12 months with data) ──────────────
  let totalExp = 0, expMonths = 0;
  for (let i = 0; i < 12; i++) {
    const d   = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = getExpenseMonthKey(d.getFullYear(), d.getMonth());
    const mo  = state.expenses.filter(e => expenseBelongsToMonth(e, key))
                              .reduce((s, e) => s + Number(e.amount), 0);
    if (mo > 0) { totalExp += mo; expMonths++; }
  }
  const avgMonthlyExp = expMonths > 0 ? totalExp / expMonths : 0;
  const annualExp     = avgMonthlyExp * 12;

  // ── 2. FIRE Number (4% rule → 25× annual expenses) ──────────────────────
  const fireNumber = annualExp * 25;

  // ── 3. Current Net Worth ─────────────────────────────────────────────────
  const ps     = totalPortfolioStats();
  const totalA = (state.assets  || []).reduce((s, a) => s + Number(a.value), 0) + ps.val;
  const totalL = (state.liabilities || []).reduce((s, l) => s + Number(l.value), 0);
  const nw     = Math.max(totalA - totalL, 0);

  // ── 4. Average monthly income (last 12 months with salary data) ─────────
  let totalInc = 0, incMonths = 0;
  for (let i = 0; i < 12; i++) {
    const d   = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = getExpenseMonthKey(d.getFullYear(), d.getMonth());
    const sal = (state.salaries || []).find(s => s.month === key);
    const ext = (state.extraIncomes || []).filter(x => x.month === key)
                                          .reduce((s, x) => s + Number(x.amount), 0);
    if (sal) { totalInc += Number(sal.amount) + ext; incMonths++; }
  }
  const avgMonthlyInc = incMonths > 0 ? totalInc / incMonths : 0;
  const annualSav     = Math.max((avgMonthlyInc - avgMonthlyExp) * 12, 0);

  // ── 5. Initialise sliders once (on first render or when data becomes available) ──
  const savSlider  = document.getElementById('fire-savings-slider');
  const savValEl   = document.getElementById('fire-savings-val');
  const savMaxEl   = document.getElementById('fire-savings-max');
  if (savSlider && !_fireSliderReady && avgMonthlyInc > 0) {
    const suggested  = Math.max(Math.round((annualSav / 12) / 50) * 50, 0);
    const sliderMax  = Math.max(suggested * 4, 5000);
    savSlider.max    = sliderMax;
    savSlider.value  = suggested;
    if (savValEl) savValEl.textContent = '€' + suggested.toLocaleString('de-DE');
    if (savMaxEl) savMaxEl.textContent = '€' + sliderMax.toLocaleString('de-DE');
    _fireSliderReady = true;
  }

  // ── 6. Read current slider values ────────────────────────────────────────
  const retSlider = document.getElementById('fire-return-slider');
  const r         = retSlider ? Number(retSlider.value) / 100 : 0.07;
  const monthlySav = savSlider ? Number(savSlider.value) : annualSav / 12;
  const S          = monthlySav * 12; // annual savings from slider

  // ── 7. Years to FIRE: n = ln((T + S/r) / (NW + S/r)) / ln(1+r) ─────────
  let yearsToFire = null;
  let etaMsg = '', etaSub = '';
  const alreadyFIRED = nw >= fireNumber && fireNumber > 0;

  if (alreadyFIRED) {
    yearsToFire = 0;
  } else if (fireNumber <= 0) {
    etaMsg  = 'Log expenses';
    etaSub  = 'to calculate FIRE timeline';
  } else if (r > 0 && S >= 0) {
    const num = nw + S / r;
    const den = fireNumber + S / r;
    if (num > 0 && den > 0 && num < den) {
      yearsToFire = Math.log(den / num) / Math.log(1 + r);
    } else if (num >= den) {
      yearsToFire = 0; // already there
    } else {
      etaMsg = 'Never';
      etaSub = 'increase savings or return rate';
    }
  }

  // ── 8. Update DOM ────────────────────────────────────────────────────────
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setEl('fire-number',  fireNumber > 0 ? eur(fireNumber) : '—');
  setEl('fire-nw',      eur(nw));
  setEl('fire-ann-exp', annualExp > 0 ? eur(annualExp) : '—');
  setEl('fire-ann-sav', annualSav > 0 ? eur(annualSav) : (avgMonthlyInc > 0 ? eur(0) : '—'));

  // Progress bar
  const pctVal = fireNumber > 0 ? Math.min(nw / fireNumber * 100, 100) : 0;
  setEl('fire-pct', pctVal.toFixed(1) + '%');
  const bar = document.getElementById('fire-bar');
  if (bar) bar.style.width = pctVal.toFixed(1) + '%';

  // ETA display
  const yrsEl   = document.getElementById('fire-years');
  const lblEl   = document.getElementById('fire-years-label');
  const subEl   = document.getElementById('fire-years-sub');

  if (alreadyFIRED) {
    if (yrsEl) {
      yrsEl.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5c2.6 3.3 5.2 5.9 5.2 9.2a5.2 5.2 0 0 1-10.4 0c0-3.3 2.6-5.9 5.2-9.2z"/><path d="M12 11.8c1.1 1.3 2 2.3 2 3.6a2 2 0 0 1-4 0c0-1.3.9-2.3 2-3.6z"/></svg>';
      yrsEl.style.fontSize = '44px';
    }
    if (lblEl) lblEl.textContent = 'You have reached FIRE!';
    if (subEl) subEl.textContent = 'Your portfolio can sustain a 4% withdrawal indefinitely.';
  } else if (yearsToFire !== null && yearsToFire >= 0) {
    const yrs  = Math.floor(yearsToFire);
    const mos  = Math.round((yearsToFire - yrs) * 12);
    const fireYear = today.getFullYear() + Math.ceil(yearsToFire);
    if (yrsEl) { yrsEl.textContent = yrs + (mos > 0 ? '.' + mos : ''); yrsEl.style.fontSize = '44px'; }
    if (lblEl) lblEl.textContent = yrs === 1 ? 'year' : (mos > 0 ? `years + ${mos} month${mos > 1 ? 's' : ''}` : 'years');
    if (subEl) subEl.textContent = `Target year: ${fireYear}`;
  } else {
    if (yrsEl) { yrsEl.textContent = etaMsg || '∞'; yrsEl.style.fontSize = etaMsg ? '28px' : '44px'; }
    if (lblEl) lblEl.textContent = '';
    if (subEl) subEl.textContent = etaSub;
  }
}

function renderGoals() {
  renderFire();
  const goals = state.goals || [];
  const el = document.getElementById('goals-grid');
  if (!el) return;
  if (!goals.length) {
    el.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;padding:40px;">
      <div style="margin-bottom:12px;"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8" fill="var(--gold)"/></svg></div>
      <div style="font-size:15px;font-weight:600;color:var(--text2);">No goals yet</div>
      <div style="font-size:13px;color:var(--text3);margin-top:6px;">Add a financial goal above to start tracking your progress.</div>
    </div>`;
    return;
  }
  el.innerHTML = goals.map(g => {
    const pctVal = Math.min(g.target > 0 ? (g.current / g.target * 100) : 0, 100);
    const pctStr = pctVal.toFixed(1);
    const remaining = Math.max(g.target - g.current, 0);
    const done = pctVal >= 100;
    const barColor = done ? 'var(--up)' : pctVal >= 75 ? 'var(--gold)' : pctVal >= 40 ? '#4c8aaf' : 'var(--gold-dim)';
    let daysStr = '', daysColor = 'var(--text2)';
    if (g.deadline) {
      const days = Math.ceil((new Date(g.deadline + 'T00:00:00') - new Date()) / 86400000);
      if (days > 0) { daysStr = `${days} days left`; daysColor = days < 30 ? 'var(--down)' : 'var(--text2)'; }
      else if (days === 0) { daysStr = 'Due today!'; daysColor = 'var(--gold)'; }
      else { daysStr = `${Math.abs(days)} days overdue`; daysColor = 'var(--down)'; }
    }
    return `<div class="card" style="${done ? 'border-color:rgba(76,175,130,0.5);' : ''}">
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:14px;">
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:700;${done ? 'color:var(--up);' : ''}">${done ? '✓ ' : ''}${g.name}</div>
          ${daysStr ? `<div style="font-size:11px;color:${daysColor};margin-top:3px;">${daysStr}</div>` : ''}
        </div>
        <button class="del-btn" onclick="delGoal('${g.id}')">✕</button>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:8px;">
        <span>Saved: <strong style="color:var(--text);font-size:14px;">${eur(g.current)}</strong></span>
        <span>Target: <strong style="color:var(--gold);font-size:14px;">${eur(g.target)}</strong></span>
      </div>
      <div style="height:10px;background:var(--bg4);border-radius:5px;overflow:hidden;margin-bottom:10px;">
        <div style="height:100%;width:${pctStr}%;background:${barColor};border-radius:5px;transition:width .6s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:24px;font-weight:700;color:${barColor};">${pctStr}%</span>
        <span style="font-size:12px;color:var(--text2);">${done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 5H5.5a2.6 2.6 0 0 0 3 3.5M16 5h2.5a2.6 2.6 0 0 1-3 3.5M12 13v4M9 20h6M10 17h4"/></svg> Goal reached!' : eur(remaining) + ' to go'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;color:var(--text2);white-space:nowrap;">Update saved (€)</span>
        <input type="number" value="${g.current || ''}" placeholder="0"
          onchange="updateGoalProgress('${g.id}', this.value)"
          style="flex:1;padding:7px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:Karla,sans-serif;font-size:13px;outline:none;transition:border .2s;"
          onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
      </div>
    </div>`;
  }).join('');
}

// ══════════════ PORTFOLIO HISTORY ══════════════
function snapshotPortfolio() {
  const today = new Date().toISOString().slice(0, 10);
  for (const port of (state.portfolios || [])) {
    if (!(port.holdings||[]).length) continue;
    const val = port.holdings.reduce((s,h) => s + (h.currentPrice||h.buyPrice)*h.shares, 0);
    if (!port.portHistory) port.portHistory = [];
    const existing = port.portHistory.findIndex(s => s.date === today);
    if (existing >= 0) port.portHistory[existing].value = val;
    else port.portHistory.push({ date: today, value: val });
    if (port.portHistory.length > 180) port.portHistory = port.portHistory.slice(-180);
  }
  save();
}

// Counter to cancel stale in-flight history fetches when user switches range
let _portHistoryFetchId = 0;

// Binary-search closest value in a sorted [{t, c}] array
function nearestClose(timeline, ts) {
  if (!timeline || !timeline.length) return null;
  let lo = 0, hi = timeline.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timeline[mid].t <= ts) lo = mid; else hi = mid - 1;
  }
  return timeline[lo].c;
}

// (shared history state removed — data is now passed directly to sub-chart builders)

async function buildPortHistoryChart() {
  const el = document.getElementById('chart-port-history');
  const emptyEl = document.getElementById('port-history-empty');
  if (!el) return;
  el.style.display = '';
  if (!el.offsetParent) return;

  const holdings = ap().holdings || [];
  if (!holdings.length) {
    destroyChart('port-history');
    el.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Yahoo Finance interval/range mapping
  const RANGE_CFG = {
    '1D':  { interval: '5m',  range: '1d'  },
    '1W':  { interval: '60m', range: '5d'  },
    '1M':  { interval: '1d',  range: '1mo' },
    '3M':  { interval: '1d',  range: '3mo' },
    '6M':  { interval: '1d',  range: '6mo' },
    'YTD': { interval: '1d',  range: 'ytd' },
    '1Y':  { interval: '1wk', range: '1y'  },
    'All': { interval: '1mo', range: 'max' },
  };
  const cfg = RANGE_CFG[portHistoryRange] || RANGE_CFG['1M'];

  destroyChart('port-history');
  el.style.opacity = '0.3';

  const fetchId = ++_portHistoryFetchId;

  // ── Pre-fetch ALL chart data in parallel (history + dynamics + perf) ────────
  // This replaces 3 sequential network round-trips with a single parallel batch.
  const tickerSet = new Set(holdings.map(h => h.ticker));
  tickerSet.add('EURUSD=X');
  if (selectedBenchmarkTicker) tickerSet.add(selectedBenchmarkTicker);
  const tickerList = [...tickerSet];

  const HPERF_CFG = {
    '1M':  { interval: '1d',  range: '1mo' },
    '3M':  { interval: '1d',  range: '3mo' },
    '6M':  { interval: '1d',  range: '6mo' },
    'YTD': { interval: '1d',  range: 'ytd' },
    '1Y':  { interval: '1wk', range: '1y'  },
    'All': { interval: '1mo', range: 'max' },
  };
  const hperfCfg = HPERF_CFG[hperfRange] || HPERF_CFG['1M'];

  let histData = {}, _preFetchedDynData = {}, _preFetchedHperfData = {};
  if (window.electronAPI?.fetchHistory) {
    try {
      [histData, _preFetchedDynData, _preFetchedHperfData] = await Promise.all([
        window.electronAPI.fetchHistory({ tickers: tickerList, ...cfg }),
        window.electronAPI.fetchHistory({ tickers: tickerList, interval: '1mo', range: '2y' }),
        window.electronAPI.fetchHistory({ tickers: tickerList, ...hperfCfg }),
      ]);
    } catch(e) { console.error('fetchHistory parallel error', e); }
  }

  if (fetchId !== _portHistoryFetchId) return;
  el.style.opacity = '';

  const fxTimeline = (histData['EURUSD=X']?.timestamps || [])
    .map((t, i) => ({ t, c: histData['EURUSD=X'].closes[i] }))
    .filter(x => x.c != null);

  const tickerTimelines = {};
  for (const h of holdings) {
    const d = histData[h.ticker];
    if (!d) continue;
    tickerTimelines[h.ticker] = d.timestamps
      .map((t, i) => ({ t, c: d.closes[i] }))
      .filter(x => x.c != null);
  }

  const tsSet = new Set();
  for (const tl of Object.values(tickerTimelines)) tl.forEach(x => tsSet.add(x.t));
  const sortedTs = [...tsSet].sort((a, b) => a - b);

  if (!sortedTs.length) {
    el.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  const cash = ap().cash || 0;
  const portfolioValues = sortedTs.map(ts => {
    let total = cash;
    let hasAny = false;
    const eurUsd = nearestClose(fxTimeline, ts) || 1.08;
    for (const h of holdings) {
      const tl = tickerTimelines[h.ticker];
      if (!tl) continue;
      const close = nearestClose(tl, ts);
      if (close == null) continue;
      hasAny = true;
      const currency = histData[h.ticker]?.currency;
      total += h.shares * (currency === 'USD' ? close / eurUsd : close);
    }
    return hasAny ? Math.round(total * 100) / 100 : null;
  });

  // (data passed directly to sub-charts below — no shared state needed)

  // ── Benchmark line ──────────────────────────────────────────────────────────
  let benchmarkDataset = null;
  if (selectedBenchmarkTicker && histData[selectedBenchmarkTicker]) {
    const bmTimeline = (histData[selectedBenchmarkTicker]?.timestamps || [])
      .map((t, i) => ({ t, c: histData[selectedBenchmarkTicker].closes[i] }))
      .filter(x => x.c != null);

    if (bmTimeline.length) {
      // Find first portfolio value that's non-null
      const firstPortIdx = portfolioValues.findIndex(v => v !== null);
      const firstPortVal = portfolioValues[firstPortIdx] ?? 0;
      const firstTs      = sortedTs[firstPortIdx];
      const bmFirst      = nearestClose(bmTimeline, firstTs);

      const bmCurrency = histData[selectedBenchmarkTicker]?.currency;
      const bmValues = sortedTs.map((ts, i) => {
        if (portfolioValues[i] === null) return null;
        const bmClose = nearestClose(bmTimeline, ts);
        if (bmClose == null || !bmFirst) return null;
        const eurUsd = nearestClose(fxTimeline, ts) || 1.08;
        const bmEur  = bmCurrency === 'USD' ? bmClose / eurUsd : bmClose;
        const bmFirstEur = bmCurrency === 'USD'
          ? bmFirst / (nearestClose(fxTimeline, firstTs) || 1.08) : bmFirst;
        return bmFirstEur ? Math.round(firstPortVal * (bmEur / bmFirstEur) * 100) / 100 : null;
      });

      benchmarkDataset = {
        data: bmValues,
        label: selectedBenchmarkName,
        borderColor: 'rgba(201,168,76,0.6)',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 0,
        fill: false,
        tension: 0.2,
        spanGaps: true,
      };
    }
  }

  // ── Labels ──────────────────────────────────────────────────────────────────
  const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let prevDay = -1;
  const labels = sortedTs.map(ts => {
    const d = new Date(ts * 1000);
    const day = d.getDate(), month = d.getMonth();
    if (portHistoryRange === '1D') {
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } else if (portHistoryRange === '1W') {
      const isNewDay = day !== prevDay; prevDay = day;
      return isNewDay ? `${SHORT_MONTHS[month]} ${String(day).padStart(2,'0')}`
        : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } else if (['1Y','All'].includes(portHistoryRange)) {
      return `${SHORT_MONTHS[month]} '${String(d.getFullYear()).slice(2)}`;
    } else {
      return `${String(day).padStart(2,'0')}/${String(month+1).padStart(2,'0')}`;
    }
  });

  const nonNull = portfolioValues.filter(v => v !== null);
  const first = nonNull[0] ?? 0, last = nonNull[nonNull.length - 1] ?? 0;
  const color = last >= first ? '#4caf82' : '#e05c5c';

  const ctx = el.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, last >= first ? 'rgba(76,175,130,0.22)' : 'rgba(224,92,92,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  const tickLimit = { '1D':8, '1W':10, '1M':8, '3M':9, '6M':10, '1Y':12, 'YTD':12, 'All':12 }[portHistoryRange] || 10;
  const ptRadius  = portfolioValues.length > 60 ? 0 : 2;

  const portfolioDataset = {
    label: 'Portfolio',
    data: portfolioValues,
    borderColor: color,
    backgroundColor: grad,
    borderWidth: 1.5,
    pointBackgroundColor: color,
    pointRadius: ptRadius,
    fill: true,
    tension: 0,
    spanGaps: true,
  };

  const datasets = benchmarkDataset
    ? [portfolioDataset, benchmarkDataset]
    : [portfolioDataset];

  charts['port-history'] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 8 } },
      animation: { duration: 300 },
      plugins: {
        legend: {
          display: !!benchmarkDataset,
          labels: { color: textColor(), font: { size: 11, family: 'Karla' },
            boxWidth: 18, padding: 14,
            generateLabels: chart => chart.data.datasets.map((ds, i) => ({
              text: ds.label, fillStyle: ds.borderColor,
              strokeStyle: ds.borderColor, lineWidth: 1.5,
              lineDash: ds.borderDash || [],
              fontColor: textColor(),
              datasetIndex: i, hidden: false,
            })) }
        },
        tooltip: {
          mode: 'index', intersect: false,
          callbacks: { label: c => c.raw != null ? ` ${c.dataset.label}: ${eur(c.raw)}` : '' }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor(), font: { size: 10 }, maxTicksLimit: tickLimit } },
        y: { grid: { color: gridColor() }, ticks: { color: textColor(), callback: v => eur(v, 0) } }
      }
    }
  });

  // Pass pre-fetched data — sub-charts skip their own network round-trip
  buildPortDynamicsChart(_preFetchedDynData);
  buildHoldingsPerfChart(_preFetchedHperfData);
}

// ══════════════ AI MONTHLY SUMMARY ══════════════
// Builds a compact aggregate payload (no raw transactions), sends it to Claude
// once per month, caches the text in state.aiSummaries. Card lives on Overview.

// Which month the card is showing. Defaults to the current one; the picker in
// the card header changes it, so past months can be summarised too.
let aiSummaryMonth = null;

function _aiMonthKey() {
  return aiSummaryMonth || getExpenseMonthKey(now.getFullYear(), now.getMonth());
}

function _aiSummaryPayload() {
  const key = _aiMonthKey();
  const [ky, km] = key.split('-').map(Number);
  const prevDate = new Date(ky, km - 2, 1);
  const prevKey = getExpenseMonthKey(prevDate.getFullYear(), prevDate.getMonth());

  const monthLabel = new Date(ky, km - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const monthExp = state.expenses.filter(e => expenseBelongsToMonth(e, key));
  const prevExp = state.expenses.filter(e => expenseBelongsToMonth(e, prevKey));

  const byCat = {};
  monthExp.forEach(e => { byCat[e.cat] = (byCat[e.cat] || 0) + Number(e.amount); });
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([cat, amt]) => ({ cat, eur: Math.round(amt) }));

  const salary = (state.salaries || []).find(s => s.month === key);
  const extra = (state.extraIncomes || []).filter(x => x.month === key).reduce((s, x) => s + Number(x.amount), 0);
  const income = (salary ? salary.amount : 0) + extra;

  const ps = totalPortfolioStats();
  const nwHist = state.nwHistory || [];
  const nwNow = nwHist.find(h => h.month === key)?.value ?? null;
  const nwPrev = nwHist.find(h => h.month === prevKey)?.value ?? null;

  return {
    month: monthLabel,
    incomeEur: Math.round(income),
    spentEur: Math.round(monthExp.reduce((s, e) => s + Number(e.amount), 0)),
    spentLastMonthEur: Math.round(prevExp.reduce((s, e) => s + Number(e.amount), 0)),
    topSpendingCategories: topCats,
    allocatedToInvestEur: Math.round(allocationTotalForMonth(key)),
    portfolio: ps.count > 0 ? { valueEur: Math.round(ps.val), allTimeGainPct: +ps.gainPct.toFixed(1) } : null,
    netWorthEur: nwNow,
    netWorthLastMonthEur: nwPrev,
    goals: (state.goals || []).slice(0, 3).map(g => ({
      name: g.name, pct: g.target > 0 ? +(g.current / g.target * 100).toFixed(0) : 0,
    })),
  };
}

async function generateMonthlySummary(force = false) {
  if (!window.electronAPI?.aiMonthlySummary) return;
  const key = _aiMonthKey();
  if (!state.aiSummaries) state.aiSummaries = {};

  // Already generated this month and not forcing → just render
  if (!force && state.aiSummaries[key]?.text) { renderAiSummaryCard(); return; }

  // No AI key configured → nothing to do
  const masked = await window.electronAPI.getAiKeyStatus?.();
  if (!masked) { renderAiSummaryCard(); return; }

  const card = document.getElementById('ai-summary-card');
  const textEl = document.getElementById('ai-summary-text');
  const btn = document.getElementById('ai-summary-refresh');
  if (card) card.style.display = '';
  if (textEl) textEl.innerHTML = '<span style="color:var(--text3);">Writing your monthly summary…</span>';
  if (btn) btn.disabled = true;

  try {
    const result = await window.electronAPI.aiMonthlySummary(_aiSummaryPayload());
    // The main process returns a string on success, or {error} on failure —
    // previously every failure came back as null and looked like "not generated yet"
    if (result && typeof result === 'object' && result.error) {
      if (textEl) textEl.innerHTML =
        `<span style="color:var(--down);">Couldn't write the summary: ${result.error}</span>`;
      if (btn) btn.disabled = false;
      return;
    }
    const text = result;
    if (text) {
      state.aiSummaries[key] = { text, generatedAt: new Date().toISOString() };
      // Keep only the last 12 summaries
      const keys = Object.keys(state.aiSummaries).sort();
      while (keys.length > 12) delete state.aiSummaries[keys.shift()];
      save();
    }
  } catch (e) { console.error('AI summary error:', e); }
  if (btn) btn.disabled = false;
  renderAiSummaryCard();
}

// Months worth offering: the last 12, so you can look back without scrolling
// through every month you have ever recorded.
function _fillAiMonthPicker() {
  const sel = document.getElementById('ai-summary-month');
  if (!sel) return;
  const keys = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(getExpenseMonthKey(d.getFullYear(), d.getMonth()));
  }
  const cur = _aiMonthKey();
  sel.innerHTML = keys.map(k => {
    const [y, m] = k.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return `<option value="${k}"${k === cur ? ' selected' : ''}>${label}</option>`;
  }).join('');
}

function setAiSummaryMonth(key) {
  aiSummaryMonth = key;
  renderAiSummaryCard();
}

async function renderAiSummaryCard() {
  const card = document.getElementById('ai-summary-card');
  if (!card) return;
  _fillAiMonthPicker();
  const key = _aiMonthKey();
  const entry = (state.aiSummaries || {})[key];

  if (entry?.text) {
    card.style.display = '';
    document.getElementById('ai-summary-text').textContent = entry.text;
    const genDate = new Date(entry.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    document.getElementById('ai-summary-meta').textContent = `Generated ${genDate} · based on your aggregated monthly stats`;
    return;
  }
  // No summary yet — only show the card (with a generate hint) if a key exists
  const masked = window.electronAPI?.getAiKeyStatus ? await window.electronAPI.getAiKeyStatus() : null;
  if (masked) {
    card.style.display = '';
    document.getElementById('ai-summary-text').innerHTML =
      '<span style="color:var(--text3);">No summary for this month yet — click Regenerate to create one.</span>';
    document.getElementById('ai-summary-meta').textContent = '';
  } else {
    card.style.display = 'none';
  }
}

// ── App version display (lock screen; the Settings footer shows it in-app) ────
(async function showVersion() {
  const version = window.electronAPI?.getVersion
    ? await window.electronAPI.getVersion()
    : null;
  if (!version) return;
  const lock = document.getElementById('lock-version');
  if (lock) lock.textContent = `v${version}`;
})();

// ── Lock screen init ──────────────────────────────────────────────────────────
(async function initLockScreen() {
  // Focus the input immediately
  const input = document.getElementById('lock-input');
  if (input) {
    input.focus();
    // Allow Enter key to submit
    input.addEventListener('keydown', e => { if (e.key === 'Enter') handleLock(); });
  }
  const confirm = document.getElementById('lock-confirm');
  if (confirm) confirm.addEventListener('keydown', e => { if (e.key === 'Enter') handleLock(); });

  // Detect first run — if no password exists, switch UI to "Create" mode
  try {
    const pw = await getPw();
    if (!pw) {
      document.getElementById('lock-title').textContent = 'Create Password';
      document.getElementById('lock-btn').textContent   = 'Set Password';
      const hint = document.getElementById('lock-hint');
      hint.textContent  = 'First time here — choose a password to protect your data.';
      hint.className    = 'lock-hint';
    }
  } catch(e) {
    // If getPw fails, still show create-password UI so user isn't stuck
    document.getElementById('lock-title').textContent = 'Create Password';
    document.getElementById('lock-btn').textContent   = 'Set Password';
    const hint = document.getElementById('lock-hint');
    hint.textContent = 'First time here — choose a password to protect your data.';
    hint.className   = 'lock-hint';
  }
})();

// ── Auto-updater UI ───────────────────────────────────────────────────────────
(function initUpdater() {
  if (!window.electronAPI) return;

  const banner  = document.getElementById('update-banner');
  const msg     = document.getElementById('update-msg');
  const pct     = document.getElementById('update-pct');
  const installBtn = document.getElementById('update-install-btn');

  const progressBar  = document.getElementById('update-progress-bar');
  const progressFill = document.getElementById('update-progress-fill');

  window.electronAPI.onUpdateAvailable((version) => {
    msg.textContent        = `New version ${version} available — downloading…`;
    pct.textContent        = '0%';
    installBtn.style.display  = 'none';
    progressBar.style.display = 'block';
    progressFill.style.width  = '0%';
    banner.style.display      = 'flex';
  });

  window.electronAPI.onUpdateProgress((percent) => {
    pct.textContent          = `${percent}%`;
    progressFill.style.width = `${percent}%`;
  });

  window.electronAPI.onUpdateDownloaded(() => {
    msg.textContent           = 'Update downloaded and ready to install.';
    pct.textContent           = '';
    progressFill.style.width  = '100%';
    setTimeout(() => { progressBar.style.display = 'none'; }, 600);
    installBtn.style.display  = 'inline-flex';
    banner.style.display      = 'flex';
  });

  // A failed check used to be indistinguishable from "you're up to date"
  window.electronAPI.onUpdateError?.((text) => {
    msg.textContent           = `Update failed: ${text}`;
    pct.textContent           = '';
    progressBar.style.display = 'none';
    installBtn.style.display  = 'none';
    banner.style.display      = 'flex';
  });
})();

// Settings → Check for updates. The automatic check runs 5s after launch and
// then every 4h, so a release published while the app was open stayed invisible
// until a restart — which is what happened with 1.0.29.
async function manualUpdateCheck() {
  const banner = document.getElementById('update-banner');
  const msg    = document.getElementById('update-msg');
  if (banner && msg) {
    msg.textContent = 'Checking for updates…';
    document.getElementById('update-pct').textContent = '';
    document.getElementById('update-install-btn').style.display = 'none';
    document.getElementById('update-progress-bar').style.display = 'none';
    banner.style.display = 'flex';
  }
  await window.electronAPI?.checkForUpdates?.();
  // If nothing came back within a few seconds, we were already current — the
  // download path takes over and rewrites the banner when there is an update.
  const v = await window.electronAPI?.getVersion?.().catch(() => '') || '';
  setTimeout(() => {
    if (msg && msg.textContent === 'Checking for updates…') {
      msg.textContent = v ? `You're on the latest version (${v}).` : "You're on the latest version.";
      setTimeout(() => { if (banner) banner.style.display = 'none'; }, 4000);
    }
  }, 6000);
}

