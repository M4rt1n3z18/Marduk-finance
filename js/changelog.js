// ══════════════ CHANGELOG ══════════════
// Shown once, the first time you open Nexora after an update. Entries before 2.0
// describe Marduk, the app's name until then, and keep it.
//
// Keep every line short and say only what is new. Do NOT describe the old
// behaviour ("it used to open a picker…") — nobody reads release notes to be
// told what they already lived through. One line, present tense, what you can
// do now. No function names, no "refactored".
//
// Newest first. `v` must match package.json exactly.
const CHANGELOG = [
  {
    v: '2.0.4',
    title: 'A closer look at risk',
    items: [
      'Risk opens with you against an index you choose: return, volatility and worst fall side by side, then what that means in plain words.',
      'Compare with FTSE All-World, MSCI World, S&P 500, NASDAQ 100 or Euro Stoxx 50.',
      'How much you could lose on a bad day or in a bad month, in euros.',
      'Real crises replayed on what you hold today: the COVID crash, the 2022 rate rises and the 2018 sell-off.',
      'The Sharpe ratio, measured against the ECB\u2019s euro cash rate, with the scale professionals use.',
      'What a 10% fall of the dollar, or any other currency you hold, would cost you.',
      'More measures when you want them: Sortino, information ratio, tracking error, expected shortfall, how your holdings move together and volatility over time.',
      'Every card says which period it covers.',
    ],
  },
  {
    v: '2.0.3',
    title: 'Tidier, form by form',
    items: [
      'Add a purchase names the company, shows what you already hold, and what it costs in euros at that day\u2019s ECB rate, before you save.',
      'Click an expense to change it. The log is grouped by day, with each day\u2019s total.',
      'Recurring expenses can be added or skipped one by one.',
      'Negative numbers are shown in brackets, like \u20ac(3,29).',
      'AI features now live in My profile, with what the key does and what it sees.',
      'The purchases under each holding have a new look, with + Add purchase.',
      'Cleaner windows and confirmations. Deleting asks with a red button.',
    ],
  },
  {
    v: '2.0.2',
    title: 'Close positions like your broker does',
    items: [
      'Close a position by ticking the purchases you sold, all or part of each. The gain you made shows in Transactions.',
      'Holdings that trade in dollars but whose purchases were saved in euros are flagged, and you can convert them at each purchase date\u2019s rate in one go.',
      'Add holding picks the price currency from the ticker.',
      'A holding without a price is named above the totals.',
      'Dividends: yearly figures fill in even when Yahoo has none, a deleted holding\u2019s payments no longer count twice, and the cards are evenly spaced.',
    ],
  },
  {
    v: '2.0.1',
    title: 'Page by page, a cleaner look',
    items: [
      'Goals show what\u2019s left and how much to save each month to make the deadline. Add money right on the card.',
      'Transactions are grouped by month with what each trade cost, and you can filter and search them. Deleting one asks first.',
      'Dividends on one page: received this year, expected a year, month by month and by holding.',
      'Cash shows a card per currency. Click an amount to change it.',
      'Money set aside to invest is one bar on the Portfolio overview, and each allocation shows how much of it is invested.',
      'Dates read \u201c26 Oct 2026\u201d everywhere, and Recent expenses show their category.',
      'Top Positions and Sector Allocation line their numbers up, and Top Categories shows your five biggest.',
      'Squarer avatars, and seasonal touches on every page.',
    ],
  },
  {
    v: '2.0.0',
    title: 'Marduk is now Nexora',
    items: [
      'A new name, a new look and a new icon.',
      'Your data is encrypted with your password before it\u2019s saved, so Google Drive only ever holds a locked file.',
      'Profiles: everyone on this computer can have their own, each with a recovery key in case a password is forgotten.',
      'My profile, in the avatar menu, holds your name, avatar, password, recovery key and preferences.',
      'Nexora speaks English, Portuguese and Chinese. Choose in My profile \u2192 Preferences.',
      'Arrange your Overview: move, resize or hide cards with Customize.',
      'Budget months can start on any business day counted from the end of the month, skipping your country\u2019s public holidays.',
      'Clearer Salary, Budget, Net Worth and FIRE pages, a side panel for each holding, and more measures on the Risk page.',
      'Loans count their interest, so payments and the payoff date are right.',
      'Seasonal touches for Christmas, Halloween, New Year and your country\u2019s festivities, and in December and January, a look back at your year.',
    ],
  },
  {
    v: '1.0.48',
    title: 'Ready for the next big update',
    items: [
      'The next major version arrives with a new name and a new look. Marduk will install it automatically, like every other update.',
      'When it does, the new app opens in place of the old one. Your data stays exactly where it is.',
    ],
  },
  {
    v: '1.0.46',
    title: 'Prices and search are back',
    items: [
      'Prices, charts and ticker search load again. Yahoo Finance had started turning Marduk away, which showed up as “Rate limited”.',
      'Company details, analyst views and earnings dates load again too.',
      'Ticker suggestions are corrected: Roche, Bitcoin, Ethereum, XRP, Chainlink and several European ETFs now point to the right security, and renamed tickers are current (Block is XYZ, Polygon is POL).',
      'European ETFs in the suggestions carry their exchange (e.g. VUSA.AS, VHYL.AS), and ERNX.DE is included.',
    ],
  },
  {
    v: '1.0.45',
    title: 'Portfolio options beside the name',
    items: [
      'Each portfolio has a \u22ef button next to its name: rename it, choose the currency its values are shown in, create a new portfolio or delete it.',
      'The explanations on the Risk page open properly when you hover the \u24d8 icons.',
      'The import window is simpler.',
    ],
  },
  {
    v: '1.0.44',
    title: 'Risk view, and one holdings template',
    items: [
      'Portfolio \u2192 Risk: how much your portfolio swings, its worst fall, how it moves with the market, which holdings carry the most risk, how concentrated it is and how much of it moves with exchange rates.',
      'Import CSV accepts only the Marduk template: Symbol, Trade Date, Purchase Price, Quantity, Status. Download it from the import window.',
      'The new Status column takes Open or Closed. Closed rows are shown but not imported.',
      'The XTB import has been removed; holdings you imported with it stay as they are.',
    ],
  },
  {
    v: '1.0.43',
    title: 'More accurate prices, and a round of fixes',
    items: [
      'Stock splits: Marduk spots holdings recorded before a split and offers to adjust them, so they stop showing as a big loss. Also under Actions → Check for stock splits.',
      'Far fewer requests to Yahoo, so prices, charts and company details load more reliably.',
      'Buying in dollars or pounds now always uses the official ECB rate for that day. If no rate is available, Marduk asks you to try again rather than guessing.',
      'Dividend amounts and the company window now show euros correctly.',
      'The benchmark picker on the value-history chart works.',
      'Pressing Enter on the lock screen no longer unlocks twice, and Forgot password works.',
      'If your data file can’t be read when Marduk opens, nothing is saved over it until it’s fixed.',
      'The daily spending chart covers your whole budget month when you use a paycheck day.',
    ],
  },
  {
    v: '1.0.42',
    title: 'Import holdings from a CSV, and more room',
    items: [
      'Holdings → Import CSV: bring in your lots from a file in the Yahoo Finance format (Symbol, Trade Date, Purchase Price, Quantity).',
      'Each lot is converted to euros at the official ECB rate on its trade date, and you review everything before it is added.',
      'Lots you already have are flagged and left unticked, and the last import can be undone in one click.',
      'The Add Holding form folds away until you need it.',
      'Marduk now uses the full width of your screen.',
    ],
  },
  {
    v: '1.0.41',
    title: 'Lighter Portfolio and Expenses',
    items: [
      'The row of section tabs is gone from Portfolio and Expenses. Switch sections from the menu on each tab button.',
      'That menu highlights the section you are in, and its name shows under the page title.',
    ],
  },
  {
    v: '1.0.40',
    title: 'Month in Review works',
    items: [
      'Fixes Regenerate doing nothing on the monthly summary, and it now says why if it fails.',
      'Expense category suggestions use a faster, cheaper model.',
    ],
  },
  {
    v: '1.0.39',
    title: 'Import options and month picker',
    items: [
      'Import: mark a row as Cash to add it to your portfolio\u2019s uninvested cash.',
      'Review and Columns cards use the space properly, with centred headers.',
      'Your Month in Review: pick any of the last 12 months.',
    ],
  },
  {
    v: '1.0.38',
    title: 'Chart spacing',
    items: [
      'More space between the donut charts and their legends.',
    ],
  },
  {
    v: '1.0.37',
    title: 'Readable spending breakdown',
    items: [
      'Spending by Category is now Top Categories: the five biggest, with percentages beside them.',
      'Everything smaller moves to its own Smaller Categories card, as ranked bars with amounts and percentages.',
    ],
  },
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
      'In the import review, where a category came from is now a coloured badge: green when Marduk already knew the merchant, gold when it needs your decision, blue for credits.',
      'Allocation by Class: bigger ring, and the percentages sit beside their labels instead of across the card. Largest slice first.',
    ],
  },
  {
    v: '1.0.34',
    title: 'Marduk-styled dialogs, Extra Income on import',
    items: [
      'Confirmations and messages now use Marduk\u2019s own styling instead of the grey system box.',
      'Import: mark a credit as Extra income and it becomes an Extra income entry in the Budget tab, counting toward that month\u2019s income and savings rate.',
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

const CHANGELOG_SEEN_KEY = 'nexora_last_seen_version';

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
    <div class="nx-cl-entry">
      <div class="nx-cl-head"><span class="nx-cl-title">${e.title}</span><span class="nx-cl-v">${e.v}</span></div>
      <ul class="nx-cl-list">${e.items.map(i => `<li>${i}</li>`).join('')}</ul>
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
  try { localStorage.setItem(CHANGELOG_SEEN_KEY, _appVersion || ''); } catch(e) {}
}

let _appVersion = '';

// Called after unlock. Shows only when the version actually changed.
async function maybeShowChangelog() {
  try {
    _appVersion = await window.electronAPI?.getVersion?.() || '';
    if (!_appVersion) return;
    const seen = localStorage.getItem(CHANGELOG_SEEN_KEY);
    if (seen === _appVersion) return;

    // No stored version means either a genuinely new install or — far more
    // likely right now — an existing user updating to the first build that
    // records it. Show just the current release rather than nothing, so the
    // update they *just* installed is explained.
    const entries = seen
      ? changelogSince(seen, _appVersion)
      : CHANGELOG.filter(c => c.v === _appVersion);
    if (entries.length) openChangelog(entries);
    else localStorage.setItem(CHANGELOG_SEEN_KEY, _appVersion);
  } catch(e) { /* never block startup over release notes */ }
}
