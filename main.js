const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── macOS quarantine self-heal ────────────────────────────────────────────────
// Clears the quarantine flag on every launch so macOS never shows
// the "damaged" error — whether from a manual download or an auto-update.
if (process.platform === 'darwin') {
  try {
    const { spawnSync } = require('child_process');
    const appBundle = process.execPath.split('/Contents/')[0];
    spawnSync('xattr', ['-cr', appBundle], { timeout: 3000 });
  } catch(e) {} // non-fatal, never blocks launch
}

// ── Auto-updater ───────────────────────────────────────────────────────────────
// Windows & Linux: use electron-updater (fully automatic)
// macOS: custom downloader (electron-updater gets stuck on unsigned Mac apps)

const GITHUB_OWNER = 'M4rt1n3z18';
const GITHUB_REPO  = 'Marduk-finance';

// ── macOS custom updater ──────────────────────────────────────────────────────
async function checkForUpdatesMac() {
  try {
    const https = require('https');

    // 1. Ask GitHub for the latest release
    const release = await new Promise((resolve, reject) => {
      https.get({
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        headers: { 'User-Agent': 'MARDUK-App' }
      }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
        res.on('error', reject);
      }).on('error', reject);
    });

    const latest = (release.tag_name || '').replace('v', '');
    if (!latest) return;

    // 2. Compare versions
    const newer = (a, b) => {
      const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) { if (pa[i] > pb[i]) return true; if (pa[i] < pb[i]) return false; }
      return false;
    };
    if (!newer(latest, app.getVersion())) return; // already up to date

    // 3. Find correct DMG asset for this machine's architecture
    const isArm = process.arch === 'arm64';
    const asset = release.assets?.find(a =>
      a.name.endsWith('.dmg') && (isArm ? a.name.includes('arm64') : !a.name.includes('arm64'))
    );
    if (!asset) return;

    if (win) win.webContents.send('update-available', latest);

    // 4. Download the DMG with real progress tracking
    const dmgPath = path.join(os.tmpdir(), `MARDUK-${latest}.dmg`);

    await new Promise((resolve, reject) => {
      const download = (url, hops = 0) => {
        if (hops > 5) return reject(new Error('Too many redirects'));
        const mod = url.startsWith('https') ? require('https') : require('http');
        mod.get(url, { headers: { 'User-Agent': 'MARDUK-App' } }, res => {
          if (res.statusCode === 301 || res.statusCode === 302) { download(res.headers.location, hops + 1); return; }
          const total = parseInt(res.headers['content-length'] || '0');
          let done = 0;
          const file = fs.createWriteStream(dmgPath);
          res.on('data', chunk => {
            done += chunk.length; file.write(chunk);
            if (total > 0 && win) win.webContents.send('update-progress', Math.floor(done / total * 100));
          });
          res.on('end',   () => { file.end(); resolve(); });
          res.on('error', reject);
        }).on('error', reject);
      };
      download(asset.browser_download_url);
    });

    global._pendingDmg = dmgPath;
    if (win) win.webContents.send('update-downloaded');

  } catch(e) {
    console.log('macOS update check (non-fatal):', e.message);
  }
}

// ── Windows / Linux: electron-updater ────────────────────────────────────────
if (process.platform !== 'darwin') {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available',  (i) => { if (win) win.webContents.send('update-available', i.version); });
  autoUpdater.on('download-progress', (p) => { if (win) win.webContents.send('update-progress', Math.floor(p.percent)); });
  autoUpdater.on('update-downloaded',  () => { if (win) win.webContents.send('update-downloaded'); });
  autoUpdater.on('error', (e) => console.log('Updater error (non-fatal):', e.message));
}

ipcMain.handle('install-update', async () => {
  if (process.platform === 'darwin' && global._pendingDmg) {
    // macOS: mount DMG → copy app → clear quarantine → relaunch
    const { spawnSync } = require('child_process');
    try {
      const mountOut = spawnSync('hdiutil', ['attach', global._pendingDmg, '-nobrowse'], { encoding: 'utf8' });
      const mountPoint = mountOut.stdout.trim().split('\n').pop().split('\t').pop().trim();
      spawnSync('cp',    ['-Rf', `${mountPoint}/MARDUK.app`, '/Applications/'], { timeout: 30000 });
      spawnSync('xattr', ['-cr', '/Applications/MARDUK.app'],                  { timeout:  5000 });
      spawnSync('hdiutil', ['detach', mountPoint, '-quiet'],                    { timeout: 10000 });
      app.relaunch(); app.exit(0);
    } catch(e) { console.error('macOS install failed:', e); }
  } else {
    autoUpdater.quitAndInstall();
  }
});

ipcMain.handle('get-version', () => app.getVersion());

// ── Find Google Drive folder ──────────────────────────────────────────────────
function findGoogleDriveFolder() {
  const home = os.homedir();
  const candidates = [];

  if (process.platform === 'darwin') {
    // macOS — Google Drive for Desktop (current)
    const cloudStorage = path.join(home, 'Library', 'CloudStorage');
    if (fs.existsSync(cloudStorage)) {
      try {
        const entries = fs.readdirSync(cloudStorage);
        for (const entry of entries) {
          if (entry.startsWith('GoogleDrive-')) {
            candidates.push(path.join(cloudStorage, entry, 'My Drive'));
            candidates.push(path.join(cloudStorage, entry));
          }
        }
      } catch (e) {}
    }
    // macOS — older Google Drive / Backup & Sync locations
    candidates.push(path.join(home, 'Google Drive'));
    candidates.push(path.join(home, 'Google Drive', 'My Drive'));
    candidates.push(path.join(home, 'My Drive'));
  } else if (process.platform === 'win32') {
    // Windows — Google Drive for Desktop (newer versions)
    candidates.push(path.join(home, 'My Drive'));
    candidates.push(path.join(home, 'Google Drive'));
    candidates.push(path.join(home, 'GoogleDrive'));
    candidates.push('C:\\Users\\' + os.userInfo().username + '\\Google Drive');
    for (let code = 71; code <= 90; code++) { // G: to Z:
      candidates.push(String.fromCharCode(code) + ':\\My Drive');
    }
  } else {
    // Linux
    candidates.push(path.join(home, 'GoogleDrive'));
    candidates.push(path.join(home, 'Google Drive'));
    candidates.push(path.join(home, 'My Drive'));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback: use app data folder
  return app.getPath('userData');
}

const GDRIVE_FOLDER = findGoogleDriveFolder();
const DATA_FILE = path.join(GDRIVE_FOLDER, 'marduk-data.json');
const PW_FILE   = path.join(app.getPath('userData'), 'marduk-pw.bin'); // password stays local

// ── Window ────────────────────────────────────────────────────────────────────
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'MARDUK — Wealth of Babylon',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0d0d0f',
    show: false, // show after ready-to-show for smooth launch
  });

  win.loadFile('index.html');

  // Block Electron from navigating away when the user drops a file onto the window
  win.webContents.on('will-navigate', (event, url) => {
    const appUrl = `file://${__dirname}/index.html`;
    if (url !== appUrl) event.preventDefault();
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // Remove menu bar
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  // Check for updates a few seconds after launch (gives the window time to load)
  setTimeout(() => {
    if (process.platform === 'darwin') checkForUpdatesMac();
    else autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// Data (saved to Google Drive)
ipcMain.handle('load-data', () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return fs.readFileSync(DATA_FILE, 'utf8');
    }
  } catch (e) {
    console.error('Load error:', e);
  }
  return null;
});

ipcMain.handle('save-data', (event, json) => {
  try {
    // Ensure folder exists
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, json, 'utf8');
    return true;
  } catch (e) {
    console.error('Save error:', e);
    return false;
  }
});

// Password (saved locally, never synced)
ipcMain.handle('get-pw', () => {
  try {
    if (fs.existsSync(PW_FILE)) return fs.readFileSync(PW_FILE, 'utf8');
  } catch (e) {}
  return null;
});

ipcMain.handle('set-pw', (event, val) => {
  try {
    fs.writeFileSync(PW_FILE, val, 'utf8');
    return true;
  } catch (e) { return false; }
});

ipcMain.handle('clear-pw', () => {
  try {
    if (fs.existsSync(PW_FILE)) fs.unlinkSync(PW_FILE);
    return true;
  } catch (e) { return false; }
});

// Data file location (so user knows where it is)
ipcMain.handle('get-data-path', () => DATA_FILE);

// ── Yahoo Finance shared infrastructure ───────────────────────────────────────
// Yahoo's v10/quoteSummary endpoint now requires a crumb token obtained via their
// consent flow. We fetch it once, cache it for 1 hour, and auto-refresh on 401.
const YAHOO_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
let _yahooMeta = { crumb: null, cookies: null, fetchedAt: 0 };

async function ensureYahooCrumb(force = false) {
  const HOUR = 3_600_000;
  if (!force && _yahooMeta.crumb && Date.now() - _yahooMeta.fetchedAt < HOUR) return;
  try {
    // Step 1: visit Yahoo Finance homepage to receive session cookies.
    // Include Accept-Language: en-US to avoid being served a GDPR consent page
    // (which wouldn't set the needed session cookie).
    const r1 = await fetch('https://finance.yahoo.com/', {
      headers: {
        'User-Agent':      YAHOO_UA,
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    let cookieStr = '';
    if (typeof r1.headers.getSetCookie === 'function') {
      // Node 18+ / undici: returns an array of Set-Cookie values
      cookieStr = r1.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    } else {
      const raw = r1.headers.get('set-cookie') || '';
      cookieStr = raw.split(/,(?=\s*\w+=)/).map(c => c.trim().split(';')[0]).join('; ');
    }
    // Step 2: exchange cookies for a crumb token
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent':      YAHOO_UA,
        'Accept':          'text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie':          cookieStr,
      },
    });
    const crumb = (await r2.text()).trim();
    // Crumbs are typically 8-20 chars; reject HTML/JSON error responses
    if (crumb && crumb.length > 2 && crumb.length < 100 && !/[<{]/.test(crumb)) {
      _yahooMeta = { crumb, cookies: cookieStr, fetchedAt: Date.now() };
      console.log('[Yahoo] Crumb refreshed OK:', crumb.slice(0, 6) + '…');
    } else {
      console.warn('[Yahoo] Crumb response invalid (len=' + crumb.length + '):', crumb.slice(0, 40));
    }
  } catch (e) {
    console.error('[Yahoo] Crumb fetch error:', e.message);
  }
}

// Fetches a Yahoo Finance quoteSummary result, with crumb + automatic retry.
// modules can be a comma-separated string: 'assetProfile,summaryDetail,...'
// Returns the combined result object (all modules merged), or null on failure.
async function yahooQuoteSummary(ticker, modules) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await ensureYahooCrumb(attempt > 0); // force crumb refresh on 2nd attempt
      const crumbParam = _yahooMeta.crumb ? `&crumb=${encodeURIComponent(_yahooMeta.crumb)}` : '';
      const cookieHdr  = _yahooMeta.cookies ? { Cookie: _yahooMeta.cookies } : {};
      const host = attempt === 0 ? 'query1' : 'query2'; // alternate hosts
      const url  = `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}${crumbParam}`;
      const res  = await fetch(url, {
        headers: { 'User-Agent': YAHOO_UA, 'Referer': 'https://finance.yahoo.com/', 'Accept-Language': 'en-US,en;q=0.9', ...cookieHdr },
      });
      if (!res.ok) { console.warn(`[Yahoo] quoteSummary HTTP ${res.status} for ${ticker}`); continue; }
      const json = await res.json();
      const r    = json?.quoteSummary?.result?.[0];
      if (r) return r;
      // Log the error so we can diagnose future failures
      const errCode = json?.quoteSummary?.error?.code        ?? '';
      const errDesc = json?.quoteSummary?.error?.description ?? '';
      console.warn(`[Yahoo] quoteSummary ${ticker} (${modules}) → ${errCode}: ${errDesc}`);
      if (/Unauthorized|Too Many Requests/i.test(errCode)) {
        _yahooMeta.crumb = null; // force crumb refresh on next attempt
        continue;
      }
    } catch (e) {
      console.error(`[Yahoo] quoteSummary attempt ${attempt + 1} for ${ticker}:`, e.message);
    }
  }
  return null;
}

// ── Ticker resolution + auth-free Yahoo helpers ──────────────────────────────
// Non-US tickers need an exchange suffix on Yahoo Finance (e.g. EDP → EDP.LS,
// SXR8 → SXR8.DE). fetchV8Chart() tries the bare ticker then common EU suffixes,
// caching the successful form so all subsequent calls use it automatically.
const EU_EXCHANGE_SUFFIXES = ['.DE','.LS','.PA','.AS','.MI','.MC','.L','.SW','.ST','.CO','.OL','.HE','.BR','.VI','.PR','.WAR'];
const _tickerResolutionCache = new Map(); // bare ticker → resolved Yahoo symbol

function getResolvedTicker(ticker) {
  return _tickerResolutionCache.get(ticker) || ticker;
}

// Fetch v8/chart data, trying exchange suffixes when bare ticker has no price.
// Returns { result, resolvedTicker }. Side-effect: populates _tickerResolutionCache.
async function fetchV8Chart(ticker, params = 'interval=1d&range=1y') {
  const known = _tickerResolutionCache.get(ticker);
  const candidates = known ? [known]
    : ticker.includes('.') ? [ticker]
    : [ticker, ...EU_EXCHANGE_SUFFIXES.map(s => ticker + s)];
  for (const sym of candidates) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${params}`;
      const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA } });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (result?.meta?.regularMarketPrice) {
        if (sym !== ticker) _tickerResolutionCache.set(ticker, sym);
        return { result, resolvedTicker: sym };
      }
    } catch(e) {}
  }
  return { result: null, resolvedTicker: ticker };
}

// Auth-free Yahoo Finance v7/quote — returns market data + dividends without
// needing a crumb. Also tries exchange suffixes and caches the resolved form.
// NOTE: no &fields= parameter — it is non-standard for v7 and causes errors on
// some Yahoo endpoints, especially for non-US symbols.
async function yahooV7Quote(ticker) {
  const known = _tickerResolutionCache.get(ticker);
  const candidates = known ? [known]
    : ticker.includes('.') ? [ticker]
    : [ticker, ...EU_EXCHANGE_SUFFIXES.map(s => ticker + s)];
  // Try both query1 and query2 hosts to maximise success rate
  const hosts = ['query1', 'query2'];
  for (const sym of candidates) {
    for (const host of hosts) {
      try {
        const url = `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': YAHOO_UA, 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'application/json' },
        });
        if (!res.ok) continue;
        const json = await res.json();
        const q = json?.quoteResponse?.result?.[0];
        if (q?.regularMarketPrice) {
          if (sym !== ticker) _tickerResolutionCache.set(ticker, sym);
          return q;
        }
      } catch(e) {}
    }
  }
  return null;
}

// Fetch dividend payment history from v8/chart events (public, no auth needed).
// Returns { dps, dividendYield, exDivDate } computed from payments in the last
// 12 months. Works for any ticker Yahoo tracks — no crumb/cookie required.
async function fetchDividendEvents(ticker) {
  const sym = getResolvedTicker(ticker);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?events=dividends&interval=3mo&range=3y`;
    const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA } });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const divObj = result.events?.dividends;
    if (!divObj || !Object.keys(divObj).length) return null;

    const ts2date = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null;
    const now        = Date.now() / 1000;
    const oneYearAgo = now - 365 * 24 * 3600;
    const allDivs    = Object.values(divObj).sort((a, b) => a.date - b.date);

    // Sum dividends paid in the last 12 months → annual DPS
    const recentDivs = allDivs.filter(d => d.date >= oneYearAgo && d.date <= now);
    const dps        = recentDivs.reduce((s, d) => s + d.amount, 0);

    // Last paid dividend → that date is the most recent ex-div date
    const lastPaid   = allDivs.filter(d => d.date <= now).at(-1);
    const exDivDate  = ts2date(lastPaid?.date);

    const price      = result.meta?.regularMarketPrice;
    const dividendYield = (dps > 0 && price > 0) ? dps / price : null;

    return dps > 0 ? { dps, dividendYield, exDivDate } : null;
  } catch(e) { return null; }
}

// ── Sector data via Yahoo Finance quoteSummary ───────────────────────────────
ipcMain.handle('fetch-sectors', async (event, tickers) => {
  const entries = await Promise.all(tickers.map(async ticker => {
    try {
      const r       = await yahooQuoteSummary(ticker, 'assetProfile');
      const profile = r?.assetProfile;
      const sector  = profile?.sector  || null;
      const website = profile?.website || null;
      // Build Clearbit logo URL from company website domain
      let logoUrl = null;
      if (website) {
        try {
          const domain = new URL(website).hostname.replace(/^www\./, '');
          logoUrl = `https://logo.clearbit.com/${domain}`;
        } catch (e) {}
      }
      return [ticker, { sector, logoUrl }];
    } catch (e) {}
    return [ticker, { sector: null, logoUrl: null }];
  }));
  const result = {};
  for (const [t, obj] of entries) {
    if (obj.sector || obj.logoUrl) result[t] = obj;
  }
  return result;
});

// ── Ticker search via Yahoo Finance autocomplete API ─────────────────────────
ipcMain.handle('search-tickers', async (event, query) => {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&listsCount=0`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = await res.json();
    const quotes = data?.quotes || [];
    return quotes
      .filter(q => q.symbol && q.quoteType)
      .map(q => ({
        t: q.symbol,
        n: q.longname || q.shortname || q.symbol,
        c: q.quoteType === 'ETF' ? 'ETF/Fund'
           : q.quoteType === 'CRYPTOCURRENCY' ? 'Crypto'
           : q.quoteType === 'MUTUALFUND' ? 'ETF/Fund'
           : 'Stock'
      }));
  } catch (e) {
    return [];
  }
});

// ── Historical FX rate for a specific date ────────────────────────────────────
// Returns how many units of `fromCurrency` = 1 EUR  (e.g. fromCurrency=USD → 1.09)
ipcMain.handle('fetch-fx-rate', async (event, { date, fromCurrency }) => {
  if (!fromCurrency || fromCurrency === 'EUR') return 1;
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  try {
    const ticker  = `EUR${fromCurrency}=X`;
    const d       = new Date(date + 'T12:00:00Z');
    const period1 = Math.floor(d.getTime() / 1000) - 86400 * 4;
    const period2 = Math.floor(d.getTime() / 1000) + 86400 * 4;
    const url     = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${period1}&period2=${period2}`;
    const res     = await fetch(url, { headers: { 'User-Agent': UA } });
    const data    = await res.json();
    const result  = data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp;
    const closes     = result.indicators?.quote?.[0]?.close;
    const targetTs   = Math.floor(d.getTime() / 1000);
    let bestIdx = 0, bestDiff = Infinity;
    timestamps.forEach((ts, i) => {
      const diff = Math.abs(ts - targetTs);
      if (diff < bestDiff && closes[i] != null) { bestDiff = diff; bestIdx = i; }
    });
    return closes[bestIdx] ?? null;
  } catch(e) {
    console.error('fetch-fx-rate error:', e);
    return null;
  }
});

// ── Dividend + earnings data ───────────────────────────────────────────────────
// Primary source: v7/quote (no auth, handles EU tickers via suffix resolution).
// Supplement: quoteSummary for calendarEvents (earnings dates, ex-div).
ipcMain.handle('fetch-dividends', async (event, tickers) => {
  const ts2date = ts => (ts && ts > 0) ? new Date(ts * 1000).toISOString().slice(0, 10) : null;
  const rv = (obj, key) => { const v = obj?.[key]; if (v == null) return null; return (typeof v === 'object' && 'raw' in v) ? v.raw : v; };

  const entries = await Promise.allSettled(
    tickers.map(async ticker => {
      try {
        // Run v7/quote (auth-free) and quoteSummary in parallel
        const [v7, qsResult] = await Promise.allSettled([
          yahooV7Quote(ticker),
          yahooQuoteSummary(getResolvedTicker(ticker), 'summaryDetail,calendarEvents'),
        ]);
        const v7Data = v7.status === 'fulfilled' ? v7.value : null;
        const r      = qsResult.status === 'fulfilled' ? qsResult.value : null;
        const sd  = r?.summaryDetail  || {};
        const cal = r?.calendarEvents || {};

        // v7/quote is primary for dividend rate + yield; quoteSummary as fallback
        let dps           = v7Data?.dividendRate ?? v7Data?.trailingAnnualDividendRate
                              ?? rv(sd, 'dividendRate') ?? rv(sd, 'trailingAnnualDividendRate') ?? 0;
        let forwardYield  = v7Data?.dividendYield ?? rv(sd, 'dividendYield') ?? null;
        let trailingYield = v7Data?.trailingAnnualDividendYield ?? rv(sd, 'dividendYield') ?? null;
        let exDivDate     = ts2date(v7Data?.exDividendDate ?? rv(cal, 'exDividendDate') ?? rv(sd, 'exDividendDate'));
        const nextPayDate = ts2date(rv(cal, 'dividendDate'));
        const nextEarningsDate = ts2date(
          cal.earnings?.earningsDate?.[0]?.raw ?? cal.earnings?.earningsDate?.[0]
          ?? v7Data?.earningsTimestamp
        );
        const earningsDateEnd = ts2date(cal.earnings?.earningsDate?.[1]?.raw ?? cal.earnings?.earningsDate?.[1]);

        // If v7 + quoteSummary both returned nothing for dividends, use chart events
        // (works without auth, sums actual payouts from the last 12 months)
        if (!dps) {
          const evts = await fetchDividendEvents(ticker);
          if (evts) {
            dps          = evts.dps;
            forwardYield = forwardYield ?? evts.dividendYield;
            trailingYield= trailingYield ?? evts.dividendYield;
            exDivDate    = exDivDate ?? evts.exDivDate;
          }
        }

        if (!v7Data && !r && !dps) return [ticker, null]; // nothing came back at all

        return [ticker, { dps, forwardYield, trailingYield, exDivDate, nextPayDate, nextEarningsDate, earningsDateEnd }];
      } catch(e) {
        console.error('[fetch-dividends] Error for', ticker, ':', e.message);
        return [ticker, null];
      }
    })
  );

  const results = {};
  for (const r of entries) {
    if (r.status === 'fulfilled' && r.value?.[1]) {
      const [ticker, data] = r.value;
      results[ticker] = data;
    }
  }
  return results;
});

// ── Rich company info for the detail modal ────────────────────────────────────
// Three sources, each progressively needing more auth:
//   A. v8/chart  (public)      — price, 1-year history, exchange, 52-wk hi/lo
//   B. v7/quote  (public)      — market cap, P/E, beta, dividends, moving avgs
//   C. quoteSummary (crumb)    — analyst consensus, company description, earnings
// A+B work without any auth, so EU users behind the GDPR consent wall still get
// most of the data. C is attempted opportunistically and fills in the rest.
const _companyCache = new Map(); // ticker → { data, ts }
const COMPANY_TTL   = 60 * 60 * 1000; // 1 hour

ipcMain.handle('fetch-company-info', async (event, ticker) => {
  const cached = _companyCache.get(ticker);
  if (cached && Date.now() - cached.ts < COMPANY_TTL) return cached.data;

  try {
    const ts2date = ts => (ts && ts > 0) ? new Date(ts * 1000).toISOString().slice(0, 10) : null;
    const rv = (obj, key) => {
      const v = obj?.[key];
      if (v == null) return null;
      return (typeof v === 'object' && 'raw' in v) ? v.raw : v;
    };
    const fmtCap = n => {
      if (!n) return null;
      if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
      if (n >= 1e9)  return (n / 1e9 ).toFixed(2) + 'B';
      if (n >= 1e6)  return (n / 1e6 ).toFixed(2) + 'M';
      return n.toLocaleString();
    };

    // ── Source A: v8/chart — resolves exchange suffix (SXR8→SXR8.DE, EDP→EDP.LS)
    const { result: chart, resolvedTicker } = await fetchV8Chart(ticker);

    // ── Sources B + C in parallel using the now-known resolved ticker ─────────
    const [v7Settled, summarySettled] = await Promise.allSettled([
      yahooV7Quote(resolvedTicker),
      yahooQuoteSummary(resolvedTicker,
        'assetProfile,summaryDetail,defaultKeyStatistics,financialData,calendarEvents'),
    ]);
    const v7      = v7Settled.status      === 'fulfilled' ? v7Settled.value      : null;
    const summary = summarySettled.status === 'fulfilled' ? summarySettled.value : null;

    const meta = chart?.meta || {};
    const ap   = summary?.assetProfile         || {};
    const sd   = summary?.summaryDetail        || {};
    const ks   = summary?.defaultKeyStatistics || {};
    const fd   = summary?.financialData        || {};
    const cal  = summary?.calendarEvents       || {};

    // ── Price ────────────────────────────────────────────────────────────────
    const price = meta.regularMarketPrice ?? v7?.regularMarketPrice ?? rv(sd, 'regularMarketPrice') ?? null;
    if (!price) { console.warn('[fetch-company-info] No price for', ticker); return null; }

    // ── 52-week high / low ────────────────────────────────────────────────────
    let week52High = v7?.fiftyTwoWeekHigh ?? rv(sd, 'fiftyTwoWeekHigh');
    let week52Low  = v7?.fiftyTwoWeekLow  ?? rv(sd, 'fiftyTwoWeekLow');
    if ((!week52High || !week52Low) && chart?.indicators?.quote?.[0]?.close) {
      const closes = chart.indicators.quote[0].close.filter(v => v != null);
      if (closes.length > 0) {
        if (!week52High) week52High = Math.max(...closes);
        if (!week52Low)  week52Low  = Math.min(...closes);
      }
    }

    // ── 50-day / 200-day moving averages (v7 primary, chart-calc fallback) ────
    let fiftyDayAvg      = v7?.fiftyDayAverage      ?? rv(sd, 'fiftyDayAverage');
    let twoHundredDayAvg = v7?.twoHundredDayAverage ?? rv(sd, 'twoHundredDayAverage');
    if ((!fiftyDayAvg || !twoHundredDayAvg) && chart?.indicators?.quote?.[0]?.close) {
      const closes = chart.indicators.quote[0].close.filter(v => v != null);
      if (closes.length >= 50  && !fiftyDayAvg)      fiftyDayAvg      = closes.slice(-50).reduce((s,v) => s+v, 0) / 50;
      if (closes.length >= 200 && !twoHundredDayAvg) twoHundredDayAvg = closes.slice(-200).reduce((s,v) => s+v, 0) / 200;
    }

    // ── Earnings dates ────────────────────────────────────────────────────────
    let nextEarningsDate = null, earningsDateEnd = null;
    const edArr = cal.earnings?.earningsDate;
    if (Array.isArray(edArr) && edArr.length > 0) {
      nextEarningsDate = ts2date(edArr[0]?.raw ?? edArr[0]);
      earningsDateEnd  = edArr.length > 1 ? ts2date(edArr[1]?.raw ?? edArr[1]) : null;
    }
    if (!nextEarningsDate && v7?.earningsTimestamp) nextEarningsDate = ts2date(v7.earningsTimestamp);

    // ── Dividends — v7 primary → quoteSummary → chart events fallback ───────────
    let dps          = v7?.dividendRate ?? v7?.trailingAnnualDividendRate
                       ?? rv(sd, 'dividendRate') ?? rv(sd, 'trailingAnnualDividendRate') ?? 0;
    let dividendYield= v7?.dividendYield ?? v7?.trailingAnnualDividendYield
                       ?? rv(sd, 'dividendYield') ?? null;
    let exDivDate    = ts2date(v7?.exDividendDate ?? rv(cal, 'exDividendDate') ?? rv(sd, 'exDividendDate'));
    const nextPayDate= ts2date(rv(cal, 'dividendDate'));
    // If v7 + quoteSummary both returned nothing for dividends, compute from
    // the v8/chart dividend events (actual historical payouts — no auth needed)
    if (!dps) {
      const evts = await fetchDividendEvents(resolvedTicker);
      if (evts) {
        dps          = evts.dps;
        dividendYield= dividendYield ?? evts.dividendYield;
        exDivDate    = exDivDate ?? evts.exDivDate;
      }
    }
    if (!dividendYield && dps > 0 && price > 0) dividendYield = dps / price;

    const result = {
      ticker,
      shortName:   v7?.shortName || meta.shortName || meta.longName || ap.name || ticker,
      longName:    v7?.longName  || meta.longName  || meta.shortName || ticker,
      sector:      ap.sector    || v7?.sector   || null,
      industry:    ap.industry  || v7?.industry  || null,
      description: ap.longBusinessSummary || null,
      website:     ap.website   || null,
      employees:   ap.fullTimeEmployees || null,
      exchange:    v7?.fullExchangeName  || meta.fullExchangeName || meta.exchangeName || null,
      currency:    v7?.financialCurrency || meta.currency || null,
      logo:        null,

      currentPrice:   price,
      marketCap:      v7?.marketCap      ?? rv(sd, 'marketCap'),
      marketCapFmt:   fmtCap(v7?.marketCap ?? rv(sd, 'marketCap')),
      trailingPE:     v7?.trailingPE     ?? rv(sd, 'trailingPE'),
      forwardPE:      v7?.forwardPE      ?? rv(sd, 'forwardPE') ?? rv(ks, 'forwardPE'),
      eps:            v7?.epsTrailingTwelveMonths ?? rv(ks, 'trailingEps'),
      forwardEps:     v7?.epsForward     ?? rv(ks, 'forwardEps'),
      beta:           v7?.beta           ?? rv(ks, 'beta') ?? rv(sd, 'beta'),
      bookValue:      v7?.bookValue      ?? rv(ks, 'bookValue'),
      priceToBook:    v7?.priceToBook    ?? rv(ks, 'priceToBook'),

      fiftyTwoWeekHigh: week52High,
      fiftyTwoWeekLow:  week52Low,
      fiftyDayAvg,
      twoHundredDayAvg,

      dps, dividendYield,
      forwardYield:  dividendYield,
      payoutRatio:   rv(sd, 'payoutRatio'),
      exDivDate, nextPayDate,

      nextEarningsDate, earningsDateEnd,
      earningsDateFmt: null,

      targetPrice:      rv(fd, 'targetMeanPrice'),
      targetHigh:       rv(fd, 'targetHighPrice'),
      targetLow:        rv(fd, 'targetLowPrice'),
      recommendation:   fd.recommendationKey || null,
      numberOfAnalysts: rv(fd, 'numberOfAnalystOpinions'),

      revenue:         rv(fd, 'totalRevenue'),
      revenueGrowth:   rv(fd, 'revenueGrowth'),
      grossMargin:     rv(fd, 'grossMargins'),
      operatingMargin: rv(fd, 'operatingMargins'),
      profitMargin:    rv(fd, 'profitMargins'),
      returnOnEquity:  rv(fd, 'returnOnEquity'),
      debtToEquity:    rv(fd, 'debtToEquity'),
      freeCashFlow:    rv(fd, 'freeCashflow'),
    };

    _companyCache.set(ticker, { data: result, ts: Date.now() });
    return result;
  } catch(e) {
    console.error('fetch-company-info error:', ticker, e.message);
    return null;
  }
});

// ── Historical OHLC data for portfolio chart ──────────────────────────────────
// Cached 15 min — avoids re-hitting Yahoo when the user switches tabs/ranges
const _histCache = new Map(); // key → {data, ts}
const HIST_TTL   = 15 * 60 * 1000;

ipcMain.handle('fetch-history', async (event, { tickers, interval, range }) => {
  const cacheKey = `${[...tickers].sort().join(',')}|${interval}|${range}`;
  const hit = _histCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < HIST_TTL) return hit.data;

  const results = {};
  await Promise.all(tickers.map(async ticker => {
    try {
      // fetchV8Chart resolves exchange suffix (e.g. SXR8 → SXR8.DE, EDP → EDP.LS)
      const { result } = await fetchV8Chart(ticker, `interval=${interval}&range=${range}`);
      if (!result) return;
      const timestamps = result.timestamp;
      const closes     = result.indicators?.quote?.[0]?.close;
      const currency   = result.meta?.currency;
      if (timestamps && closes) results[ticker] = { timestamps, closes, currency };
    } catch(e) { console.error('fetch-history error', ticker, e); }
  }));

  _histCache.set(cacheKey, { data: results, ts: Date.now() });
  return results;
});

// ── Price fetching via Yahoo Finance v8 chart endpoint (no crumb/cookie needed) ─
ipcMain.handle('fetch-prices', async (event, tickers) => {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  // 1. Get live EUR/USD rate
  let eurUsd = 1.08;
  try {
    const fxRes = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/EURUSD%3DX?interval=1d&range=1d', { headers: { 'User-Agent': UA } });
    const fxData = await fxRes.json();
    eurUsd = fxData?.chart?.result?.[0]?.meta?.regularMarketPrice || 1.08;
  } catch (e) {
    console.error('EUR/USD fetch error:', e);
  }

  // Helper: fetch a single Yahoo ticker symbol, return { price, dayChangePct } or null
  async function fetchYahooQuote(symbol) {
    const res  = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { 'User-Agent': UA } }
    );
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    let price = meta.regularMarketPrice;
    const rawChg = meta.regularMarketChangePercent;
    const dayChangePct = (rawChg != null && rawChg !== 0) ? rawChg : null;
    if (meta.currency === 'USD') price = price / eurUsd;
    return { price: Math.round(price * 100) / 100, dayChangePct };
  }

  // Common European/other exchange suffixes to try when bare ticker fails
  const EXCHANGE_SUFFIXES = ['.DE', '.LS', '.PA', '.AS', '.MI', '.MC', '.L', '.SW', '.ST', '.CO', '.OL', '.HE', '.BR'];

  // 2. Fetch each ticker in parallel via chart endpoint
  const entries = await Promise.all(tickers.map(async ticker => {
    try {
      // Try the ticker as-is first
      let result = await fetchYahooQuote(ticker);
      if (result) return [ticker, result];

      // If no result and ticker has no exchange suffix, try common European suffixes
      if (!ticker.includes('.')) {
        for (const suffix of EXCHANGE_SUFFIXES) {
          result = await fetchYahooQuote(ticker + suffix);
          if (result) return [ticker, result]; // return under original ticker key
        }
      }
    } catch (e) {
      console.error(`Price fetch error for ${ticker}:`, e);
    }
    return [ticker, null];
  }));

  const result = {};
  for (const [ticker, data] of entries) {
    if (data !== null) result[ticker] = data;
  }
  return result;
});

// ══════════════ PAYSLIP PARSER ══════════════
const PT_MONTHS_MAP = {
  'Janeiro':1,'Fevereiro':2,'Março':3,'Abril':4,'Maio':5,'Junho':6,
  'Julho':7,'Agosto':8,'Setembro':9,'Outubro':10,'Novembro':11,'Dezembro':12
};
function parsePayslipText(t) {
  // Smart number parser — handles European (1.234,56) and US/UK (1,234.56) formats
  const ptNum = s => {
    if (!s) return null;
    s = s.trim().replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s)) return parseFloat(s.replace(/\./g,'').replace(',','.'));
    if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(s)) return parseFloat(s.replace(/,/g,''));
    const n = parseFloat(s.replace(/[^\d.]/g,''));
    return isNaN(n) ? null : n;
  };

  // Try a list of regex patterns, return the first captured group that matches
  const first = (...patterns) => {
    for (const p of patterns) { const m = t.match(p); if (m?.[1]) return m[1]; }
    return null;
  };

  // ── Period detection (multilingual) ──────────────────────────────────────
  const MONTHS = {
    // PT
    janeiro:1,fevereiro:2,março:3,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12,
    // ES
    enero:1,febrero:2,marzo:3,mayo:5,junio:6,julio:7,septiembre:9,octubre:10,noviembre:11,diciembre:12,
    // FR
    janvier:1,fevrier:2,février:2,mars:3,avril:4,mai:5,juin:6,juillet:7,aout:8,août:8,septembre:9,octobre:10,novembre:11,decembre:12,décembre:12,
    // DE
    januar:1,februar:2,marz:3,märz:3,april:4,juni:6,juli:7,september:9,oktober:10,november:11,dezember:12,
    // EN
    january:1,february:2,march:3,june:6,july:7,september:9,october:10,november:11,december:12,
    // IT/NL
    gennaio:1,febbraio:2,aprile:4,maggio:5,giugno:6,luglio:7,settembre:9,ottobre:10,
    januari:1,februari:2,maart:3,mei:5,augustus:8,
  };
  const MONTH_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  let year = null, monthNum = null, monthName = null;
  // "MonthName YYYY"
  for (const m of (t.match(/\b([A-Za-zÀ-ú]{3,})\s+(\d{4})\b/g) || [])) {
    const [name, yr] = m.trim().split(/\s+/);
    const mn = MONTHS[name.toLowerCase()]; const y = parseInt(yr);
    if (mn && y > 2000 && y < 2100) { monthNum = mn; monthName = name; year = y; break; }
  }
  // "YYYY/MM" or "MM/YYYY"
  if (!year) {
    const m1 = t.match(/\b(\d{4})[\/\-](\d{1,2})\b/);
    const m2 = t.match(/\b(\d{1,2})[\/\-](\d{4})\b/);
    if (m1 && +m1[1] > 2000) { year = +m1[1]; monthNum = +m1[2]; }
    else if (m2 && +m2[2] > 2000) { year = +m2[2]; monthNum = +m2[1]; }
  }
  if (!year) year = new Date().getFullYear();
  if (!monthNum || monthNum < 1 || monthNum > 12) monthNum = new Date().getMonth() + 1;
  const period      = `${year}-${String(monthNum).padStart(2,'0')}`;
  const periodLabel = monthName ? `${monthName} ${year}` : `${MONTH_EN[monthNum-1]} ${year}`;

  // ── Gross salary ─────────────────────────────────────────────────────────
  const grossRaw = first(
    /vencimento\s+bruto\s*:?\s*([\d][\d.,]*)/i,          // PT
    /gross\s+(?:salary|pay|wage|earnings?)\s*:?\s*([\d][\d.,]*)/i, // EN
    /total\s+(?:gross|earnings?)\s*:?\s*([\d][\d.,]*)/i,
    /salario\s+bruto\s*:?\s*([\d][\d.,]*)/i,             // ES
    /total\s+devengado\s*:?\s*([\d][\d.,]*)/i,
    /salaire\s+brut\s*:?\s*([\d][\d.,]*)/i,              // FR
    /brut\s+(?:total|mensuel)\s*:?\s*([\d][\d.,]*)/i,
    /bruttogehalt\s*:?\s*([\d][\d.,]*)/i,                // DE
    /bruttolohn\s*:?\s*([\d][\d.,]*)/i,
    /retribuzione\s+lorda\s*:?\s*([\d][\d.,]*)/i,        // IT
    /totale\s+competenze\s*:?\s*([\d][\d.,]*)/i,
    /\bbruto\s*:?\s*([\d][\d.,]*)/i,                     // generic
    /\bgross\s*:?\s*([\d][\d.,]*)/i,
  );

  // ── Net salary ───────────────────────────────────────────────────────────
  const netRaw = first(
    /venc\.?\s*l[íi]q\.?\s*(?:impostos?)?\s*:?\s*([\d][\d.,]*)/i,  // PT
    /l[íi]quido\s*a?\s*(?:receber|pagar)?\s*:?\s*([\d][\d.,]*)/i,
    /net\s+(?:salary|pay|wage|take[- ]home)\s*:?\s*([\d][\d.,]*)/i, // EN
    /total\s+net\s*:?\s*([\d][\d.,]*)/i,
    /net\s+(?:à\s+payer|payé)\s*:?\s*([\d][\d.,]*)/i,              // FR
    /salaire\s+net\s*:?\s*([\d][\d.,]*)/i,
    /l[íi]quido\s+a\s+percibir\s*:?\s*([\d][\d.,]*)/i,             // ES
    /neto\s+a\s+percibir\s*:?\s*([\d][\d.,]*)/i,
    /nettogehalt\s*:?\s*([\d][\d.,]*)/i,                           // DE
    /auszahlungsbetrag\s*:?\s*([\d][\d.,]*)/i,
    /netto\s+(?:in\s+busta|a\s+pagare)\s*:?\s*([\d][\d.,]*)/i,    // IT
    /totale\s+netto\s*:?\s*([\d][\d.,]*)/i,
    /\bnett?o\s*:?\s*([\d][\d.,]*)/i,                              // generic
  );

  // ── Base salary ──────────────────────────────────────────────────────────
  const baseRaw = first(
    /venc\.?\s*base\s*:?\s*([\d][\d.,]*)/i,
    /base\s+salary\s*:?\s*([\d][\d.,]*)/i,
    /basic\s+(?:salary|pay)\s*:?\s*([\d][\d.,]*)/i,
    /salario\s+base\s*:?\s*([\d][\d.,]*)/i,
    /salaire\s+de\s+base\s*:?\s*([\d][\d.,]*)/i,
    /grundgehalt\s*:?\s*([\d][\d.,]*)/i,
    /retribuzione\s+base\s*:?\s*([\d][\d.,]*)/i,
  );

  // ── Tax deduction ────────────────────────────────────────────────────────
  const taxRaw = first(
    /(?:reten[çc][aã]o\s+)?irs\s*:?\s*([\d][\d.,]*)/i,
    /income\s+tax\s*:?\s*([\d][\d.,]*)/i,
    /(?:paye|tax\s+withheld)\s*:?\s*([\d][\d.,]*)/i,
    /(?:retenci[oó]n\s+)?irpf\s*:?\s*([\d][\d.,]*)/i,
    /impôt\s+(?:sur\s+le\s+revenu|prélevé)\s*:?\s*([\d][\d.,]*)/i,
    /prélèvement\s+à\s+la\s+source\s*:?\s*([\d][\d.,]*)/i,
    /lohnsteuer\s*:?\s*([\d][\d.,]*)/i,
    /irpef\s*:?\s*([\d][\d.,]*)/i,
    /ritenuta\s+fiscale\s*:?\s*([\d][\d.,]*)/i,
  );
  // EY legacy: sum /401+/403+/404 lines
  const irs401 = ptNum(t.match(/\/401\s.*?([\d.,]+)\s*$/m)?.[1]) || 0;
  const irs403 = ptNum(t.match(/\/403\s.*?([\d.,]+)\s*$/m)?.[1]) || 0;
  const irs404 = ptNum(t.match(/\/404\s.*?([\d.,]+)\s*$/m)?.[1]) || 0;
  const irsFromLines = irs401 + irs403 + irs404;

  // ── Social security ──────────────────────────────────────────────────────
  const ssRaw = first(
    /contrib\.?\s*(?:empregado\s+)?(?:p\/?\s*)?ss\s*:?\s*([\d][\d.,]*)/i,
    /seguran[çc]a\s+social\s*:?\s*([\d][\d.,]*)/i,
    /(?:national\s+insurance|ni\b)\s*:?\s*([\d][\d.,]*)/i,
    /social\s+security\s*:?\s*([\d][\d.,]*)/i,
    /seguridad\s+social\s*:?\s*([\d][\d.,]*)/i,
    /cotisations?\s+salariales?\s*:?\s*([\d][\d.,]*)/i,
    /sécurité\s+sociale\s*:?\s*([\d][\d.,]*)/i,
    /sozialversicherung\s*:?\s*([\d][\d.,]*)/i,
    /contributi?\s+(?:inps|previdenziali?)\s*:?\s*([\d][\d.,]*)/i,
  );

  // ── Meal allowance ───────────────────────────────────────────────────────
  const mealRaw = first(
    /cart[aã]o\s+refei[çc][aã]o\s*:?\s*([\d][\d.,]*)/i,
    /meal\s+(?:allowance|voucher)\s*:?\s*([\d][\d.,]*)/i,
    /ticket\s+(?:restaurant|repas|meal)\s*:?\s*([\d][\d.,]*)/i,
    /vales?\s+(?:de\s+)?comida\s*:?\s*([\d][\d.,]*)/i,
    /essensz[ou]schuss\s*:?\s*([\d][\d.,]*)/i,
    /buoni?\s+pasto\s*:?\s*([\d][\d.,]*)/i,
  );
  // EY legacy /430 line
  const mealLegacy = ptNum([...t.matchAll(/\/430\s.*?([\d.,]+)\s*$/mg)]?.[0]?.[1]);

  // ── Holiday subsidy ──────────────────────────────────────────────────────
  const holidayRaw = first(
    /sub\.?\s*(?:de\s+)?f[eé]rias\s*:?\s*([\d][\d.,]*)/i,
    /holiday\s+(?:pay|allowance|bonus)\s*:?\s*([\d][\d.,]*)/i,
    /vacation\s+(?:pay|allowance)\s*:?\s*([\d][\d.,]*)/i,
    /urlaubsgeld\s*:?\s*([\d][\d.,]*)/i,
    /indemnit[eé]\s+(?:de\s+)?cong[eé]\s*:?\s*([\d][\d.,]*)/i,
  );

  // ── Christmas / year-end bonus ───────────────────────────────────────────
  const christmasRaw = first(
    /sub\.?\s*(?:de\s+)?natal\s*:?\s*([\d][\d.,]*)/i,
    /christmas\s+(?:bonus|allowance)\s*:?\s*([\d][\d.,]*)/i,
    /13\.?\s*(?:th\s+)?(?:month|salary|salario)\s*:?\s*([\d][\d.,]*)/i,
    /weihnachtsgeld\s*:?\s*([\d][\d.,]*)/i,
    /tredicesima\s*:?\s*([\d][\d.,]*)/i,
    /aguinaldo\s*:?\s*([\d][\d.,]*)/i,
    /gratifica[cç][aã]o\s+natalina\s*:?\s*([\d][\d.,]*)/i,
  );

  // ── Employer & function ───────────────────────────────────────────────────
  const employerRaw = first(
    /empregador\s*:?\s*(.+)/i, /employer\s*:?\s*(.+)/i,
    /empresa\s*:?\s*(.+)/i,    /employeur\s*:?\s*(.+)/i,
    /arbeitgeber\s*:?\s*(.+)/i,/company\s*:?\s*(.+)/i,
    /RECIBO DE REMUNERAÇÕES\n([^\n]+)/,
  );
  const functionRaw = first(
    /fun[çc][aã]o\s*:?\s*(.+)/i, /cargo\s*:?\s*(.+)/i,
    /job\s+(?:title|position)\s*:?\s*(.+)/i,
    /position\s*:?\s*(.+)/i,     /poste\s*:?\s*(.+)/i,
    /stelle\s*:?\s*(.+)/i,       /mansione\s*:?\s*(.+)/i,
  );

  const irsDeduction = irsFromLines > 0 ? irsFromLines : (ptNum(taxRaw) || 0);
  const mealAllowance = mealLegacy || ptNum(mealRaw) || 0;

  return {
    period, periodLabel,
    grossSalary:      ptNum(grossRaw),
    netSalary:        ptNum(netRaw),
    baseSalary:       ptNum(baseRaw),
    ssDeduction:      ptNum(ssRaw)     || 0,
    irsDeduction,
    mealAllowance,
    holidaySubsidy:   ptNum(holidayRaw)   || 0,
    christmasSubsidy: ptNum(christmasRaw) || 0,
    employer:         employerRaw?.trim().slice(0,80) || null,
    functionTitle:    functionRaw?.trim().slice(0,80) || null,
    // Legacy / EY-specific (kept for backwards compatibility)
    baseComp:         ptNum(baseRaw) || 0,
    hoursExemption:   ptNum(t.match(/0124\s.*?([\d.,]+)\s*$/m)?.[1]) || 0,
    irsBase:          ptNum(t.match(/Base IRS:\s*([\d.,]+)/)?.[1]),
    ssBase:           ptNum(t.match(/Base SS:\s*([\d.,]+)/)?.[1]),
    totalAbonos:      ptNum(t.match(/TOTAIS\s+([\d.,]+)\s+[\d.,]+/)?.[1]),
    totalDescontos:   ptNum(t.match(/TOTAIS\s+[\d.,]+\s+([\d.,]+)/)?.[1]),
    ytdIRSBase:       ptNum(t.match(/Ac\. Base IRS:\s*([\d.,]+)/)?.[1]),
    ytdSSDeduction:   ptNum(t.match(/Ac\. Retenção SS:\s*([\d.,]+)/)?.[1]),
    ytdIRSDeduction:  ptNum(t.match(/Ac\. Retenção IRS:\s*([\d.,]+)/)?.[1]),
    department:       t.match(/Departamento:\s*(.+)/)?.[1]?.trim() || null,
  };
}

function parsePdfAtPath(filePath) {
  // Use Python + pdfplumber for reliable text extraction.
  // pdf-parse v2 and pdfjs-dist both crash in Electron's main process (need browser DOM APIs).
  const { spawnSync } = require('child_process');

  const pyScript = [
    'import sys, pdfplumber',
    'with pdfplumber.open(sys.argv[1]) as pdf:',
    '    text = "\\n".join(p.extract_text() or "" for p in pdf.pages)',
    'print(text)',
  ].join('\n');

  // Try common Python locations in order — Electron's PATH differs from the terminal's
  const pythonCandidates = [
    '/opt/homebrew/bin/python3',          // macOS Apple Silicon (Homebrew)
    '/usr/local/bin/python3',             // macOS Intel (Homebrew)
    '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.10/bin/python3',
    '/usr/bin/python3',                   // Linux / macOS system
    '/usr/bin/python',                    // Linux fallback
    '/usr/local/bin/python',
    'python3',                            // PATH fallback
    'python',
  ];

  let result;
  for (const py of pythonCandidates) {
    result = spawnSync(py, ['-c', pyScript, filePath], { encoding: 'utf8', timeout: 30000 });
    if (!result.error) break; // found a working Python
  }

  if (result.error) throw new Error('Python 3 not found.\nInstall it from https://python.org then run:\n  pip install pdfplumber');
  if (result.stderr?.includes('No module named')) throw new Error('Missing Python library.\nRun this in your terminal:\n  pip install pdfplumber');
  if (result.status !== 0) throw new Error('PDF text extraction failed:\n' + (result.stderr || 'unknown error'));

  return parsePayslipText(result.stdout);
}

// Dialog-based import (button click)
ipcMain.handle('parse-payslip', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Select Payslip PDF',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return null;
  return parsePdfAtPath(filePaths[0]);
});

// Path-based import (drag-and-drop)
ipcMain.handle('parse-payslip-from-path', async (event, filePath) => {
  if (!filePath) return null;
  return parsePdfAtPath(filePath);
});

// ══════════════ XTB EXCEL IMPORT ══════════════
ipcMain.handle('import-xtb-excel', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Select XTB Export File',
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return null;
  const filePath = filePaths[0];

  try {
    let XLSX;
    try { XLSX = require('xlsx'); } catch(e) {
      // xlsx not installed — fall back to CSV parsing
      const text = fs.readFileSync(filePath, 'utf8');
      return parseXtbCsv(text);
    }

    const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
    const allPositions = [];

    // Scan EVERY sheet — XTB exports have multiple tabs
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const nameU = sheetName.toUpperCase().trim();

      if (nameU.includes('CASH')) {
        // "CASH OPERATION HISTORY" — extract stock purchases from Comment column
        allPositions.push(...parseXtbCashHistory(rows));
      } else {
        // "OPEN POSITION *" / "CLOSED POSITION HISTORY" / generic statement
        allPositions.push(...parseXtbRowsSafe(rows));
      }
    }

    if (!allPositions.length) {
      const sheetList = workbook.SheetNames.map(n => `  • ${n}`).join('\n');
      throw new Error(
        `No position data found in any sheet.\n\nSheets found:\n${sheetList}\n\n` +
        `Supported exports: Open Positions, Closed History, or Cash Operation History (EN/PT/ES/DE/PL).`
      );
    }

    return allPositions;
  } catch (e) {
    console.error('XTB import error:', e);
    throw new Error('Could not parse XTB file:\n' + e.message);
  }
});

// ── XTB column aliases — covers EN/PT/ES/DE/PL/FR ───────────────────────────
const XTB_COL = {
  ticker: ['symbol','instrument','ticker','aktie','instrumento','ativo','símbolo','nome','name','asset','security','market','produto','walor','nazwa','symbole'],
  type:   ['type','side','direction','buy/sell','cmd','operation','tipo','operação','operacion','sens','rodzaj','typ'],
  shares: ['volume','quantity','qty','units','lots','menge','quantidade','size','shares','ações','wolumen','ilość'],
  price:  ['open price','opening price','open_price','purchase price','avg price','preço de abertura','preço abertura','precio apertura','eröffnungskurs','entry price','buy price','cena otwarcia'],
  date:   ['open time','opening time','open_time','data/hora abertura','data de abertura','data abertura','hora abertura','fecha apertura','eröffnungszeit','time opened','transaction date','czas otwarcia'],
};

function _xtbMatchCell(cell, aliases) {
  const c = cell.toLowerCase().trim();
  return aliases.some(a => c === a || c.includes(a));
}

function parseXtbDate(raw) {
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (raw instanceof Date && !isNaN(raw)) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  // Try ISO / standard format
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // Try DD.MM.YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (m) { d = new Date(+m[3], +m[2]-1, +m[1]); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); }
  return new Date().toISOString().slice(0, 10);
}

// Parses a standard position sheet (Open Positions / Closed History).
// Returns [] silently if the sheet has no data rows — caller decides whether to throw.
function parseXtbRowsSafe(rows) {
  if (!rows || !rows.length) return [];
  // Strip leading 'sep=...' line (some CSV exports)
  if (String(rows[0]?.[0] || '').trim().toLowerCase().startsWith('sep=')) rows = rows.slice(1);

  const allPositions = [];

  // Scan ALL rows looking for header rows (file may have multiple sections)
  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i];
    const cellsLower = rawRow.map(c => String(c ?? '').toLowerCase().trim());

    // A header row must contain at least one ticker-alias cell
    const tickerIdx = cellsLower.findIndex(c => _xtbMatchCell(c, XTB_COL.ticker));
    if (tickerIdx < 0) continue;

    // Map remaining columns
    const colMap = { ticker: tickerIdx };
    let extraCols = 0;
    for (const [field, aliases] of Object.entries(XTB_COL)) {
      if (field === 'ticker') continue;
      const idx = cellsLower.findIndex(c => _xtbMatchCell(c, aliases));
      if (idx >= 0) { colMap[field] = idx; extraCols++; }
    }

    // Need at least 1 more recognised column besides ticker
    if (extraCols < 1) continue;

    // Parse data rows immediately following this header
    for (let j = i + 1; j < rows.length; j++) {
      const dataRow = rows[j];
      const tickerRaw = String(dataRow[colMap.ticker] ?? '').trim();

      if (!tickerRaw) continue; // blank cell in ticker col
      // Stop if this row itself is another header
      if (_xtbMatchCell(tickerRaw, XTB_COL.ticker)) { i = j - 1; break; }
      // Stop at section dividers (all-text row with no numeric values)
      const hasNumeric = dataRow.some(c => /^\d/.test(String(c ?? '').trim()));
      if (!hasNumeric && j > i + 1 && tickerRaw.length > 20) { i = j - 1; break; }

      // Detect currency from exchange suffix BEFORE stripping
      const tickerUpper = tickerRaw.toUpperCase();
      const currency = /\.(DE|AT|BE|FR|IT|ES|PT|NL|SE|NO|DK|FI|CH|AS|LS|PA|MC|MI|CO|ST|OL|HE|BR|VIE|AMS|LIS)$/i.test(tickerUpper) ? 'EUR'
        : /\.L$/i.test(tickerUpper) ? 'GBP'
        : 'USD'; // .US, no suffix, or unknown → assume USD

      // Clean ticker: strip exchange suffixes (.US .PL .DE …)
      const cleanTicker = tickerRaw
        .replace(/\.(US|PL|DE|UK|FR|NL|IT|ES|SE|NO|DK|FI|AT|BE|CH|PT|HU|CZ|RO|CA|AU|HK|SG|L|AS|LS|PA|MC|MI|CO|ST|OL|HE|BR|VIE|AMS|LIS)$/i, '')
        .toUpperCase().trim();
      if (!cleanTicker || !/^[A-Z]/.test(cleanTicker)) continue;

      const rawType = colMap.type != null ? String(dataRow[colMap.type] ?? '').toUpperCase().trim() : 'BUY';
      const isSell  = rawType.includes('SELL') || rawType === '1' || rawType.includes('SHORT')
        || rawType.includes('VEND') || rawType.includes('KRÓT');
      const type = isSell ? 'Sell' : 'Buy';

      const rawShares = String(dataRow[colMap.shares] ?? '').replace(/\s/g, '').replace(',', '.');
      const shares = parseFloat(rawShares) || 0;
      if (shares <= 0) continue;

      const rawPrice = String(dataRow[colMap.price] ?? '').replace(/\s/g, '').replace(',', '.');
      const price = parseFloat(rawPrice) || 0;

      const date = parseXtbDate(colMap.date != null ? dataRow[colMap.date] : null);

      allPositions.push({ ticker: cleanTicker, type, shares, price, date, currency });
    }
  }

  return allPositions; // empty [] is fine — caller aggregates across sheets
}

// Parses "CASH OPERATION HISTORY" sheet.
// XTB records stock purchases there with Comment = "OPEN BUY {shares} @ {price}".
function parseXtbCashHistory(rows) {
  if (!rows || !rows.length) return [];
  const positions = [];

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(c => String(c ?? '').toLowerCase().trim());
    // Find the header row: must have "type" and "comment" (or at least "symbol")
    const typeIdx    = cells.findIndex(c => c === 'type');
    const commentIdx = cells.findIndex(c => c === 'comment');
    const symbolIdx  = cells.findIndex(c => c === 'symbol');
    const timeIdx    = cells.findIndex(c => c === 'time');
    if (typeIdx < 0 || (commentIdx < 0 && symbolIdx < 0)) continue;

    // Parse data rows below the header
    for (let j = i + 1; j < rows.length; j++) {
      const row  = rows[j];
      const type = String(row[typeIdx] ?? '').trim().toLowerCase();

      // Only "Stock purchase" / "investment" / "buy" type rows
      if (!type.includes('stock') && !type.includes('purchase')
          && !type.includes('invest') && !type.includes('buy')) continue;

      const comment = String(commentIdx >= 0 ? (row[commentIdx] ?? '') : '').trim();
      const symbol  = String(symbolIdx  >= 0 ? (row[symbolIdx]  ?? '') : '').trim().toUpperCase();
      const date    = parseXtbDate(timeIdx >= 0 ? row[timeIdx] : null);

      // Extract shares + price from comment.
      // Formats seen in XTB exports:
      //   "OPEN BUY 2 @ 164.87"            → whole lot
      //   "OPEN BUY 0.1002/1.1002 @ 154.00" → fractional fill: X/total (take X, the incremental amount)
      //   "OPEN BUY 1/1.1002 @ 154.24"      → whole-share fill of same order (take 1)
      const m = comment.match(/(?:OPEN\s+)?BUY\s+([\d.,]+)(?:\/[\d.,]+)?\s*@\s*([\d.,]+)/i);
      if (!m || !symbol) continue;

      const shares = parseFloat(m[1].replace(',', '.')) || 0;
      const price  = parseFloat(m[2].replace(',', '.')) || 0;
      if (shares <= 0) continue;

      // Detect currency from exchange suffix BEFORE stripping
      const currency = /\.(DE|AT|BE|FR|IT|ES|PT|NL|SE|NO|DK|FI|CH|AS|LS|PA|MC|MI|CO|ST|OL|HE|BR|VIE|AMS|LIS)$/i.test(symbol) ? 'EUR'
        : /\.L$/i.test(symbol) ? 'GBP'
        : 'USD'; // .US, no suffix, or unknown → assume USD

      const cleanTicker = symbol
        .replace(/\.(US|PL|DE|UK|FR|NL|IT|ES|SE|NO|DK|FI|AT|BE|CH|PT|L|AS|LS|PA|MC|MI|CO|ST|OL|HE|BR|VIE|AMS|LIS)$/i, '')
        .toUpperCase().trim();
      if (!cleanTicker || !/^[A-Z]/.test(cleanTicker)) continue;

      positions.push({ ticker: cleanTicker, type: 'Buy', shares, price, date, currency });
    }
    break; // only one header row per sheet
  }

  return positions;
}

// Keep old name as alias so parseXtbCsv (below) still works
const parseXtbRows = parseXtbRowsSafe;

function parseXtbCsv(text) {
  // Handle semicolon-delimited exports (common in Europe)
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const lines = text.split(/\r?\n/);
  const rows = lines.map(l => {
    // Simple CSV parser: handle quoted fields
    const cells = [];
    let cur = '', inQ = false;
    for (let k = 0; k < l.length; k++) {
      const ch = l[k];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === delim && !inQ) { cells.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cells.push(cur.trim());
    return cells;
  });
  return parseXtbRows(rows);
}
