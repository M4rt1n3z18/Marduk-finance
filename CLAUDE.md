# MARDUK — Codebase Reference

Personal finance dashboard built with Electron. Syncs data via Google Drive. Distributes updates via GitHub Releases.

**Repo:** `M4rt1n3z18/Marduk-finance` (public)  
**Current version:** see `package.json` → `"version"`

---

## File Map

| File | Role |
|------|------|
| `main.js` | Electron main process — IPC handlers, Yahoo Finance fetching, payslip parser, XTB importer, auto-updater |
| `preload.js` | contextBridge — exposes `window.electronAPI` to renderer; `contextIsolation:true`, `nodeIntegration:false` |
| `index.html` | Single-page app shell — all HTML, CSS, Chart.js 4.4.1, PDF.js 3.11.174 (CDN) |
| `js/app.js` | Tab routing, theme toggle, lock screen, auto-lock, brute-force protection, updater UI, version display |
| `js/render.js` | All rendering — overview charts, portfolio table, cash table, expenses list + pagination, budget, net worth |
| `js/actions.js` | State mutations — add/edit/delete assets, transactions, expenses, budget entries, goals, recurring expenses |
| `js/salary.js` | Payslip modal (DataSnipper-style) — PDF rendering, click-to-fill, zoom controls, salary state + charts |

---

## Architecture

```
index.html
  └── loads js/app.js, js/render.js, js/actions.js, js/salary.js (in that order)

Renderer ──window.electronAPI──► preload.js ──ipcRenderer──► main.js
                                                               ├── Google Drive (marduk-data.json)
                                                               ├── userData/marduk-pw.bin (local only)
                                                               └── Yahoo Finance APIs
```

### Data flow
- **State** is a single JS object in memory (renderer side), loaded via `electronAPI.loadData()` on startup.
- **Persistence**: `save()` in `actions.js` serializes state → `electronAPI.saveData(json)` → `main.js` writes to `marduk-data.json` in the user's Google Drive folder.
- **Google Drive path**: `findGoogleDriveFolder()` in `main.js` uses `os.homedir()` — dynamic, works on any user's machine regardless of username.
- **Password**: SHA-256 hashed via `crypto.subtle.digest`, stored in `userData/marduk-pw.bin` — never in Google Drive.

---

## Key Patterns

### Adding a new IPC channel
1. Add handler in `main.js`: `ipcMain.handle('my-channel', async (event, arg) => { ... })`
2. Expose in `preload.js`: `myMethod: (arg) => ipcRenderer.invoke('my-channel', arg)`
3. Call from renderer: `electronAPI.myMethod(arg)`

### Chart.js in dark/light mode
CSS variables do **not** resolve in canvas context. Always use helper functions:
```js
const textColor = () => document.body.dataset.theme === 'dark' ? '#c9c9c9' : '#555';
const gridColor = () => document.body.dataset.theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
```

### `let` vs inline onclick
`let` declarations are block-scoped — **not accessible from HTML string `onclick` attributes**. Always wire events via `addEventListener` when using `let` variables. (This was the root cause of the expenses pagination bug.)

### DOM event listeners in rendered HTML
When re-rendering a list (e.g. `renderExpenses()`), wire buttons via `addEventListener` after setting `innerHTML`, not via inline `onclick=""`.

---

## Security

- **Auto-lock**: 10 min inactivity → `lockApp()`. Implemented in `js/app.js` with `setInterval` + activity listeners.
- **Brute-force protection**: 5 failed password attempts → 30s lockout. `_failedAttempts` / `_lockoutUntil` in `js/app.js`.
- **First-run UX**: `initLockScreen()` IIFE detects no saved password → shows "Create Password" instead of "Enter Password". IDs: `#lock-title`, `#lock-btn`.

---

## Auto-Updater

Two different strategies — **macOS cannot use electron-updater** (gets stuck at 0% on unsigned apps):

| Platform | Strategy |
|----------|----------|
| **macOS** | Custom `checkForUpdatesMac()` in `main.js` — GitHub API → download DMG with progress → `hdiutil attach` → `cp -Rf` → `xattr -cr` → `app.relaunch()` |
| **Windows / Linux** | `electron-updater` with `autoDownload: true` |

**macOS quarantine self-heal**: runs `xattr -cr <app bundle>` on every launch so the "damaged" error never appears.

**IPC events** (main → renderer):
- `update-available` (version string)
- `update-progress` (0–100)
- `update-downloaded`

**IPC command** (renderer → main):
- `install-update`

**Update banner**: shown between header and main content in `index.html`. Gold progress bar. "Restart & Install" button appears when download completes.

---

## Release Flow

```bash
# Bump version in package.json first, then:
GH_TOKEN=$(gh auth token) npm run release
git push
```

`npm run release` builds for mac + win + linux, publishes to GitHub Releases, then cleans up local build folders. `releaseType: "release"` in `package.json` ensures releases are published (not drafts).

Friends download the app once from GitHub Releases. After that, the in-app updater handles everything.

---

## Yahoo Finance APIs

All calls happen in `main.js` (Node process) to avoid CORS. Three layers:

| API | Auth | Used for |
|-----|------|---------|
| `v8/finance/chart` | None | Prices, OHLC history, dividends (events), FX rates |
| `v7/finance/quote` | None | Market cap, P/E, beta, dividends, moving averages |
| `v10/finance/quoteSummary` | Crumb + cookie | Analyst consensus, company description, earnings dates |

**EU ticker resolution**: `fetchV8Chart()` and `yahooV7Quote()` try the bare ticker first, then 16 EU exchange suffixes (`.DE`, `.LS`, `.PA`, etc.). Successful form is cached in `_tickerResolutionCache`.

**Crumb**: fetched by visiting Yahoo Finance homepage → extracting session cookies → hitting `/v1/test/getcrumb`. Cached 1 hour, auto-refreshed on 401.

---

## FX Rates (`main.js`)

Every foreign holding's EUR value depends on this, so it must never guess.

**Source chain** (`getFxRates()`): ECB daily XML → Yahoo `EURUSD=X` → last known good from `userData/marduk-fx.json` → **`null`**. `priceToEur(price, currency, fx)` returns `null` when the rate is unknown, and `fetchYahooQuote` then returns `null` so the holding keeps its previous price. **Never substitute a hardcoded rate** — the original bug was `let eurUsd = 1.08` silently surviving a Yahoo 429, overvaluing every USD position by ~6% with nothing on screen to indicate it.

- ECB is primary: free, no key, no rate limit, all ~30 currencies in one request, and the official rates Portuguese tax reporting uses. Cached 12h (`FX_TTL_MS`; the ECB publishes once daily ~16:00 CET).
- `priceToEur` handles **`GBp`** (LSE quotes in pence → `/100/GBP`). Before this, only `USD` was converted and anything else passed through as if it were EUR.
- `fetch-prices` returns a `_fx` key (`{source, date, stale, ageMs}`) alongside the tickers. It has no `.price`, so the renderer's `if (data && data.price)` loop skips it. `actions.js` stores it in `_fxStatus`; a stale rate turns `#live-dot` gold and shows `FX stale`, outranking the market-phase display.
- Holdings additionally store `currentPriceNative`, `priceCurrency`, `fxRateUsed` — additive audit trail, so a suspect value can be diagnosed instead of guessed at. `currentPrice` remains EUR, so no consumer changed. *(Storing native prices and converting at render time via one helper is the eventual correct design; it touches ~20 call sites.)*

**Yahoo request discipline** (`main.js`) — Yahoo rate-limits hard, and silent 429s were the real cause of "prices are wrong": stale values that looked current. `yfetch()` throws `RateLimited` on HTTP 429 and sets a 90s cooldown; `mapLimit(items, 3, fn)` caps concurrency. **A 429 must never fall through to the exchange-suffix probe** — it isn't "ticker not found". Before: 15 holdings × 14 attempts ≈ 210 near-simultaneous requests, which caused the very 429s it then misread. After: 1 request when Yahoo is refusing, plus a `rateLimited` flag in `_fx` so the Refresh button can say *"Rate limited — try later"* instead of quietly keeping old numbers. `search-tickers` returns **`null`** when rate-limited vs `[]` for a genuine miss, and caches hits in `_searchCache`.

**Renderer FX** — `FX_RATES` in `actions.js` (display currency, cash, dividends) was a *second* hardcoded table frozen at USD 1.08. `syncFxRates()` now overwrites it in place from IPC `get-fx-rates` on startup and after every refresh; the literal values are seeds only. Mutate, never reassign — every consumer holds the same object reference.

**Price staleness** — holdings store `priceUpdatedAt`; `priceAgeBadge()` in `charts.js` marks anything over 24h old in the holdings table.

**Ticker autocomplete** — `TICKER_DB` (~314 large caps in `state.js`) covers only a fraction of a real portfolio, so when live search was rate-limited the dropdown came up empty and looked like "Marduk doesn't know this ticker". `ownedTickerEntries()` in `utils.js` prepends everything you already hold, and a `null` search result renders an explicit *"live search unavailable"* note rather than nothing.

**Gain semantics** — `gain` is **price-only** in both `portfolioStats()` (`charts.js`) and `totalPortfolioStats()` (`state.js`), matching the holdings table's *Total Gain* column; `totalRet`/`totalRetPct` add received dividends. They used to disagree (stat cards added dividends, the table didn't), so the column never summed to the headline. Dividends now appear beside the percentage (`· +€52.12 div`). The Returns sub-tab's *Total Return* column deliberately includes them — different label, different meaning.

**Holdings Performance chart** (`charts2.js`) uses a **diverging scale around a real zero axis** (`lo`/`hi`/`span`/`posOf`). Bar width came from `Math.abs(ret)` with every bar growing from the left edge, so a −22% loss reached past a +20% benchmark line and read as if it had beaten the market. Losses now extend left of zero, gains right; `.hperf-zero` marks the axis when any loss exists.

## Payslip Parser

**Hybrid strategy** (`main.js` → `parsePayslipHybrid`): if an Anthropic API key is configured, the PDF is parsed by Claude AI (`parsePayslipAI`); on any failure — or with no key — it falls back to the regex parser (`parsePdfAtPath`).

### AI parsing (`main.js` → `parsePayslipAI`)
- Uses `@anthropic-ai/sdk`, model `claude-opus-4-8`, base64 PDF document block + structured outputs (`output_config.format` with `PAYSLIP_SCHEMA`)
- Does **not** require Python — reads the PDF directly (vision)
- API key stored in `userData/marduk-ai-key.bin` (local only, like the password). IPC: `get-ai-key-status` (masked), `set-ai-key`, `clear-ai-key`
- UI: "✨ AI Settings" button in salary tab → `#ai-settings-modal`; `#ps-ai-badge` shows "Parsed with AI" in the payslip modal (`_aiParsed` flag)
- Sets `baseComp = baseSalary || grossSalary` and `hoursExemption = 0` for chart compatibility

### Text extraction (`main.js` → `parsePdfAtPath`)
Uses Python + `pdfplumber` via `spawnSync`. Tries 10 Python binary locations (Homebrew, system, PATH). Throws helpful error if Python or `pdfplumber` is missing.

### Field parsing (`main.js` → `parsePayslipText`)
Multilingual regex (PT/ES/FR/DE/EN/IT/NL). Priority order:
1. **EY line codes** (most reliable for EY PT payslips): `/350` (SS), `/401+/403+/404` (IRS), `/430` (meal), `0171` (holiday), `0172` (Christmas)
2. Multilingual label patterns
3. Fallback: first ALL-CAPS line for employer name

**`ptNum()` smart parser**: handles European (`1.234,56`) and US (`1,234.56`) formats. Rejects years (2000–2100), months (1–12), and `MM/YYYY` patterns to avoid date values being parsed as amounts.

### Payslip modal (`js/salary.js`)
DataSnipper-style split panel (92vw × 88vh):
- **Left 420px**: form fields. Click a `.ps-field-row` to make it active (gold highlight).
- **Right**: PDF viewer with zoom toolbar (`#ps-zoom-out`, `#ps-zoom-pct`, `#ps-zoom-in`, `#ps-zoom-fit`) and scrollable area `#ps-pdf-scroll`.

**Click-to-fill**: PDF.js renders each page to canvas + an invisible text layer of individual `<span>` elements positioned with `pdfjsLib.Util.transform(viewport.transform, item.transform)`. Clicking a span fills the active field (auto-parses number if field type is `number`). `_psFlashInput(input, ok)` flashes green/red to confirm.

**Zoom**: `_psScale` module variable. Zoom buttons use `.onclick` assignment (not `addEventListener`) to avoid duplicate listener accumulation on re-render.

**Auto-fit**: `_psRenderPDF()` calculates scale to fit panel width on first load.

Module-level variables: `_psActiveRow`, `_psPdf`, `_psScale = 1.2`

---

## XTB Importer (`main.js`)

Handles `.xlsx`, `.xls`, and `.csv` exports from XTB broker. Multilingual column headers (EN/PT/ES/DE/PL/FR).

- `parseXtbRowsSafe(rows)` — standard position sheets (Open Positions, Closed History)
- `parseXtbCashHistory(rows)` — "CASH OPERATION HISTORY" sheet (parses `OPEN BUY {shares} @ {price}` from Comment column)
- `parseXtbCsv(text)` — CSV fallback (handles `;` delimiter)
- Strips exchange suffixes (`.US`, `.DE`, `.LS`, etc.) from tickers before saving
- Detects currency from suffix before stripping

---

## Investment Allocations

Reserve money for investing without counting it as an expense. Entity in `state.allocations`:
`{ id, portfolioId, amountAllocated, amountInvested, allocationDate, status: 'open'|'used', notes, createdAt, updatedAt }` (remaining is derived).

- **Create**: "Investment Allocation" card in Expenses tab (`addAllocation()` in `actions.js`). Reduces the month's Remaining budget in Expenses + Budget tabs (via `allocationTotalForMonth`), counts as savings in the savings rate.
- **Consume**: `consumeAllocations(portfolioId, amountEur)` — FIFO on open allocations, called from `addHolding()` (manual buys) and the XTB importer. Never goes negative; excess accumulates in `state.unallocatedInvestment[portfolioId]` ("Unallocated Investment").
- **XTB guard**: only imported buys dated on/after `earliestOpenAllocationDate(portfolioId)` consume allocations — historical bulk imports don't.
- **UI**: allocation history table in Expenses; stat card row `#alloc-stats-row` (Allocated / Invested / Remaining / Unallocated) at top of Portfolio tab (`renderAllocationStats()` in `render.js`).

## Other AI features (all optional — need the AI key)

- **Expense auto-categorization**: `initAiCategorize()` in `actions.js` — on `#e-desc` change, tries local history match first (free), then IPC `ai-categorize` (Claude picks from CATS via structured-output enum).
- **Monthly AI summary**: `generateMonthlySummary()` in `app.js` — once per month, sends aggregated stats (never raw transactions) via IPC `ai-monthly-summary`, caches text in `state.aiSummaries["YYYY-MM"]` (last 12 kept). Card `#ai-summary-card` on Overview with Regenerate button. Auto-runs 2.5s after unlock.

## Settings Menu & Theme

Header "Settings" dropdown (`#settings-menu` in `index.html`, logic in `js/app.js`): Export / Import / Backups / AI Settings, plus a Theme submenu and a footer showing version + data path. Icon is an inline SVG eight-pointed Babylonian star (two rotated squares). Closes on outside click and Escape.

**Theme**: three modes persisted in `localStorage['marduk_theme_mode']` — `light` | `dark` | `system` (default `dark`). `applyTheme()` resolves the mode (system follows `prefers-color-scheme` with a live listener) and rebuilds all charts. The old header toggle + `toggleTheme()` were removed.

## Backups

`rotateBackup()` in `main.js` — before the first save of each day, copies the previous `marduk-data.json` to `userData/backups/marduk-data-YYYY-MM-DD.json` (last 10 kept, local disk only). IPC: `list-backups`, `read-backup` (name-pattern validated). UI: "⛃ Backups" header button → `#backups-modal` → `restoreBackup()` in `actions.js` (replaces state, follows the `importData()` pattern).

## True Returns & Automatic Dividend Log (`js/returns.js`)

**Automatic received-dividends log** — `syncDividendLog()` (6h cooldown, forced from the Dividends sub-view): IPC `fetch-dividend-history` pulls 10y of actual per-share payment events from Yahoo (`events=dividends`), crossed with `sharesHeldAt(port, ticker, date)` reconstructed from transactions. New entries land in `state.dividendLog` (`{id, portfolioId, ticker, date, perShare, shares, amountEur, currency, detectedAt}`), and `holding.dividends` is kept in sync (feeds Total Gain). No manual entry; cash is deliberately NOT auto-credited (would double-count with manual cash management). UI: `#div-received-card` in the Dividends sub-view (stats, cumulative chart `chart-div-received`, last-12 table) via `renderReceivedDividends()`.

**True Return card** — `buildReturnsCard()` renders `#returns-card` in the Portfolio Overview sub-view (hidden until ≥1 buy and ≥90 days of history):
- **XIRR** (`_xirr`, bisection solver): cashflows = buys (−), sells (+), received dividends (+), current holdings value (+, today). Cash excluded by design.
- **Year-by-year returns** (`_yearlyReturns`): Modified Dietz per calendar year, valuations reconstructed from Yahoo monthly closes (`fetchHistory` interval 1mo range max, 15-min main-process cache) × shares held at each date; current year marked YTD, non-annualized.

## Budget Month Boundaries (per-month paycheck days)

`state.paycheckDay` (global mode): `null` = calendar months · `'auto'` = follow salary day (2nd-to-last business day) · number = fixed day. `state.paycheckDays = { "YYYY-MM": day }` — per-budget-month overrides (the day in the **previous** calendar month when that budget month starts).

- Engine in `render.js`: `boundaryDayFor(monthKey)` (override → global), `expenseBelongsToMonth(e, M)` (month M = [its boundary in M-1, day before M+1's boundary] — asymmetric boundaries supported, no double counting), `salaryDayFor(year, monthIdx)` (the displayed salary date — configured boundary wins, else 2nd-to-last business day).
- UI in Expenses tab: `#paycheck-mode` select (Calendar/Auto/Fixed), `#paycheck-day-input` (fixed default), `#paycheck-month-input` (per-month override, placeholder = resolved), `#paycheck-day-badge` shows the resolved range ("29 Apr → 28 May · custom"), `#e-salday-note` says which rule produced the shown salary day.
- Everything downstream (Budget tab, savings rate, income history, allocations-per-month) flows through `expenseBelongsToMonth`/`salaryDayFor` — no other date logic.

## QoL settings

- **Auto-lock** configurable in Settings (5/10/30 min/Never), `localStorage['marduk_autolock_min']`, `getAutolockMode()` in `js/app.js`.
- **Change password** modal (`#changepw-modal`, `submitChangePw()`) — verifies current (incl. legacy base64), min 4 chars.
- **Update re-check**: `main.js` re-runs the update check every 4h, not just at launch.

## Dividend Calendar

`renderDividendCalendar()` in `render.js` — card `#div-calendar-card` in Portfolio tab. Lists holdings with `dividendPerShare > 0`, sorted by `nextPayDate` (soonest first, "in Nd" badge within 14 days), shows projected annual income (`dps × shares`). Hidden when no dividend payers.

## Tabs and State

Tabs: `overview`, `portfolio`, `expenses`, `budget`, `networth`, `goals`, `salary`

`showTab(name, el)` in `js/app.js` rebuilds charts for the active tab.

**Auto-refresh is market-hours aware** (`actions.js`): `marketPhase()` resolves `'open' | 'quiet' | 'weekend'` in **Europe/Lisbon** (explicit timezone, so it stays correct for users abroad; `hourCycle:'h23'` avoids the hour-24 midnight bug). Cadence — open (weekday 08:00–21:30, Euronext open → after NYSE close) `REFRESH_OPEN_MS` 5 min · quiet `REFRESH_QUIET_MS` 60 min · weekend paused, re-checking hourly so Monday resumes itself. `_resetAutoRefreshCountdown()` is a **self-rescheduling `setTimeout`**, not `setInterval`, because the delay changes with the phase; it re-arms immediately inside the callback so an early `return` in `refreshPrices()` can't break the chain. Never poll faster — that triggers Yahoo HTTP 429s which break the richer endpoints (company info, earnings, analyst data). One coarse window is intentional: per-exchange holiday calendars aren't worth the maintenance tail. `#live-dot`/`#live-countdown` show the phase (green + countdown / grey + hourly / `closed`).

**Company modal** (`openCompanyModal` in `render.js`): price chart has a range selector (1D/1W/1M/6M/YTD/1Y/5Y — `cmodSetRange`/`_cmodDrawPriceChart`, `_CMOD_RANGE_CFG`); Market Data boxes and the Earnings/Analyst panels render only when data exists (no "—" placeholders). Holdings logo fallback uses `nextElementSibling` (a `nextSibling` text-node bug once hid the colored-initial circles).

**Visual conventions**: `font-variant-numeric: tabular-nums` is set on `body` (aligned number columns). No raw emojis in UI — every icon is an inline gold SVG (`stroke="currentColor"`, viewBox 24). Reusable `.info-tip` hover tooltip component for card-title explanations. Every nav button carries an inline SVG icon (stroke `currentColor`, Babylonian motifs: ziggurat, coin stack, tablet, scales, sun-dial circle, target, barley).

### Portfolio sub-views (Snowball-style)

The Portfolio tab is split into 5 sub-views — only one visible at a time (`.psub` / `.psub.active`, state in `portfolioSubTab`, `showPortfolioSub(name, btn)` in `js/charts.js`):

| Sub-view | Contents |
|---|---|
| `psub-overview` | stat cards, allocation cards, donut + P&L charts, value history + benchmark, monthly returns, holdings performance, sector allocation |
| `psub-holdings` | Add Holding form + holdings table (General/Dividends/Returns sub-tabs) |
| `psub-dividends` | Dividend Analysis + Dividend Calendar (`refreshDividendsSection()` force-fetches metadata; `#psub-div-empty` empty state) |
| `psub-cash` | Uninvested Cash card |
| `psub-transactions` | Transaction History |

- Hovering the **Portfolio nav button** shows a dropdown (`.nav-drop`, CSS `:hover`) linking to each sub-view via `navToPortfolioSub(name)`. The open rule is `:hover, :has(:focus-visible)` — never `:focus-within`, which leaves the menu pinned open after a mouse click because the clicked button keeps focus.
- The portfolio switcher bar stays global above the sub-views — switching portfolio keeps the current sub-view.
- Portfolio management actions (Refresh Prices `#refresh-btn`, XTB Import, CSV, Rename, New, Delete `#del-port-btn`) live in an **Actions dropdown** (`#actions-menu`, reuses `.settings-menu` classes) in the portfolio bar. `refreshPrices()` still updates `#refresh-btn`'s label even though it is now a menu item.
- Chart builders already guard on `el.offsetParent`, so hidden sub-views skip canvas work; `showPortfolioSub` rebuilds only the section that became visible.

**State shape** (top-level keys in `marduk-data.json`):
- `assets` — portfolio holdings
- `transactions` — buy/sell history
- `expenses` — expense log
- `budget` — budget categories
- `netWorthHistory` — net worth snapshots
- `goals` — savings goals
- `salaryHistory` — payslip records
- `dismissedRecurring` — dismissed recurring expense suggestions (keyed by `"YYYY-MM"`)
- `allocations` — InvestmentAllocation entities (see Investment Allocations section)
- `unallocatedInvestment` — `{ portfolioId: eur }` invested beyond allocations
- `aiSummaries` — `{ "YYYY-MM": { text, generatedAt } }` cached monthly AI summaries

---

## Known Constraints

- **PDF.js CDN** — loaded from cdnjs in `index.html`. Requires internet on first load. No offline fallback.
- **Payslip parsing requires Python + pdfplumber** — must be installed on the user's machine. The parser tries 10 Python binary locations but cannot install Python itself.
- **macOS auto-update installs to `/Applications/MARDUK.app`** — hardcoded path. Will fail if the app is run from another location.
- **Spotlight duplicates** — `dist/mac` and `dist/mac-arm64` folders left by electron-builder get indexed. Cleaned up by the release script and `.metadata_never_index` file.
- **`contextIsolation: true`** — renderer code cannot use Node APIs directly. Everything goes through `window.electronAPI`.
