# MARDUK — Codebase Reference

Personal finance dashboard built with Electron. Syncs data via Google Drive. Distributes updates via GitHub Releases.

**Repo:** `M4rt1n3z18/Marduk-finance` (public)  
**Current version:** see `package.json` → `"version"`

---

## File Map

| File | Role |
|------|------|
| `main.js` | Electron main process — IPC handlers, Yahoo Finance fetching, payslip parser, bank-statement reader, auto-updater |
| `preload.js` | contextBridge — exposes `window.electronAPI` to renderer; `contextIsolation:true`, `nodeIntegration:false` |
| `index.html` | Single-page app shell — all HTML, CSS, Chart.js 4.4.1, PDF.js 3.11.174 (CDN) |
| `js/app.js` | Tab routing, theme toggle, lock screen, auto-lock, brute-force protection, updater UI, version display |
| `js/render.js` | All rendering — overview charts, portfolio table, cash table, expenses list + pagination, budget, net worth |
| `js/actions.js` | State mutations — add/edit/delete assets, transactions, expenses, budget entries, goals, recurring expenses |
| `js/salary.js` | Payslip modal (DataSnipper-style) — PDF rendering, click-to-fill, zoom controls, salary state + charts |
| `js/bankimport.js` | Bank statement import — local spreadsheet parsing, column mapping, merchant learning, duplicate detection, undoable batches |
| `js/holdimport.js` | Holdings CSV import (Yahoo Finance format) — local parsing, ECB historical FX, duplicate flags, one-step undo; also the Add Holding panel toggle |
| `js/splits.js` | Stock-split detection and confirm-first adjustment of lots and holdings |
| `js/risk.js` | Portfolio → Risk: volatility, drawdown, beta, risk by holding, concentration, currency exposure |
| `js/portfolios.js` | Portfolio CSV export, expenses CSV export, portfolio create/rename/delete (was `xtb.js`) |

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
- **First-run UX**: `initLock()` detects no saved password → shows "Create Your Password" instead of "Enter Password". IDs: `#lock-title`, `#lock-btn`.
- **Exactly one Enter listener** per lock field (the `INIT` block in `app.js`). A second pair once lived in a separate IIFE, so each Enter ran `handleLock()` twice: double unlock (two price refreshes, two AI summary calls), wrong passwords counted twice, a false "passwords don't match" on first setup.
- **Forgot password** uses `mardukConfirm` — `window.prompt()` is not implemented in Electron, so the old reset silently did nothing.

---

## Auto-Updater

Two different strategies — **macOS cannot use electron-updater** (gets stuck at 0% on unsigned apps):

| Platform | Strategy |
|----------|----------|
| **macOS** | Custom `checkForUpdatesMac()` in `main.js` — GitHub API → download DMG with progress → `hdiutil attach` → `cp -Rf` → `xattr -cr` → detached `open -a` relaunch |
| **Windows / Linux** | `electron-updater` with `autoDownload: true` |

**macOS quarantine self-heal**: runs `xattr -cr <app bundle>` on every launch so the "damaged" error never appears.

**macOS updater guards** — `checkForUpdatesMac()` shares one in-flight run (the 4-hourly timer and Settings → Check for updates could download the same DMG into the same file at once); a DMG already downloaded this session is reused instead of fetched again every 4h; old `MARDUK-*.dmg` files are deleted from the temp folder at launch; `hdiutil`/`cp` failures send `update-error` and keep the app running (they used to exit anyway and reopen the old version, which offered the same update again).

**macOS restart after update** — `app.relaunch()` **cannot** be used here. It re-spawns `process.execPath`, which points inside the bundle `cp -Rf` has just overwritten, so the app quit and never came back. Instead a detached `/bin/sh -c 'sleep 2; open -a /Applications/MARDUK.app'` is spawned with `.unref()` before `app.exit(0)` — it outlives the process and goes through LaunchServices, which also refreshes the bundle record.

## Changelog (`js/changelog.js`)

`CHANGELOG` is an array of `{v, title, items[]}`, newest first, written in end-user language: **only what is new**, never a recap of the old behaviour (no function names, no "refactored"). **`v` on the top entry must match `package.json`** — bump both together.

`maybeShowChangelog()` runs after unlock: compares `app.getVersion()` with `localStorage['marduk_last_seen_version']` and shows `#changelog-modal` once per version. `changelogSince()` compares versions **numerically** via `_vcmp` — index arithmetic in the list got this wrong for anyone updating from a version not listed, and a string sort puts `1.0.9` after `1.0.20`. No stored key = show only the current entry (an existing user updating into this feature, not a fresh install). Also reachable any time from Settings → Changelog.

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
| `v8/finance/chart` | None | Prices, OHLC history, dividends and splits (events), FX rates |
| `v7/finance/quote` | Crumb + cookie (401 without, since 2025) | Market cap, P/E, beta, dividends, moving averages |
| `v10/finance/quoteSummary` | Crumb + cookie | Analyst consensus, company description, earnings dates |

**Ticker resolution** — one shared path, `withResolution(ticker, fetchOne)`, used by `fetchV8Chart()` and `fetch-prices`. `symbolCandidates()` decides what to try: the remembered symbol; for US share classes `BRK.B` → `BRK-B` first (Yahoo's spelling; NASDAQ's directory and brokers use the dot — `_yahooClassSymbol()` also rewrites the directory); a symbol that already carries `.`/`-`/`=`/`^` as-is; otherwise bare + 16 EU suffixes (`.DE`, `.LS`, … `.WA`). Resolutions are **persisted** to `userData/marduk-tickers.json` (they used to be memory-only, so every launch re-probed every European holding). A ticker nothing resolves goes in `_unresolvable` for 6h — one request per refresh instead of seventeen. A remembered symbol that stops answering is forgotten and probed once afresh. `yahooV7Quote()` makes **one** request on the resolved symbol, with the crumb — it used to probe 16 suffixes × 2 hosts without one, i.e. 34 refused requests per unresolved ticker.

**Crumb**: session cookie from `fc.yahoo.com` (a tiny 404 carrying the `A3` cookie; the finance.yahoo.com homepage is the fallback) → `/v1/test/getcrumb`. Cached 1 hour, auto-refreshed on 401. The homepage alone stopped working: its response headers exceed Node's 16 KB limit, so `fetch()` threw `UND_ERR_HEADERS_OVERFLOW` before any cookie was read.

**User-Agent — keep `YAHOO_UA = 'Mozilla/5.0'`.** Yahoo answers HTTP 429 to a full desktop-Chrome User-Agent that arrives without a browser's cookies (verified 2026-10-24 on search, chart, getcrumb and quoteSummary: Chrome string → 429 every time; bare `Mozilla/5.0` or no UA → 200, same machine, same moment). Until 1.0.46 the constant held the Chrome string, so every refresh reported "Rate limited" with nothing actually rate-limited. If 429s return across the board, test the UA first (`node` + `fetch` with each UA) before blaming request volume.

---

## FX Rates (`main.js`)

Every foreign holding's EUR value depends on this, so it must never guess.

**Source chain** (`getFxRates()`): ECB daily XML → Yahoo `EURUSD=X` → last known good from `userData/marduk-fx.json` → **`null`**. `priceToEur(price, currency, fx)` returns `null` when the rate is unknown, and `fetchYahooQuote` then returns `null` so the holding keeps its previous price. **Never substitute a hardcoded rate** — the original bug was `let eurUsd = 1.08` silently surviving a Yahoo 429, overvaluing every USD position by ~6% with nothing on screen to indicate it.

- ECB is primary: free, no key, no rate limit, all ~30 currencies in one request, and the official rates Portuguese tax reporting uses. Cached 12h (`FX_TTL_MS`; the ECB publishes once daily ~16:00 CET).
- `priceToEur` handles **`GBp`** (LSE quotes in pence → `/100/GBP`). Before this, only `USD` was converted and anything else passed through as if it were EUR.
- `fetch-prices` returns a `_fx` key (`{source, date, stale, ageMs}`) alongside the tickers. It has no `.price`, so the renderer's `if (data && data.price)` loop skips it. `actions.js` stores it in `_fxStatus`; a stale rate turns `#live-dot` gold and shows `FX stale`, outranking the market-phase display.
- Holdings additionally store `currentPriceNative`, `priceCurrency`, `fxRateUsed` — additive audit trail, so a suspect value can be diagnosed instead of guessed at. `currentPrice` remains EUR, so no consumer changed. *(Storing native prices and converting at render time via one helper is the eventual correct design; it touches ~20 call sites.)*

**Yahoo request discipline** (`main.js`) — Yahoo rate-limits hard, and silent 429s were the real cause of "prices are wrong": stale values that looked current. **Every Yahoo request goes through `yfetch(url, headers)`** — prices, history, dividends, splits, company data, search, the crumb (until 1.0.43 only prices and search did, so the charts and dividend fetches kept hammering Yahoo while the price refresh backed off). It throws `RateLimited` on HTTP 429 and sets a 90s cooldown during which it throws without sending anything. Every per-ticker IPC handler uses `mapLimit(items, 3, fn)` — the Overview alone asks for three history ranges of every holding at once. **A 429 must never fall through to the exchange-suffix probe** — it isn't "ticker not found". `fetchYahooQuote` returns `{fxMissing}` (not `null`) when the symbol exists but its currency has no rate, for the same reason. `fetch-history` doesn't cache a partial answer from a rate-limited run. The `rateLimited` flag in `_fx` lets the Refresh button say *"Rate limited — try later"*. `search-tickers` returns **`null`** when rate-limited vs `[]` for a genuine miss, and caches hits in `_searchCache`.

**Cost-basis FX** — `ecbHistory(currencies, from, to)` is one ECB data-API request (CSV, CRLF line endings) for any set of currencies over any range. `fetch-fx-rate` (Add Holding) uses it for the last published rate on/before the date, Yahoo only if the ECB is down, else `null` — and **Add Holding refuses** without a rate (it used to store the dollar price as euros). The XTB import fetches all its rates in one `fetch-fx-history` call *before* changing anything and stops if any lot lacks a rate (it used to fall back to a hardcoded 1.08/0.86 per failed lot, and Full Replace had already cleared the old data by then).

**Renderer conversions** — `nativeToEur(amount, currency)` (`actions.js`): today's ECB rate, `GBp` via the pound, `null` when there's no rate — never pass a foreign amount through as euros. `histCloseToEur(close, currency, eurUsdThen)` for the history charts (`app.js`, `charts2.js`, `returns.js`): USD at that day's EUR/USD, others at today's rate; these charts used to add pound and franc holdings in as euros, with a hardcoded 1.08 for missing USD points. **`dividendPerShare` is stored in EUR** (converted in `autoFetchPortfolioMetadata`, with `dividendPerShareNative` + `dividendCurrency` kept); it was Yahoo's native figure shown with a € sign. The company modal's position values use the holding's EUR price, and its price label uses `meta.currency` (it used `financialCurrency`, so NIO's dollar price was labelled CNY).

**Renderer FX** — `FX_RATES` in `actions.js` (display currency, cash, dividends) was a *second* hardcoded table frozen at USD 1.08. `syncFxRates()` now overwrites it in place from IPC `get-fx-rates` on startup and after every refresh; the literal values are seeds only. Mutate, never reassign — every consumer holds the same object reference.

**Price staleness** — holdings store `priceUpdatedAt`; `priceAgeBadge()` in `charts.js` marks anything over 24h old in the holdings table.

**Ticker autocomplete** — three local layers before any network call, so search works offline and a Yahoo rate-limit can't empty the dropdown:
1. `ownedTickerEntries()` (`utils.js`) — everything you hold, incl. non-US listings (`.DE`/`.LS`) the US directory lacks
2. `TICKER_DB` (~300 curated large caps, `state.js`) — audited 1.0.46: every bare symbol is in NASDAQ Trader's list with a matching name and ETF flag, every other symbol answers on Yahoo's chart endpoint. **A bare symbol is a US lookup first**, so a European listing without its suffix can price an unrelated US security (ROG was Rogers Corp, not Roche; BTC/ETH were Grayscale ETFs; LINK, XRP, EQQQ, IQQQ, IEAG, IBGL likewise). Non-US entries always carry the Yahoo suffix (`.AS`, `.DE`, `.L`, `.SW`…), crypto always `-USD`.
3. `SYMBOL_DIR` — **~12.7k US-listed symbols** from NASDAQ Trader's public `nasdaqlisted.txt` + `otherlisted.txt` (free, no key, no rate limit). Built by `buildSymbolDirectory()` in `main.js`, cached to `userData/marduk-symbols.json` for 7 days, loaded via IPC `get-symbol-directory`. Test issues filtered; ETF column → asset class; `_cleanSecurityName()` trims "- Common Stock"/ADR boilerplate.

Ranking is exact symbol → prefix → name substring, so typing `NIO` doesn't bury NIO. A `null` from `search-tickers` (rate-limited, vs `[]` for a real miss) renders a *"live search unavailable"* note.

**Polling cadence rationale** — Yahoo's chart endpoint is one request per ticker, so a refresh costs one request *per holding*. 5-minute polling meant ~2,400/day for 15 holdings, which is what got the IP rate-limited. Now 30 min open / 4 h quiet (~85% fewer); commercial trackers update EOD or a few times daily for the same reason. Opening the app always refreshes regardless of phase. The weekend re-check stays hourly — it makes no network call, only re-reads the phase.

**Gain semantics** — `gain` is **price-only** in both `portfolioStats()` (`charts.js`) and `totalPortfolioStats()` (`state.js`), matching the holdings table's *Total Gain* column; `totalRet`/`totalRetPct` add received dividends. They used to disagree (stat cards added dividends, the table didn't), so the column never summed to the headline. Dividends now appear beside the percentage (`· +€52.12 div`). The Returns sub-tab's *Total Return* column deliberately includes them — different label, different meaning.

**Holdings Performance chart** (`charts2.js`) uses a **diverging scale around a real zero axis** (`lo`/`hi`/`span`/`posOf`). Bar width came from `Math.abs(ret)` with every bar growing from the left edge, so a −22% loss reached past a +20% benchmark line and read as if it had beaten the market. Losses now extend left of zero, gains right; `.hperf-zero` marks the axis when any loss exists.

## Payslip Parser

**Hybrid strategy** (`main.js` → `parsePayslipHybrid`): if an Anthropic API key is configured, the PDF is parsed by Claude AI (`parsePayslipAI`); on any failure — or with no key — it falls back to the regex parser (`parsePdfAtPath`).

### AI parsing (`main.js` → `parsePayslipAI`)
- Uses `@anthropic-ai/sdk`, model `claude-opus-5`, base64 PDF document block + structured outputs (`output_config.format` with `PAYSLIP_SCHEMA`), `max_tokens: 4096`
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

## XTB Importer — removed in 1.0.44

Holdings come in through the Marduk CSV template only (see Holdings CSV Import). The XTB importer read broker sheets whose layout Marduk didn't control — its closed-positions sheet could be counted as open buys. Holdings imported by it before 1.0.44 keep `importedFromXtb: true` and bare tickers (`VWCE`); nothing reads the flag any more. `js/xtb.js` is now `js/portfolios.js` (CSV export + portfolio create/rename/delete). `xlsx` stays a dependency for bank statements.

---

## Investment Allocations

Reserve money for investing without counting it as an expense. Entity in `state.allocations`:
`{ id, portfolioId, amountAllocated, amountInvested, allocationDate, status: 'open'|'used', notes, createdAt, updatedAt }` (remaining is derived).

- **Create**: "Investment Allocation" card in Expenses tab (`addAllocation()` in `actions.js`). Reduces the month's Remaining budget in Expenses + Budget tabs (via `allocationTotalForMonth`), counts as savings in the savings rate.
- **Consume**: `consumeAllocations(portfolioId, amountEur)` — FIFO on open allocations, called from `addHolding()` (manual buys) and the holdings CSV import. Never goes negative; excess accumulates in `state.unallocatedInvestment[portfolioId]` ("Unallocated Investment").
- **Import guard**: only imported buys dated on/after `earliestOpenAllocationDate(portfolioId)` consume allocations — historical bulk imports don't.
- **UI**: allocation history table in Expenses; stat card row `#alloc-stats-row` (Allocated / Invested / Remaining / Unallocated) at top of Portfolio tab (`renderAllocationStats()` in `render.js`).

## Other AI features (all optional — need the AI key)

- **Expense auto-categorization**: `initAiCategorize()` in `actions.js` — on `#e-desc` change, tries local history match first (free), then IPC `ai-categorize` (Claude picks from CATS via structured-output enum).
**AI model choices** (`main.js`) — thinking and response text **share `max_tokens`**, and on Opus-tier models thinking is invisible but still consumes it. The monthly summary sat at `max_tokens: 2048` with adaptive thinking: a long think left nothing for the text, the call "succeeded" with an empty response, and the card silently stayed on "No summary yet". Budgets are now 4096, and every failure returns `{error}` instead of `null` so the card can say what went wrong.

| Call | Model | Why |
|---|---|---|
| Payslip parse | `claude-opus-5` | Vision + structured extraction, ~12×/year |
| Monthly summary | `claude-opus-5`, `effort: 'low'` | Prose over pre-aggregated stats, 12×/year |
| Expense categorise | `claude-haiku-4-5` | One enum pick from a fixed list; the most frequent call, ~5× cheaper, and the schema makes a malformed answer impossible |

Never send `temperature`/`top_p`/`top_k` or `thinking.budget_tokens` — all four are rejected with a 400 on current Opus/Sonnet models.

- **Monthly AI summary**: `generateMonthlySummary()` in `app.js` — once per month, sends aggregated stats (never raw transactions) via IPC `ai-monthly-summary`, caches text in `state.aiSummaries["YYYY-MM"]` (last 12 kept). Card `#ai-summary-card` on Overview with Regenerate button. Auto-runs 2.5s after unlock.

## Settings Menu & Theme

Header "Settings" dropdown (`#settings-menu` in `index.html`, logic in `js/app.js`): Export / Import / Backups / AI Settings, plus a Theme submenu and a footer showing the version. Icon is an inline SVG eight-pointed Babylonian star (two rotated squares). Closes on outside click and Escape.

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

## Loans (`actions.js`, Net Worth tab)

Credit liabilities: `{ isCredit, value (balance), originalValue, instalment, rate (% a year, TAN), linkedKeyword }`.

- **Only principal reduces debt.** `applyLoanPayment(exp)` — called from every place an expense is created (`addExpense`, `addOneRecurring`, `addAllRecurring`, `impCommit`) — finds the first credit liability whose keyword is in the description, splits the amount into interest (`balance × rate/12`) and principal, takes the principal off `value`, and stores `exp.loanPayment = { id, principal, interest }`. `revertLoanPayment(exp)` puts the principal back; `delExpense` and `impUndoBatch` call it. Until 1.0.47 the whole instalment came off (debt fell too fast, net worth read high), imports and recurring logs didn't touch the loan at all, and deleting the expense never restored it. Without a rate the full amount still counts; expenses from before 1.0.47 have no `loanPayment`, so deleting them doesn't restore anything (same as before).
- **Payoff** — `loanMonthsLeft(l)` is the annuity formula `−ln(1 − r·B/P) / ln(1 + r)`: `null` without an instalment, `Infinity` when the instalment doesn't cover the monthly interest, plain `B/P` without a rate (and the row says so). `loanPayoffDate(l)` turns it into a month. Verified against a month-by-month simulation: €150k at 3.5% paying €650 = 384 months (B/P alone said 231).
- Rate is editable per loan in the liabilities table (`updateLiabRate`).

## Dividend Calendar

`renderDividendCalendar()` in `render.js` — card `#div-calendar-card` in Portfolio tab. Lists holdings with `dividendPerShare > 0`, sorted by `nextPayDate` (soonest first, "in Nd" badge within 14 days), shows projected annual income (`dps × shares`). Hidden when no dividend payers.

## Tabs and State

Tabs: `overview`, `portfolio`, `expenses`, `budget`, `networth`, `goals`, `salary`

`showTab(name, el)` in `js/app.js` rebuilds charts for the active tab.

**Auto-refresh is market-hours aware** (`actions.js`): `marketPhase()` resolves `'open' | 'quiet' | 'weekend'` in **Europe/Lisbon** (explicit timezone, so it stays correct for users abroad; `hourCycle:'h23'` avoids the hour-24 midnight bug). Cadence — open (weekday 08:00–21:30, Euronext open → after NYSE close) `REFRESH_OPEN_MS` 30 min · quiet `REFRESH_QUIET_MS` 4 h · weekend paused, re-checking hourly so Monday resumes itself. `_resetAutoRefreshCountdown()` is a **self-rescheduling `setTimeout`**, not `setInterval`, because the delay changes with the phase; it re-arms immediately inside the callback so an early `return` in `refreshPrices()` can't break the chain. Never poll faster — that triggers Yahoo HTTP 429s which break the richer endpoints (company info, earnings, analyst data). One coarse window is intentional: per-exchange holiday calendars aren't worth the maintenance tail. `#live-dot`/`#live-countdown` show the phase (green + countdown / grey + hourly / `closed`).

**Company modal** (`openCompanyModal` in `render.js`): price chart has a range selector (1D/1W/1M/6M/YTD/1Y/5Y — `cmodSetRange`/`_cmodDrawPriceChart`, `_CMOD_RANGE_CFG`); Market Data boxes and the Earnings/Analyst panels render only when data exists (no "—" placeholders). Holdings logo fallback uses `nextElementSibling` (a `nextSibling` text-node bug once hid the colored-initial circles).

**Tooltips in stat cards** — `.stat-card` draws its gold top line as a background layer so a card holding an `.info-tip` can drop `overflow:hidden` (`.stat-card:has(.info-tip)`), which had clipped the tooltip to an empty sliver; stat-card tooltips open downward. **Visual conventions**: `font-variant-numeric: tabular-nums` is set on `body` (aligned number columns). No raw emojis in UI — every icon is an inline gold SVG (`stroke="currentColor"`, viewBox 24). Reusable `.info-tip` hover tooltip component for card-title explanations. Every nav button carries an inline SVG icon (stroke `currentColor`, Babylonian motifs: ziggurat, coin stack, tablet, scales, sun-dial circle, target, barley).

## Bank Statement Import (`js/bankimport.js`)

Expenses tab → **Import**. Spreadsheet in, categorised expenses out, **entirely local** — IPC `read-statement` returns the raw grid and every decision happens in the renderer. Nothing is uploaded; only the optional AI category guess would see a merchant string, never the account or balance. `.numbers` is *not* supported (Apple IWA protobuf) — needs the bank's own `.xlsx`/`.xls`/`.csv`.

- **CGD's real export** (verified against a live file): `Data mov.;Data-valor;Descrição;Montante;Saldo contabilístico após movimento` — **five** columns with **two** date columns, header on row 14 (0-indexed), UTF-8 BOM, `;` delimiter, `1.639,16` decimals. `Data mov.` wins because the leftmost date column is picked; the *Saldo* exclusion keeps the balance column from being read as the amount. `.numbers` is rejected with export instructions — opening a bank export in Numbers and saving is the likeliest wrong file to drop.
- **Header detection** — `impDetectLayout()` scans the first 30 rows for a header whose *following* row parses as date + number. CGD prefixes ~8 metadata rows ("Nome cliente", "Período"), so row 1 is not the header. Falls back to inferring from the first data-looking row.
- **Column mapping** — header-name hints (PT/EN/ES) then heuristics: most-dates = date, most-numeric (excluding date and *Saldo*) = amount, longest text = description. Handles a single signed `Montante` **or** split `Débito`/`Crédito`. User-correctable via `#imp-map-fields`; re-parses live.
- **Merchant normalisation** — `impMerchant()` strips transaction-type prefixes (`COMPRAS C.DEB`, `Trf`, `Pagamento`…), embedded dates and reference/card/masked digits. **`Mbway` is deliberately kept** — CGD writes `Trf Mbway 961XXX587`, and stripping both leaves nothing. Descriptions are bank-truncated (~22 chars), so `impGuessCategory()` matches on longest common prefix ≥5 chars.
- **Learning** — `state.merchantRules` (merchant → category) grows from every confirmed import; then your own expense history; then AI for genuinely new merchants. Visible and deletable in the Learned Categories card, because a rule learned wrong must not be invisible.
- **Duplicates — two checks, because one isn't enough.** `impFingerprint()` = `date|cents|merchant[:24]`, stored per expense as `importFp`, catches a re-uploaded or overlapping statement. But it can *never* match an expense typed by hand — you wrote "Grocery run", the bank says "COMPRAS C.DEB CONTINENTE 1234 LIS" — which is the likeliest case when back-filling months you already tracked. So `existingByDateAmount()` adds a looser `date|cents` index; matches are flagged *"possibly already logged as …"* and unticked. Both default to unticked: double-counting is worse than re-ticking a row, and the reason is always shown.
- **Themed dialogs** (`js/dialog.js`) — `mardukAlert()` / `mardukConfirm()` replace native `alert()`/`confirm()`, which rendered as a system-blue macOS box. `confirm()` returns a boolean synchronously and a modal cannot, so **`mardukConfirm()` returns a Promise and every call site must `await` it** — that is why those callers are `async`. Falls back to the native dialogs if `#dlg-modal` is absent.
- **Credits** default to `— Ignore —`; `— Extra Income —` writes to `state.extraIncomes` (same shape as `logExtra()`, plus `importBatch`) so it lands in the Budget tab's income and savings rate rather than becoming a negative expense; `— Investment —` writes an **allocation** rather than an expense, closing the loop with the Investment Allocations engine.
- **Undo** — every row carries `importBatch`; `state.importBatches` (last 20) lists imports and `impUndoBatch()` removes the whole batch. A bulk write into financial data needs a bulk undo.

## Holdings CSV Import (`js/holdimport.js`)

Portfolio → Holdings → **Import CSV** (also in the Actions menu). **Only the Marduk template is accepted** (the user's explicit requirement, 1.0.44): the first row must be exactly `Symbol,Trade Date,Purchase Price,Quantity,Status` (`HI_TEMPLATE`, case-insensitive, in that order; trailing empty cells ignored). `Status` is optional so the original four-column file still works (all rows Open). Anything else — Yahoo's export, broker sheets, renamed/reordered/extra columns, a header not on row 1 — is rejected with the expected header and a pointer to the template download. Parsed in the renderer with `FileReader`; the file never leaves the machine.

- **Status**: `Open` (or `Opened`) imports; `Closed` is listed as "Closed — not imported" (Marduk tracks current holdings; a sold lot counted as held is the mistake a closed-positions sheet invites); anything else is a row error.
- **Columns strict, formatting tolerant**: the template re-saved by a Portuguese Excel (`;` delimiter → decimals via `impNum`, `D/M/YYYY` dates read day-first and flagged when ambiguous) is the same template. Dates otherwise `YYYY-MM-DD`.
- **Currency**: Purchase Price is read in the symbol's *own* trading currency. Resolved per row: manual override → "Prices are in" selector → the existing holding's `priceCurrency` (what Yahoo actually quotes it in) → exchange suffix (`HI_SUFFIX_CCY`; no suffix = USD, `.L` = GBp, flagged "check GBp vs USD" because some London lines quote in USD). `GBp` converts via GBP ÷ 100.
- **FX**: IPC `fetch-fx-history` makes **one ECB data-API request** for every currency and the whole date range (`D.USD+GBP….EUR.SP00.A`, CSV, **CRLF line endings**). Weekend/holiday trades walk back to the last published rate. No rate → the row can't be imported; never a guess. No Yahoo calls per row — prices arrive with the refresh that runs after an import creates new holdings.
- **Landing**: `hiTarget()` merges a bare/suffixed pair (`VWCE` ↔ `VWCE.DE`) into the existing holding — the old XTB import stored bare codes, Yahoo symbols are suffixed. Every lot goes through **`applyBuy()`** in `actions.js`, the same function Add Holding uses, so both record buys identically. Allocations are consumed with the XTB rule (only lots on/after the earliest open allocation).
- **Duplicates**: same ticker + date + shares and same price (native or EUR) = "Already added"; same ticker + date + shares at a different price = "Possible duplicate" (likely the same buy typed in another currency). Both start unticked.
- **Undo** — `state.lastHoldingImport` holds one pre-import snapshot (holdings, transactions, and allocations only if the import consumed any) plus a fingerprint of positions after it. Undo is offered only while the fingerprint still matches; price refreshes don't change it (they never touch shares or cost), any manual buy/sell/delete does. Restoring keeps live prices.

The **Add Holding form is folded** into `#add-holding-panel` behind `+ Add holding` on the holdings card's header line; `openAddHolding()` / `toggleAddHolding()`. `quickSell()` opens it first.

## Risk View (`js/risk.js`)

Portfolio dropdown → **Risk** (`psub-portfolio-risk`, `SUB_BUILDERS.portfolio.risk = buildRiskView`; also re-run from `renderPortfolio()`, a no-op unless visible). Active portfolio only.

- **Backtest of today's holdings** (current share counts) over 1Y daily (`perYear` 252) or 3Y weekly (52), valued in euros via `histCloseToEur` — describes the portfolio as it stands, independent of when things were bought. `computeRisk()` returns volatility (stdev of returns × √perYear), max drawdown with dates (`riskMaxDrawdown`), worst day/week, period return, and vs the benchmark (the one picked on the Overview chart, S&P 500 if none): beta, correlation, benchmark vol/return.
- **Per holding**: weight, volatility, beta, and **share of portfolio risk** = wᵢ·cov(rᵢ, rₚ)/var(rₚ), normalised to 100%. Bars turn red when a holding's risk share exceeds 1.25× its weight.
- **Alignment** (`riskAlign`): one date grid, values carried forward over other markets' holidays. The grid comes from exchange-traded holdings only — crypto trades daily and would add weekend points where every stock shows a fake 0%. A holding whose history starts after the first 10% of the window (recent listing) is excluded and named in the footnote rather than shortening the window.
- **No prices needed**: `riskConcentration` (largest position, top 5, effective holdings = 1/Σw², largest sector) and `riskCurrencyExposure` (by *trading* currency — a US stock bought with euros is still dollar exposure — plus cash; GBp folded into GBP).
- **Deliberately absent**: Sharpe (needs a risk-free assumption and years of history) and VaR (false precision). Notes state facts, never advice.
- History is cached 15 min in the renderer (`_riskCache`) on top of the main-process cache, because the view re-renders on every price refresh and save.

## Stock Splits (`js/splits.js`)

Lots are stored as entered, so a holding bought before a split kept its old share count and price while Yahoo's quote moved to the new terms (a 10-for-1 split read as −90%, and dividends were credited on a tenth of the shares). `checkStockSplits(manual)` runs 12s after unlock at most once a day (`localStorage['marduk_split_check']`) and from Actions → Check for stock splits.

- IPC `fetch-splits` returns, per ticker, Yahoo's split events since the first lot and the **split-adjusted close on each lot date**.
- `_splitFactorFor()` compares each lot's recorded price (native, or converted from EUR at today's rate) with that close × the ratios of the last *k* later splits, for every *k*. Best match within ±28% (`|ln| ≤ 0.25`) wins: factor 1 = already in post-split terms (broker exports usually are), >1 = needs adjusting, no match = left alone. Comparing prices makes it **idempotent** — an adjusted lot matches the adjusted close and is never offered again.
- Nothing changes until the user confirms per holding (`mardukConfirm`, shows old → new shares and per-share cost; total cost unchanged). Lots get `shares × f`, `price ÷ f`, `priceOriginal ÷ f` and a "split-adjusted ×f" note; the holding's average cost keeps the position's total cost. A holding with no lots is treated as one lot on its `buyDate`. Pre-split `dividendLog` entries are dropped and `syncDividendLog(true)` re-credits them on the corrected share count.
- Declining stores `state.splitDismissed["<portfolioId>|<ticker>|<lastSplitDate>"]`; the daily run skips it, the manual run asks again.

## Data Safety

- **Unreadable data file** — `load()` sets `_loadFailed` when the file exists but won't parse (Drive mid-sync); `save()` then writes nothing and a dialog explains. It used to carry on with an empty state, and the next save overwrote the real data. Restoring a backup or importing a file clears the flag.
- **Failed saves** surface a toast (throttled to one a minute); `saveData` was fire-and-forget.
- **Payslips** are stored without `_rawText` (the full extracted text — name, tax number, address) or `_filePath`; both used to sync to Google Drive and nothing read them. `initApp()` strips them from existing data.
- **Outside text in innerHTML** goes through `esc()` (`utils.js`): Yahoo names/descriptions, bank-statement lines (also stripped of `<>` at import), file names. Tickers are validated to symbol characters at every entry point (Add Holding, CSV import, XTB import).
- **Dates** — use `localIso()` for "today" / local dates, never `toISOString().slice(0,10)` on a local date: that converts to UTC and gave yesterday's date between midnight and 1am in a Portuguese summer (and XTB dates a day early). `toISOString()` is fine only for dates built in UTC.
- **Dialogs are queued** (`dialog.js`) — a second `mardukConfirm`/`mardukAlert` waits for the first instead of orphaning its promise.

## Layout width

`main` runs to 1640px (was 1200px) with 32px side padding matching the header, and only centres beyond that. `.chart-wrap` grows to 250px tall above 1500px wide so line charts don't flatten.

### Portfolio sub-views (Snowball-style)

**Sub-views are generic across tabs** (`js/charts.js`): `showSubView(tab, name, btn)`, `navToSub(tab, name)`, state in `subTab`, builders in `SUB_BUILDERS[tab][name]`. Element ids are namespaced **`psub-<tab>-<name>`** and every query is scoped to `#tab-<tab>` — Portfolio and Expenses both have an "Overview", so an unscoped `#psub-overview` lookup would hit the wrong element.

**There is no in-page sub-tab bar** (removed in 1.0.41 — the app felt heavy and the nav dropdowns duplicated it). Navigation is the hover dropdown on each nav button only. "Where am I" is carried by two things `showSubView()` keeps in sync: the dropdown item tagged `data-sub="<tab>:<name>"` gets `.active` (scoped to that tab's prefix so the other tab keeps its mark), and `#crumb-<tab>` in the section subtitle shows the section name. Overview is marked active in the markup because nothing calls `showSubView` on load. `showPortfolioSub`/`navToPortfolioSub` remain as thin wrappers.

**Expenses** has 4: `overview` (stats, salary day, recurring banner, charts) · `logs` (add form, search, filters, table) · `import` (see Bank Statement Import) · `allocations`. The month selector stays global above the sub-views. All three non-import views call `renderExpenses()` — it is one pass that fills stats, charts, list and allocation history together, and carving up a working 170-line function was not worth the risk.

The Portfolio tab is split into 6 sub-views — only one visible at a time (`.psub` / `.psub.active`):

| Sub-view | Contents |
|---|---|
| `psub-overview` | stat cards, allocation cards, donut + P&L charts, value history + benchmark, monthly returns, holdings performance, sector allocation |
| `psub-holdings` | Add Holding form + holdings table (General/Dividends/Returns sub-tabs) |
| `psub-dividends` | Dividend Analysis + Dividend Calendar (`refreshDividendsSection()` force-fetches metadata; `#psub-div-empty` empty state) |
| `psub-risk` | Risk view — see Risk View (`js/risk.js`) |
| `psub-cash` | Uninvested Cash card |
| `psub-transactions` | Transaction History |

- Hovering the **Portfolio nav button** shows a dropdown (`.nav-drop`, CSS `:hover`) linking to each sub-view via `navToPortfolioSub(name)`. The open rule is `:hover, :has(:focus-visible)` — never `:focus-within`, which leaves the menu pinned open after a mouse click because the clicked button keeps focus.
- The portfolio switcher bar stays global above the sub-views — switching portfolio keeps the current sub-view.
- Data actions (Refresh prices `#refresh-btn`, Import CSV, Export CSV, Check for stock splits) live in an **Actions dropdown** (`#actions-menu`, reuses `.settings-menu` classes) in the portfolio bar.
- **Per-portfolio options sit beside its name** (Yahoo-style ⋯ button, `#port-menu`, `togglePortMenu`/`closePortMenu` in `app.js`): Rename, **Show values in** (display currency — replaced the separate currency `<select>`; the active one is ticked by `renderPortfolioTabs()`), New portfolio, Delete `#del-port-btn` (hidden with one portfolio). The portfolio `.sec-header` carries `position:relative; z-index:30` because `.tab.active > *` animates (`fadeUp`), which makes every direct child of a tab its own stacking layer in DOM order — without it the menu opened under the cards below. `refreshPrices()` still updates `#refresh-btn`'s label even though it is now a menu item.
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
- `lastHoldingImport` — one-step undo snapshot for the holdings CSV import (see Holdings CSV Import)
- `splitDismissed` — `{ "<portfolioId>|<ticker>|<splitDate>": true }` split adjustments the user declined

---

## Known Constraints

- **PDF.js CDN** — loaded from cdnjs in `index.html`. Requires internet on first load. No offline fallback.
- **Payslip parsing requires Python + pdfplumber** — must be installed on the user's machine. The parser tries 10 Python binary locations but cannot install Python itself.
- **macOS auto-update installs to `/Applications/MARDUK.app`** — hardcoded path. Will fail if the app is run from another location.
- **Spotlight duplicates** — `dist/mac` and `dist/mac-arm64` folders left by electron-builder get indexed. Cleaned up by the release script and `.metadata_never_index` file.
- **`contextIsolation: true`** — renderer code cannot use Node APIs directly. Everything goes through `window.electronAPI`.
