// ══════════════ THEMED DIALOGS ══════════════
// Replaces native alert()/confirm(), which render as a system-blue macOS box
// that looks nothing like the rest of the app.
//
// confirm() returns a boolean synchronously and a custom modal cannot, so
// mardukConfirm() returns a Promise and its call sites must await it. That is
// the whole reason the callers became async.
let _dlgResolve = null;

function _dlgClose(result) {
  const m = document.getElementById('dlg-modal');
  if (m) m.style.display = 'none';
  document.removeEventListener('keydown', _dlgKey);
  const r = _dlgResolve; _dlgResolve = null;
  if (r) r(result);
}

function _dlgKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); _dlgClose(false); }
  else if (e.key === 'Enter') { e.preventDefault(); _dlgClose(true); }
}

function _dlgOpen(message, { title = 'MARDUK', confirm = false, okLabel = 'OK' } = {}) {
  const m = document.getElementById('dlg-modal');
  // No modal in the DOM (or called before load) — fall back rather than lose the
  // message entirely, and keep confirm's meaning intact.
  if (!m) return Promise.resolve(confirm ? window.confirm(message) : (window.alert(message), true));

  document.getElementById('dlg-title').textContent = title;
  document.getElementById('dlg-body').textContent  = message;
  const ok     = document.getElementById('dlg-ok');
  const cancel = document.getElementById('dlg-cancel');
  ok.textContent = okLabel;
  cancel.style.display = confirm ? '' : 'none';

  ok.onclick     = () => _dlgClose(true);
  cancel.onclick = () => _dlgClose(false);
  // Clicking the backdrop cancels; clicking the panel must not
  m.onclick = e => { if (e.target === m) _dlgClose(false); };

  m.style.display = 'flex';
  document.addEventListener('keydown', _dlgKey);
  setTimeout(() => ok.focus(), 30);

  return new Promise(res => { _dlgResolve = res; });
}

// One dialog at a time. A second call while one was open used to overwrite the
// pending resolver, so whoever awaited the first dialog waited forever (and the
// key handler was attached twice). Now the second waits its turn.
let _dlgQueue = Promise.resolve();
function _dlgEnqueue(message, opts) {
  const run = _dlgQueue.then(() => _dlgOpen(String(message), opts));
  _dlgQueue = run.catch(() => {});
  return run;
}

// Fire-and-forget: callers do not need to await unless they want to sequence
function mardukAlert(message, title)   { return _dlgEnqueue(message, { title }); }
function mardukConfirm(message, title) { return _dlgEnqueue(message, { title, confirm: true, okLabel: 'Confirm' }); }
