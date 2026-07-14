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

## Backups

`rotateBackup()` in `main.js` — before the first save of each day, copies the previous `marduk-data.json` to `userData/backups/marduk-data-YYYY-MM-DD.json` (last 10 kept, local disk only). IPC: `list-backups`, `read-backup` (name-pattern validated). UI: "⛃ Backups" header button → `#backups-modal` → `restoreBackup()` in `actions.js` (replaces state, follows the `importData()` pattern).

## Dividend Calendar

`renderDividendCalendar()` in `render.js` — card `#div-calendar-card` in Portfolio tab. Lists holdings with `dividendPerShare > 0`, sorted by `nextPayDate` (soonest first, "in Nd" badge within 14 days), shows projected annual income (`dps × shares`). Hidden when no dividend payers.

## Tabs and State

Tabs: `overview`, `portfolio`, `expenses`, `budget`, `networth`, `goals`, `salary`

`showTab(name, el)` in `js/app.js` rebuilds charts for the active tab.

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
