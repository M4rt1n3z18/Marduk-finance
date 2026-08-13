// ══════════════ CHANGELOG ══════════════
// Shown once, the first time you open Marduk after an update.
//
// Keep every line short and say only what is new. Do NOT describe the old
// behaviour ("it used to open a picker…") — nobody reads release notes to be
// told what they already lived through. One line, present tense, what you can
// do now. No function names, no "refactored".
//
// Newest first. `v` must match package.json exactly.
const CHANGELOG = [
  {
    v: '1.0.36',
    title: 'Allocation charts',
    items: [
      'Fixes the Overview allocation chart stacking the ring above its legend.',
      'Both allocation charts now match: smaller ring, percentages beside their labels, largest slice first.',
    ],
  },
  {
    v: '1.0.35',
    title: 'Import and chart polish',
    items: [
      'In the import review, where a category came from is now a coloured badge \u2014 green when Marduk already knew the merchant, gold when it needs your decision, blue for credits.',
      'Allocation by Class: bigger ring, and the percentages sit beside their labels instead of across the card. Largest slice first.',
    ],
  },
  {
    v: '1.0.34',
    title: 'Marduk-styled dialogs, Extra Income on import',
    items: [
      'Confirmations and messages now use Marduk\u2019s own styling instead of the grey system box.',
      'Import: mark a credit as \u2014 Extra Income \u2014 and it becomes an Extra income entry in the Budget tab, counting toward that month\u2019s income and savings rate.',
    ],
  },
  {
    v: '1.0.33',
    title: 'Import and changelog tidy-up',
    items: [
      'Dropping a Numbers file now tells you how to export it as CSV.',
      'These notes are shorter, and this window is called Changelog.',
    ],
  },
  {
    v: '1.0.32',
    title: 'Drag and drop',
    items: [
      'Dropping a bank statement onto the import box imports that file.',
    ],
  },
  {
    v: '1.0.31',
    title: 'Clearer budget tab',
    items: [
      'Categories and limits are one list, sorted so anything near or over its limit is at the top.',
      'Each row shows spent, left, a bar, and an editable limit.',
    ],
  },
  {
    v: '1.0.30',
    title: 'Update controls',
    items: [
      'Settings → Check for updates.',
      'Failed updates now say what went wrong.',
    ],
  },
  {
    v: '1.0.29',
    title: 'Update install fixes',
    items: [
      'Updates install wherever you keep Marduk, not only the Applications folder.',
    ],
  },
  {
    v: '1.0.28',
    title: 'Updates reopen the app',
    items: [
      'Marduk reopens itself after installing an update.',
      'This window, summarising each update.',
    ],
  },
  {
    v: '1.0.27',
    title: 'Expense filtering',
    items: [
      'The category filter is a dropdown, with a count per category.',
    ],
  },
  {
    v: '1.0.26',
    title: 'Safer imports',
    items: [
      'Statement rows matching an expense you already entered by hand are flagged and left unticked.',
    ],
  },
  {
    v: '1.0.25',
    title: 'Import expenses from your bank',
    items: [
      'Expenses → Import: drop in a spreadsheet from your bank instead of typing each expense.',
      'Categories you pick are remembered and filled in automatically next time.',
      'Transfers to your broker can be logged as investments rather than spending.',
      'Any import can be undone in one click, and nothing is saved until you confirm.',
      'Your statement is read on this computer and never uploaded.',
      'The Expenses tab now has Overview, Logs, Import and Allocations.',
    ],
  },
  {
    v: '1.0.24',
    title: 'Ticker search',
    items: [
      'Search covers every US-listed stock and ETF, and works offline.',
    ],
  },
  {
    v: '1.0.23',
    title: 'Reliable prices',
    items: [
      'Prices refresh reliably again.',
      'Prices over a day old are marked in the holdings table.',
    ],
  },
  {
    v: '1.0.22',
    title: 'Correct exchange rates',
    items: [
      'Foreign holdings use the official daily European Central Bank rate, and Marduk says so when no rate is available.',
      'Total Gain matches between the stat card and the holdings table, with dividends shown separately.',
      'The Holdings Performance chart has a zero line, so losses read as losses.',
    ],
  },
  {
    v: '1.0.21',
    title: 'Calmer price updates',
    items: [
      'Prices refresh on a schedule that follows market hours. The dot by the currency selector shows the current state.',
    ],
  },
  {
    v: '1.0.20',
    title: 'Menu fix',
    items: [
      'The Portfolio menu closes after you click an item.',
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
