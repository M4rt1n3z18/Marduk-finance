// ══════════════ CHANGELOG ══════════════
// Shown once, the first time you open Marduk after an update. Written for
// someone using the app, not someone reading the code — no ticker symbols,
// no function names, no "refactored". Each line answers "what is different
// for me now?"
//
// Newest first. `v` must match package.json exactly.
const CHANGELOG = [
  {
    v: '1.0.32',
    title: 'Drag and drop actually works',
    items: [
      'Dropping a bank statement onto the import box now imports that file. It used to open a file-picker window and ask you to find the same file again.',
      'And it opened several windows at once: the import screen was being wired up again every time you unlocked Marduk, so each lock and unlock added another one.',
    ],
  },
  {
    v: '1.0.31',
    title: 'A clearer budget tab',
    items: [
      'Categories and their limits are now one list instead of a row of name tags followed by a grid of cards showing the same categories again.',
      'The list is sorted by how much of each limit you have used, so anything close to or over its limit is at the top instead of buried. You can also sort by amount spent, largest limit, or name.',
      'Each row shows what you spent, what is left, and a bar — and you can change a limit without leaving the row.',
    ],
  },
  {
    v: '1.0.30',
    title: 'Updates you can actually ask for',
    items: [
      'New: Settings → Check for updates. Marduk only looked for updates when it started and then every four hours, so a new version released while the app was open stayed invisible until you restarted it.',
      'If an update fails — no internet, a download that cuts out — Marduk now tells you instead of staying silent.',
      'Fixed a download that could be treated as finished before the file was fully written to disk.',
    ],
  },
  {
    v: '1.0.29',
    title: 'The reopen fix, for real this time',
    items: [
      'Installing this update is the first time the new restart code actually runs — the previous version shipped the fix but could not use it on its own install.',
      'Updates now also install over wherever you keep Marduk, instead of assuming the Applications folder.',
      'If it still fails to reopen, it now writes a log so the cause can be found.',
    ],
  },
  {
    v: '1.0.28',
    title: 'Updates now reopen the app',
    items: [
      'After installing an update, Marduk reopens itself. It used to just close, leaving you to start it again by hand.',
      'This window: after every update you now get a plain-English summary of what changed.',
    ],
  },
  {
    v: '1.0.27',
    title: 'Tidier expense filtering',
    items: [
      'The category filter in Expenses is a dropdown instead of a long row of buttons that wrapped onto two lines, and it shows how many expenses each category has this month.',
    ],
  },
  {
    v: '1.0.26',
    title: 'Safer statement imports',
    items: [
      'If a transaction in your bank statement looks like one you already typed in by hand, Marduk flags it and leaves it unticked, so importing old months does not count your spending twice.',
    ],
  },
  {
    v: '1.0.25',
    title: 'Import expenses from your bank',
    items: [
      'New: Expenses → Import. Drop in a spreadsheet from your bank and Marduk reads your transactions, so you no longer have to type each one.',
      'It learns as you go: the categories you pick are remembered, and the next statement fills them in for you.',
      'Transfers to your broker can be marked as investments, and become an allocation instead of an expense.',
      'Every import can be undone in one click, and nothing is saved until you confirm.',
      'Your statement is read on this computer and never uploaded anywhere.',
      'The Expenses tab is now split into Overview, Logs, Import and Allocations, with a menu when you hover the Expenses button.',
    ],
  },
  {
    v: '1.0.24',
    title: 'Ticker search that always works',
    items: [
      'Searching for a company when adding a holding now covers every US-listed stock and ETF, and works even with no internet.',
      'Prices refresh less often so the price service stops blocking us. Opening the app still refreshes straight away, so what you look at is always current.',
    ],
  },
  {
    v: '1.0.23',
    title: 'Prices stop going quietly stale',
    items: [
      'Fixed the main reason prices looked wrong: the app was asking for too much at once, getting blocked, and then silently keeping the old numbers.',
      'Prices older than a day are now marked in the holdings table, so an out-of-date number can no longer look current.',
      'Fixed a second place where foreign currency was converted at an old fixed rate.',
    ],
  },
  {
    v: '1.0.22',
    title: 'Correct exchange rates',
    items: [
      'Foreign holdings are converted using the official daily European Central Bank rate. If no rate can be fetched, Marduk says so instead of guessing — it used to fall back to an out-of-date fixed rate and overvalue dollar holdings by about 6%.',
      'Total Gain on the stat card and in the holdings table now agree. Dividends are shown separately rather than folded into one of them.',
      'The Holdings Performance chart has a proper zero line, so a loss no longer stretches past the benchmark and looks like a win.',
    ],
  },
  {
    v: '1.0.21',
    title: 'Calmer price updates',
    items: [
      'Prices refresh every 30 minutes while markets are open, more slowly when they are closed, and not at all at weekends. The dot next to the currency selector shows which.',
    ],
  },
  {
    v: '1.0.20',
    title: 'Menu fix',
    items: [
      'The Portfolio menu no longer stays open after you click one of its items.',
    ],
  },
];

const CHANGELOG_SEEN_KEY = 'marduk_last_seen_version';

function _vcmp(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

// Everything newer than the version this user last saw, up to the one they are
// now running. Compared numerically, not by position in the list: someone
// updating from a version older than any entry here (or from one skipped
// entirely) must still get the full set, which index arithmetic got wrong.
// On a first ever run we show nothing — a new user needs no history lesson.
function changelogSince(lastSeen, current) {
  if (!lastSeen) return [];
  return CHANGELOG.filter(c => _vcmp(c.v, lastSeen) > 0 && _vcmp(c.v, current) <= 0);
}

function renderChangelog(entries) {
  const body = document.getElementById('changelog-body');
  if (!body) return;
  body.innerHTML = entries.map(e => `
    <div style="margin-bottom:22px;">
      <div style="display:flex;align-items:baseline;gap:9px;margin-bottom:8px;">
        <span style="font-family:'Cinzel',serif;font-size:15px;font-weight:700;color:var(--gold);">${e.title}</span>
        <span style="font-size:11px;color:var(--text3);">v${e.v}</span>
      </div>
      <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:7px;">
        ${e.items.map(i => `<li style="font-size:13px;line-height:1.55;color:var(--text2);">${i}</li>`).join('')}
      </ul>
    </div>`).join('');
}

function openChangelog(entries) {
  const list = entries || CHANGELOG;
  if (!list.length) return;
  renderChangelog(list);
  const m = document.getElementById('changelog-modal');
  if (m) m.style.display = 'flex';   // matches the other modals in the app
}

function closeChangelog() {
  const m = document.getElementById('changelog-modal');
  if (m) m.style.display = 'none';
  // Only mark as seen once it has actually been shown and dismissed
  try { localStorage.setItem(CHANGELOG_SEEN_KEY, _mardukVersion || ''); } catch(e) {}
}

let _mardukVersion = '';

// Called after unlock. Shows only when the version actually changed.
async function maybeShowChangelog() {
  try {
    _mardukVersion = await window.electronAPI?.getVersion?.() || '';
    if (!_mardukVersion) return;
    const seen = localStorage.getItem(CHANGELOG_SEEN_KEY);
    if (seen === _mardukVersion) return;

    // No stored version means either a genuinely new install or — far more
    // likely right now — an existing user updating to the first build that
    // records it. Show just the current release rather than nothing, so the
    // update they *just* installed is explained.
    const entries = seen
      ? changelogSince(seen, _mardukVersion)
      : CHANGELOG.filter(c => c.v === _mardukVersion);
    if (entries.length) openChangelog(entries);
    else localStorage.setItem(CHANGELOG_SEEN_KEY, _mardukVersion);
  } catch(e) { /* never block startup over release notes */ }
}
