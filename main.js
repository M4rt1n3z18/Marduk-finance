const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── One copy at a time ────────────────────────────────────────────────────────
// Two windows on the same data folder could each save over the other's changes.
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

// ── Nexora was called Marduk until 2.0: carry its local folder over (copied, never moved)
try { require('./carry-over').carryOver(path.join(app.getPath('appData'), 'marduk'), app.getPath('userData')); }
catch (e) { console.error('Carrying over the Marduk folder (non-fatal):', e.message); }

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
const GITHUB_REPO  = 'Nexora-finance';   // was Marduk-finance — releases are looked up by id anyway
const GITHUB_REPO_ID = 1253690538;   // never changes, even when the repository is renamed
const macUpdate = require('./updater-mac');

// ── macOS custom updater ──────────────────────────────────────────────────────
// One check at a time. The 4-hourly timer and Settings → Check for updates
// could otherwise both start downloading the same 120 MB DMG into the same
// file, interleaving two streams into a corrupt installer.
let _macUpdateRun = null;
function checkForUpdatesMac() {
  if (!_macUpdateRun) _macUpdateRun = _checkForUpdatesMac().finally(() => { _macUpdateRun = null; });
  return _macUpdateRun;
}

async function _checkForUpdatesMac() {
  try {
    // 1. Ask GitHub for the latest release — by repository id, so a renamed
    //    repository keeps answering (by name it returned "Moved Permanently")
    const release = await macUpdate.latestRelease({
      repoId: GITHUB_REPO_ID, owner: GITHUB_OWNER, repo: GITHUB_REPO, headers: { 'User-Agent': 'Nexora-App' },
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

    // 4. Download the DMG with real progress tracking
    const dmgPath = path.join(os.tmpdir(), `Nexora-${latest}.dmg`);

    // Already downloaded this version in this session — the 4-hourly re-check
    // used to fetch the whole DMG again every time until you restarted.
    if (global._pendingDmg === dmgPath && fs.existsSync(dmgPath)) {
      if (win) win.webContents.send('update-downloaded');
      return;
    }

    if (win) win.webContents.send('update-available', latest);

    await new Promise((resolve, reject) => {
      const download = (url, hops = 0) => {
        if (hops > 5) return reject(new Error('Too many redirects'));
        const mod = url.startsWith('https') ? require('https') : require('http');
        mod.get(url, { headers: { 'User-Agent': 'Nexora-App' } }, res => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) { res.resume(); download(res.headers.location, hops + 1); return; }
          if (res.statusCode !== 200) return reject(new Error(`download HTTP ${res.statusCode}`));
          const total = parseInt(res.headers['content-length'] || '0');
          let done = 0;
          const file = fs.createWriteStream(dmgPath);
          res.on('data', chunk => {
            done += chunk.length;
            if (total > 0 && win) win.webContents.send('update-progress', Math.floor(done / total * 100));
          });
          // pipe(), not manual write() — this respects backpressure on a 120 MB
          // file, and `finish` fires once the bytes are actually on disk.
          // Resolving on the response's `end` handed back a path whose file was
          // still being flushed, so the installer could mount a partial DMG.
          res.pipe(file);
          file.on('finish', () => {
            if (total > 0 && done !== total) {
              fs.unlink(dmgPath, () => {});
              return reject(new Error(`incomplete download (${done}/${total} bytes)`));
            }
            resolve();
          });
          file.on('error', reject);
          res.on('error', reject);
        }).on('error', reject);
      };
      download(asset.browser_download_url);
    });

    global._pendingDmg = dmgPath;
    if (win) win.webContents.send('update-downloaded');

  } catch(e) {
    // Was console.log only: every failure here — no network, GitHub rate limit,
    // a truncated download — looked identical to "you are up to date".
    console.log('macOS update check:', e.message);
    if (win) win.webContents.send('update-error', e.message || 'Update check failed');
  }
}

// Manual trigger — the automatic check runs 5s after launch and then every 4h,
// so a release published while the app was open was invisible until a restart.
ipcMain.handle('check-for-updates', async () => {
  if (process.platform === 'darwin') { await checkForUpdatesMac(); return true; }
  try { await autoUpdater.checkForUpdates(); return true; } catch(e) { return false; }
});

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
  if (process.platform === 'darwin') {
    if (!global._pendingDmg) return;   // nothing downloaded — electron-updater isn't used on macOS
    // macOS: mount DMG → copy app → clear quarantine → reopen
    const { spawnSync, spawn } = require('child_process');
    // A failed step used to be ignored: the app quit anyway and reopened the
    // old version, which then offered the same update again. Stop and say why.
    const fail = msg => { if (win) win.webContents.send('update-error', msg); };
    try {
      const mountOut = spawnSync('hdiutil', ['attach', global._pendingDmg, '-nobrowse'], { encoding: 'utf8' });
      const mountPoint = (mountOut.stdout || '').trim().split('\n').pop().split('\t').pop().trim();
      // Any app in the DMG — the update that brought Nexora replaced MARDUK.app this way
      if (mountOut.status !== 0 || !mountPoint || !fs.existsSync(mountPoint) || !macUpdate.findApp(mountPoint)) {
        if (mountOut.status === 0 && mountPoint) spawnSync('hdiutil', ['detach', mountPoint, '-quiet'], { timeout: 10000 });
        fs.unlink(global._pendingDmg, () => {});
        global._pendingDmg = null;               // force a fresh download next check
        return fail('Could not open the downloaded update — it will download again on the next check.');
      }

      // Install next to the bundle we are actually running from, not a hardcoded
      // /Applications path — otherwise an app kept anywhere else updates a
      // different copy (or none) and then reopens the wrong one. A renamed app
      // lands beside it and the old one goes to the Trash.
      const current = process.execPath.split('/Contents/')[0];
      const result = macUpdate.installApp({ volume: mountPoint, currentBundle: current });
      spawnSync('hdiutil', ['detach', mountPoint, '-quiet'], { timeout: 10000 });
      if (result.error) return fail(result.error);
      const bundle = result.newBundle;

      // `app.relaunch()` cannot work here: it re-spawns process.execPath, which
      // points inside the bundle `cp -Rf` just overwrote. The old executable is
      // gone, so the app quit and never came back.
      //
      // A detached shell outlives this process instead, waits for it to exit,
      // then asks LaunchServices to open the *new* bundle — which also refreshes
      // its registration, something a raw spawn of the binary would not do.
      // Retried a few times because `open` refuses while the old instance is
      // still shutting down, and its output is kept so a failure is diagnosable
      // rather than just "it didn't come back".
      const log = path.join(app.getPath('userData'), 'update-relaunch.log');
      const script =
        `for i in 1 2 3 4 5; do sleep 2; ` +
        `open -a "${bundle}" >> "${log}" 2>&1 && exit 0; done; ` +
        `echo "relaunch failed for ${bundle}" >> "${log}"`;
      spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref();
      app.exit(0);
    } catch(e) { console.error('macOS install failed:', e); fail(e.message || 'Install failed'); }
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
// Each profile is one encrypted file in a Nexora folder on Google Drive; the
// renderer encrypts and decrypts, so nothing readable ever reaches this folder.
const NEXORA_DIR    = path.join(GDRIVE_FOLDER, 'Nexora');
const PROFILES_FILE = path.join(NEXORA_DIR, 'profiles.json');   // names, avatars, settings — no finances
const profileFile   = id => path.join(NEXORA_DIR, `${id}.nexora`);
const PROFILE_ID    = /^[a-z0-9]{3,32}$/i;
// Marduk 1.x kept the data unencrypted beside a password hash; read once to upgrade
const LEGACY_DATA_FILE = path.join(GDRIVE_FOLDER, 'marduk-data.json');
const LEGACY_PW_FILE   = path.join(app.getPath('userData'), 'marduk-pw.bin');
const AI_KEY_FILE = path.join(app.getPath('userData'), 'nexora-ai-key.bin'); // API key stays local, never synced

// ── Window ────────────────────────────────────────────────────────────────────
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Nexora',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0D0F14',
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

  // Installers from earlier updates were never deleted — ~120 MB per release
  // piling up in the temp folder. The running version's own DMG is no longer
  // needed either, so everything matching goes.
  if (process.platform === 'darwin') {
    try {
      for (const f of fs.readdirSync(os.tmpdir()))
        if (/^(MARDUK|Nexora)-[\d.]+\.dmg$/.test(f)) fs.unlink(path.join(os.tmpdir(), f), () => {});
    } catch (e) {}
  }

  // Check for updates a few seconds after launch (gives the window time to load),
  // then re-check every 4 hours so long-running sessions still see new versions.
  const runUpdateCheck = () => {
    if (process.platform === 'darwin') checkForUpdatesMac();
    else autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(runUpdateCheck, 5000);
  setInterval(runUpdateCheck, 4 * 60 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// ── Profiles ──────────────────────────────────────────────────────────────────
// Written to a temporary file first and renamed into place, so a crash or a
// Drive sync mid-write never leaves half a file.
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
const readIfExists = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;

ipcMain.handle('profiles-read', () => { try { return readIfExists(PROFILES_FILE); } catch (e) { return null; } });
ipcMain.handle('profiles-write', (event, json) => {
  try { JSON.parse(json); writeAtomic(PROFILES_FILE, json); return true; }
  catch (e) { console.error('Profiles save error:', e); return false; }
});
ipcMain.handle('profile-read', (event, id) => {
  if (!PROFILE_ID.test(String(id))) return null;
  try { return readIfExists(profileFile(id)); } catch (e) { return null; }
});
ipcMain.handle('profile-write', (event, id, json) => {
  if (!PROFILE_ID.test(String(id))) return false;
  try {
    if (JSON.parse(json).format !== 'nexora-encrypted') return false;   // only ever encrypted data
    rotateBackup(id);
    writeAtomic(profileFile(id), json);
    return true;
  } catch (e) { console.error('Profile save error:', e); return false; }
});
// A deleted profile's file goes to the local backups, not away
ipcMain.handle('profile-remove', (event, id) => {
  if (!PROFILE_ID.test(String(id))) return false;
  try {
    const f = profileFile(id);
    if (fs.existsSync(f)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.copyFileSync(f, path.join(BACKUP_DIR, `nexora-${id}-removed-${localDay()}.nexora`));
      fs.unlinkSync(f);
    }
    return true;
  } catch (e) { return false; }
});

// ── Upgrade from Marduk 1.x ───────────────────────────────────────────────────
ipcMain.handle('legacy-status', () => ({ data: fs.existsSync(LEGACY_DATA_FILE), password: fs.existsSync(LEGACY_PW_FILE) }));
ipcMain.handle('legacy-read', () => {
  try { return { json: readIfExists(LEGACY_DATA_FILE), password: readIfExists(LEGACY_PW_FILE) }; }
  catch (e) { return null; }
});
// Called only after the encrypted profile has been written and read back: the
// unencrypted file leaves Google Drive (a copy stays in the local backups) and
// the old password hash goes with it.
ipcMain.handle('legacy-retire', () => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const day = localDay();
    if (fs.existsSync(LEGACY_DATA_FILE)) {
      fs.copyFileSync(LEGACY_DATA_FILE, path.join(BACKUP_DIR, `marduk-data-before-nexora-${day}.json`));
      fs.unlinkSync(LEGACY_DATA_FILE);
    }
    if (fs.existsSync(LEGACY_PW_FILE)) fs.renameSync(LEGACY_PW_FILE, path.join(BACKUP_DIR, `marduk-pw-before-nexora-${day}.bin`));
    return true;
  } catch (e) { console.error('Retiring the Marduk files:', e); return false; }
});

// ── Automatic rotating backups ────────────────────────────────────────────────
// Before the first save of each day, a copy of the profile's previous file is
// kept in userData/backups (local disk — independent of Google Drive sync).
// Still encrypted. Keeps the last 10 days per profile. Marduk's own daily
// backups (unencrypted, from before 2.0) stay listed so they can be restored.
const BACKUP_DIR = path.join(app.getPath('userData'), 'backups');
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const BACKUP_NAME = /^(nexora-[a-z0-9]{3,32}-(\d{4}-\d{2}-\d{2})\.nexora|marduk-data-(?:before-nexora-)?(\d{4}-\d{2}-\d{2})\.json)$/i;

function rotateBackup(id) {
  try {
    const src = profileFile(id);
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const dest = path.join(BACKUP_DIR, `nexora-${id}-${localDay()}.nexora`);
    if (fs.existsSync(dest)) return; // one backup per day
    fs.copyFileSync(src, dest);
    const mine = fs.readdirSync(BACKUP_DIR).filter(f => new RegExp(`^nexora-${id}-\\d{4}-\\d{2}-\\d{2}\\.nexora$`).test(f)).sort();
    while (mine.length > 10) fs.unlinkSync(path.join(BACKUP_DIR, mine.shift()));
  } catch (e) { console.error('Backup rotation error (non-fatal):', e.message); }
}

// This profile's backups, plus Marduk's unencrypted ones
ipcMain.handle('list-backups', (event, id) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .map(f => ({ f, m: f.match(BACKUP_NAME) }))
      .filter(({ f, m }) => m && (f.startsWith('marduk-') || (PROFILE_ID.test(String(id)) && f.startsWith(`nexora-${id}-`))))
      .map(({ f, m }) => ({ name: f, date: m[2] || m[3], legacy: f.startsWith('marduk-'), sizeKb: Math.round(fs.statSync(path.join(BACKUP_DIR, f)).size / 1024) }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.legacy - b.legacy);
  } catch (e) { return []; }
});

ipcMain.handle('read-backup', (event, name) => {
  try {
    // Only allow reading files that match the backup naming pattern (no path tricks)
    if (!BACKUP_NAME.test(String(name))) return null;
    return readIfExists(path.join(BACKUP_DIR, name));
  } catch (e) { return null; }
});

// ── AI key (Anthropic API — optional, enables AI payslip parsing) ─────────────
// Stored locally in userData like the password — never synced to Google Drive.
function getAiKey() {
  try {
    if (fs.existsSync(AI_KEY_FILE)) {
      const k = fs.readFileSync(AI_KEY_FILE, 'utf8').trim();
      if (k.startsWith('sk-ant-')) return k;
    }
  } catch (e) {}
  return null;
}

ipcMain.handle('get-ai-key-status', () => {
  const k = getAiKey();
  return k ? `sk-ant-…${k.slice(-4)}` : null; // masked — full key never leaves main process
});

ipcMain.handle('set-ai-key', (event, key) => {
  key = String(key || '').trim();
  if (!key.startsWith('sk-ant-') || key.length < 20) {
    return { ok: false, error: 'That does not look like an Anthropic API key — it should start with "sk-ant-".' };
  }
  try { fs.writeFileSync(AI_KEY_FILE, key, 'utf8'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('clear-ai-key', () => {
  try { if (fs.existsSync(AI_KEY_FILE)) fs.unlinkSync(AI_KEY_FILE); return true; }
  catch (e) { return false; }
});

// ── Yahoo Finance shared infrastructure ───────────────────────────────────────
// Yahoo's v10/quoteSummary endpoint now requires a crumb token obtained via their
// consent flow. We fetch it once, cache it for 1 hour, and auto-refresh on 401.
//
// Yahoo answers HTTP 429 to a full desktop-Chrome User-Agent that arrives without
// a browser's cookies — it reads as a scraper posing as Chrome. Checked
// 2026-10-24: search, chart, getcrumb and quoteSummary all refused the Chrome
// string this constant used to hold, and all answered a bare one, from the same
// machine at the same moment. Every refresh was reported as "Rate limited" while
// nothing was actually being rate-limited.
const YAHOO_UA = 'Mozilla/5.0';
let _yahooMeta = { crumb: null, cookies: null, fetchedAt: 0 };

async function ensureYahooCrumb(force = false) {
  const HOUR = 3_600_000;
  if (!force && _yahooMeta.crumb && Date.now() - _yahooMeta.fetchedAt < HOUR) return;
  try {
    // Step 1: session cookies. fc.yahoo.com answers a tiny 404 that carries the
    // A3 cookie. The finance.yahoo.com homepage sends response headers larger
    // than Node's 16 KB limit, so fetch() threw before a cookie was read and
    // company data, analyst consensus and earnings dates went without a crumb.
    // The homepage stays as the fallback. Accept-Language: en-US avoids being
    // served a GDPR consent page (which wouldn't set the needed cookie).
    let cookieStr = '';
    for (const src of ['https://fc.yahoo.com/', 'https://finance.yahoo.com/']) {
      try {
        const r1 = await yfetch(src, {
          'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        });
        if (typeof r1.headers.getSetCookie === 'function') {
          // Node 18+ / undici: returns an array of Set-Cookie values
          cookieStr = r1.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
        } else {
          const raw = r1.headers.get('set-cookie') || '';
          cookieStr = raw.split(/,(?=\s*\w+=)/).map(c => c.trim().split(';')[0]).join('; ');
        }
        if (cookieStr) break;
      } catch (e) {
        if (e instanceof RateLimited) throw e;
        console.warn('[Yahoo] Cookie source failed:', src, e.cause?.code || e.message);
      }
    }
    // Step 2: exchange cookies for a crumb token
    const r2 = await yfetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      'Accept':          'text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie':          cookieStr,
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
    if (e instanceof RateLimited) throw e;   // let the caller stop, not carry on crumb-less
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
      const res  = await yfetch(url, { 'Referer': 'https://finance.yahoo.com/', 'Accept-Language': 'en-US,en;q=0.9', ...cookieHdr });
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
      if (e instanceof RateLimited) throw e;
      console.error(`[Yahoo] quoteSummary attempt ${attempt + 1} for ${ticker}:`, e.message);
    }
  }
  return null;
}

// ── Ticker resolution + auth-free Yahoo helpers ──────────────────────────────
// Non-US tickers need an exchange suffix on Yahoo Finance (e.g. EDP → EDP.LS,
// SXR8 → SXR8.DE). fetchV8Chart() tries the bare ticker then common EU suffixes,
// caching the successful form so all subsequent calls use it automatically.
const EU_EXCHANGE_SUFFIXES = ['.DE','.LS','.PA','.AS','.MI','.MC','.L','.SW','.ST','.CO','.OL','.HE','.BR','.VI','.PR','.WA'];

// Bare ticker → the Yahoo symbol that answered (EDP → EDP.LS). Kept on disk:
// it used to live in memory only, so every launch re-probed up to 16 suffixes
// per European holding — exactly the request bursts that got the IP throttled.
const TICKERS_FILE = path.join(app.getPath('userData'), 'nexora-tickers.json');
const _tickerResolutionCache = new Map(Object.entries((() => {
  try { return JSON.parse(fs.readFileSync(TICKERS_FILE, 'utf8')) || {}; } catch (e) { return {}; }
})()));
// Tickers no suffix resolved, with when — a delisted or mistyped symbol would
// otherwise cost 17 requests on every refresh. Session-only, retried after 6h.
const _unresolvable = new Map();
const UNRESOLVABLE_TTL = 6 * 60 * 60 * 1000;
let _tickersSaveTimer = null;

function _saveTickerCache() {
  clearTimeout(_tickersSaveTimer);
  _tickersSaveTimer = setTimeout(() => {
    try { fs.writeFileSync(TICKERS_FILE, JSON.stringify(Object.fromEntries(_tickerResolutionCache))); } catch (e) {}
  }, 2000);
}
function rememberResolution(ticker, sym) {
  _unresolvable.delete(ticker);
  if (sym === ticker || _tickerResolutionCache.get(ticker) === sym) return;
  _tickerResolutionCache.set(ticker, sym);
  _saveTickerCache();
}
function forgetResolution(ticker) {
  if (_tickerResolutionCache.delete(ticker)) _saveTickerCache();
}
function getResolvedTicker(ticker) {
  return _tickerResolutionCache.get(ticker) || ticker;
}

// Yahoo symbols worth trying for a ticker, cheapest first.
function symbolCandidates(ticker) {
  const known = _tickerResolutionCache.get(ticker);
  if (known) return [known];
  // US class shares: the NASDAQ directory and many brokers write BRK.B, Yahoo
  // writes BRK-B. A single letter A–C after the dot is a share class, never an
  // exchange suffix.
  if (/^[A-Z]{1,5}\.[A-C]$/.test(ticker)) return [ticker.replace('.', '-'), ticker];
  // Already a full Yahoo symbol: exchange suffix, crypto pair, FX pair or index
  if (/[.\-=^]/.test(ticker)) return [ticker];
  const miss = _unresolvable.get(ticker);
  if (miss && Date.now() - miss < UNRESOLVABLE_TTL) return [ticker];
  return [ticker, ...EU_EXCHANGE_SUFFIXES.map(s => ticker + s)];
}

// Runs `fetchOne(sym)` over the candidates until one answers (non-null). A
// remembered symbol that stops answering is forgotten and probed afresh once.
// RateLimited thrown inside propagates — a 429 is never mistaken for "ticker
// not found", which is what used to turn one refused request into seventeen.
async function withResolution(ticker, fetchOne) {
  let cands = symbolCandidates(ticker);
  for (let pass = 0; pass < 2; pass++) {
    for (const sym of cands) {
      const value = await fetchOne(sym);
      if (value != null) { rememberResolution(ticker, sym); return { value, sym }; }
    }
    if (pass === 0 && _tickerResolutionCache.has(ticker)) {
      forgetResolution(ticker);
      cands = symbolCandidates(ticker);
      continue;
    }
    break;
  }
  if (cands.length > 1) _unresolvable.set(ticker, Date.now());
  return { value: null, sym: ticker };
}

// v8/chart for a ticker, resolving its exchange suffix. Returns { result, resolvedTicker }.
async function fetchV8Chart(ticker, params = 'interval=1d&range=1y') {
  const { value, sym } = await withResolution(ticker, async s => {
    const res = await yfetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?${params}`);
    if (!res.ok) return null;
    let json; try { json = await res.json(); } catch (e) { return null; }
    const result = json?.chart?.result?.[0];
    return result?.meta?.regularMarketPrice ? result : null;
  });
  return { result: value, resolvedTicker: sym };
}

// Yahoo v7/quote — market cap, P/E, beta, dividends. It now answers 401 without
// a crumb, and it used to be probed across 16 suffixes × 2 hosts = 34 requests
// per unresolved European ticker, every one of them refused. One request on the
// already-resolved symbol, with the crumb; the v8 path does the resolving.
// NOTE: no &fields= parameter — it is non-standard for v7 and causes errors on
// some Yahoo endpoints, especially for non-US symbols.
async function yahooV7Quote(ticker) {
  const sym = getResolvedTicker(ticker);
  await ensureYahooCrumb();
  const crumb = _yahooMeta.crumb ? `&crumb=${encodeURIComponent(_yahooMeta.crumb)}` : '';
  const res = await yfetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}${crumb}`, {
    'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'application/json',
    ...(_yahooMeta.cookies ? { Cookie: _yahooMeta.cookies } : {}),
  });
  if (!res.ok) return null;
  let json; try { json = await res.json(); } catch (e) { return null; }
  const q = json?.quoteResponse?.result?.[0];
  return q?.regularMarketPrice ? q : null;
}

// Fetch dividend payment history from v8/chart events (public, no auth needed).
// Returns { dps, dividendYield, exDivDate } computed from payments in the last
// 12 months. Works for any ticker Yahoo tracks — no crumb/cookie required.
async function fetchDividendEvents(ticker) {
  const sym = getResolvedTicker(ticker);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?events=dividends&interval=3mo&range=3y`;
    const res = await yfetch(url);
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

// ── Historical dividend events (for the automatic received-dividends log) ────
// Returns per ticker the actual per-share payments Yahoo recorded:
//   { TICKER: { currency, events: [{ date: 'YYYY-MM-DD', amount }] } }
ipcMain.handle('fetch-dividend-history', async (event, tickers) => {
  const results = {};
  await mapLimit(tickers || [], 3, async ticker => {
    try {
      const sym = getResolvedTicker(ticker);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?events=dividends&interval=1mo&range=10y`;
      const res = await yfetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      const divObj = result?.events?.dividends;
      if (!divObj || !Object.keys(divObj).length) return;
      const events = Object.values(divObj)
        .filter(d => d && d.date && d.amount > 0)
        .map(d => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount }))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (events.length) results[ticker] = { currency: result.meta?.currency || 'USD', events };
    } catch (e) {}
  });
  return results;
});

// ── Sector data via Yahoo Finance quoteSummary ───────────────────────────────
ipcMain.handle('fetch-sectors', async (event, tickers) => {
  const entries = await mapLimit(tickers || [], 3, async ticker => {
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
  });
  const result = {};
  for (const [t, obj] of entries) {
    if (obj.sector || obj.logoUrl) result[t] = obj;
  }
  return result;
});

// ── Ticker search via Yahoo Finance autocomplete API ─────────────────────────
const _searchCache = new Map(); // query → results, so a repeat lookup costs nothing

ipcMain.handle('search-tickers', async (event, query) => {
  const key = String(query || '').trim().toUpperCase();
  if (_searchCache.has(key)) return _searchCache.get(key);
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&listsCount=0`;
    const res = await yfetch(url);
    const data = await res.json();
    const quotes = data?.quotes || [];
    const out = quotes
      .filter(q => q.symbol && q.quoteType)
      .map(q => ({
        t: q.symbol,
        n: q.longname || q.shortname || q.symbol,
        c: q.quoteType === 'ETF' ? 'ETF/Fund'
           : q.quoteType === 'CRYPTOCURRENCY' ? 'Crypto'
           : q.quoteType === 'MUTUALFUND' ? 'ETF/Fund'
           : 'Stock'
      }));
    if (out.length) _searchCache.set(key, out);
    return out;
  } catch (e) {
    // `null` means "couldn't ask" — distinct from `[]`, "asked, nothing found".
    // The dropdown used to show an empty list for both, so a rate-limited search
    // looked identical to an unknown ticker.
    return (e instanceof RateLimited) ? null : [];
  }
});

// ══════════════ SYMBOL DIRECTORY ══════════════
// The renderer's built-in TICKER_DB holds ~300 large caps, so most real
// portfolios contain symbols it has never heard of — and when Yahoo's live
// search is rate-limited, autocomplete had nothing to fall back on and looked
// like "Nexora doesn't know this ticker".
//
// NASDAQ Trader publishes the official directory of every US-listed security as
// plain pipe-delimited text: free, no key, no rate limit, ~13k symbols. Cached
// on disk and refreshed weekly, so search works offline and instantly.
const SYMBOLS_FILE = path.join(app.getPath('userData'), 'nexora-symbols.json');
const SYMBOLS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function _cleanSecurityName(name) {
  return String(name)
    // ADR wording varies ("- American Depositary Shares", "American depositary
    // shares, each representing…"), so cut from the phrase itself, dash or not
    .replace(/\s*[-,]?\s*American [Dd]epositar(y|ies).*$/i, '')
    .replace(/\s*-\s*(Common Stock|Class [A-Z] (Common Stock|Ordinary Shares)|Ordinary Shares).*$/i, '')
    .replace(/\s*(Common Stock|Common Shares)$/i, '')
    .trim();
}

// NASDAQ writes share classes as BRK.B; Yahoo — and so every price lookup —
// needs BRK-B. Picking BRK.B from the dropdown used to give a holding that
// never received a price.
function _yahooClassSymbol(t) {
  return /^[A-Z]{1,5}\.[A-C]$/.test(t) ? t.replace('.', '-') : t;
}

// Both files are `header\nrows…\nFile Creation Time: …`
function _parseSymbolFile(text, symbolCol, nameCol, etfCol, testCol) {
  const out = [];
  const lines = text.split('\n').slice(1);
  for (const line of lines) {
    if (!line || line.startsWith('File Creation Time')) continue;
    const f = line.split('|');
    if (f.length <= Math.max(symbolCol, nameCol, etfCol, testCol)) continue;
    if (f[testCol] === 'Y') continue;                       // test issues aren't tradable
    const t = (f[symbolCol] || '').trim();
    if (!t || /[^A-Z0-9.\-]/.test(t)) continue;
    out.push({ t: _yahooClassSymbol(t), n: _cleanSecurityName(f[nameCol]), c: f[etfCol] === 'Y' ? 'ETF/Fund' : 'Stock' });
  }
  return out;
}

async function buildSymbolDirectory() {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  // Plain fetch, not yfetch — this isn't Yahoo, and a failure here must not
  // trip the Yahoo cooldown.
  const [nasdaq, other] = await Promise.all([
    fetch('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt', { headers: { 'User-Agent': UA } }).then(r => r.text()),
    fetch('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt',  { headers: { 'User-Agent': UA } }).then(r => r.text())
  ]);
  //                                          symbol name etf test
  const list = [ ..._parseSymbolFile(nasdaq, 0, 1, 6, 3),
                 ..._parseSymbolFile(other,  0, 1, 4, 6) ];
  const seen = new Set();
  const dedup = list.filter(s => !seen.has(s.t) && seen.add(s.t));
  if (dedup.length < 1000) throw new Error('symbol directory looks truncated: ' + dedup.length);
  return dedup;
}

ipcMain.handle('get-symbol-directory', async () => {
  try {
    const cached = JSON.parse(fs.readFileSync(SYMBOLS_FILE, 'utf8'));
    // Mapped on read too, so a cache written before the BRK.B fix is corrected
    if (cached && Date.now() - cached.fetchedAt < SYMBOLS_TTL_MS && cached.list?.length)
      return cached.list.map(s => ({ ...s, t: _yahooClassSymbol(s.t) }));
  } catch(e) {}
  try {
    const list = await buildSymbolDirectory();
    fs.writeFileSync(SYMBOLS_FILE, JSON.stringify({ fetchedAt: Date.now(), list }));
    return list;
  } catch(e) {
    console.error('symbol directory failed:', e.message);
    // Stale cache beats nothing
    try { return JSON.parse(fs.readFileSync(SYMBOLS_FILE, 'utf8')).list || []; } catch(e2) { return []; }
  }
});

// ── Historical ECB rates for a date range, every currency in one request ─────
// Free, no key, no rate limit, and the official rates Portuguese tax reporting
// uses. Returns { CUR: { 'YYYY-MM-DD': unitsPerEUR } } for business days only;
// callers walk back over weekends/holidays. Throws on failure — never a guess.
const _fxHistCache = new Map();
async function ecbHistory(currencies, from, to) {
  const curs = [...new Set((currencies || []).filter(c => /^[A-Z]{3}$/.test(c) && c !== 'EUR'))].sort();
  if (!curs.length) return {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('bad date range');
  const key = `${curs.join('+')}|${from}|${to}`;
  if (_fxHistCache.has(key)) return _fxHistCache.get(key);
  const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${curs.join('+')}.EUR.SP00.A`
            + `?startPeriod=${from}&endPeriod=${to}&format=csvdata&detail=dataonly`;
  const res = await fetch(url, { headers: { 'User-Agent': FX_UA, 'Accept': 'text/csv' } });
  if (!res.ok) throw new Error('ECB HTTP ' + res.status);
  // CRLF line endings — splitting on \n alone leaves "OBS_VALUE\r" in the header
  const lines = (await res.text()).trim().split(/\r?\n/);
  const head  = lines.shift().split(',');
  const iCur = head.indexOf('CURRENCY'), iDate = head.indexOf('TIME_PERIOD'), iVal = head.indexOf('OBS_VALUE');
  if (iCur < 0 || iDate < 0 || iVal < 0) throw new Error('ECB: unexpected format');
  const out = {};
  for (const line of lines) {
    const f = line.split(',');
    const v = parseFloat(f[iVal]);
    if (!(v > 0)) continue;
    (out[f[iCur]] ||= {})[f[iDate]] = v;
  }
  _fxHistCache.set(key, out);
  return out;
}

const _isoDaysBefore = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

// Holdings CSV import: every lot's rate in one request
ipcMain.handle('fetch-fx-history', async (event, { currencies, from, to }) => {
  try { return await ecbHistory(currencies, from, to); }
  catch (e) { return { error: e.message || String(e) }; }
});

// ── Historical FX rate for a single date (Add Holding) ────────────────────────
// Units of `fromCurrency` per 1 EUR on `date` (USD → 1.09), the last published
// rate on or before it. ECB first; Yahoo only if the ECB is unreachable; `null`
// when neither answers, and the caller refuses rather than storing a foreign
// price as if it were euros — which is what happened before.
ipcMain.handle('fetch-fx-rate', async (event, { date, fromCurrency }) => {
  if (!fromCurrency || fromCurrency === 'EUR') return 1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  try {
    const map = (await ecbHistory([fromCurrency], _isoDaysBefore(date, 10), date))[fromCurrency] || {};
    const best = Object.keys(map).filter(d => d <= date).sort().pop();
    if (best) return map[best];
  } catch (e) { console.error('ECB rate failed:', e.message); }
  try {
    const t = Math.floor(new Date(date + 'T12:00:00Z').getTime() / 1000);
    const res = await yfetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(`EUR${fromCurrency}=X`)}?interval=1d&period1=${t - 86400 * 10}&period2=${t + 86400}`);
    const r = (await res.json())?.chart?.result?.[0];
    const ts = r?.timestamp || [], cl = r?.indicators?.quote?.[0]?.close || [];
    for (let i = ts.length - 1; i >= 0; i--) if (cl[i] != null && ts[i] <= t + 43200) return cl[i];
  } catch (e) {}
  return null;
});

// ══════════════ YAHOO REQUEST DISCIPLINE ══════════════
// Yahoo rate-limits hard, and the app used to make that worse in two ways:
//   1. `fetchYahooQuote` couldn't tell "no such ticker" from HTTP 429 — both
//      returned null — so a rate-limited symbol fell through to probing 13
//      exchange suffixes. One refused request became 14.
//   2. Every holding was fetched at once via Promise.all. 15 holdings × 14
//      attempts ≈ 210 near-simultaneous requests, guaranteeing more 429s.
// The result looked like "prices are wrong": stale values with nothing on
// screen to say the fetch had failed.
class RateLimited extends Error {}
let _yfCooldownUntil = 0;

// Every Yahoo request goes through here — prices, history, dividends, company
// data, search, the crumb. Before 1.0.43 only prices and search did, so the
// history charts and dividend fetches kept hammering Yahoo while the price
// refresh politely backed off, and still got refused.
async function yfetch(url, headers = {}) {
  if (Date.now() < _yfCooldownUntil) throw new RateLimited('cooling down');
  const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA, ...headers } });
  if (res.status === 429) {
    _yfCooldownUntil = Date.now() + 90 * 1000; // stop asking for a while
    throw new RateLimited('HTTP 429');
  }
  return res;
}

// Bounded concurrency — a few in flight at a time, never the whole portfolio
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// ══════════════ LIVE FX RATE TABLE ══════════════
// Every foreign holding's EUR value depends on this. It used to be a single
// Yahoo call for EUR/USD that silently fell back to a hardcoded 1.08 — so a
// rate-limited request (Yahoo 429s readily) quietly overvalued every USD
// position by ~6%, with nothing on screen to say so.
//
// Source order: ECB → Yahoo → last known good → nothing. A stale *real* rate is
// a defensible approximation; an invented one is not. If every source fails the
// price is left un-updated rather than converted at a guess.
const FX_CACHE_FILE = path.join(app.getPath('userData'), 'nexora-fx.json');
const FX_TTL_MS     = 12 * 60 * 60 * 1000; // ECB publishes once a day (~16:00 CET)
const FX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
let _fxMem = null; // { rates, date, source, fetchedAt, stale }

function _readFxCache() { try { return JSON.parse(fs.readFileSync(FX_CACHE_FILE, 'utf8')); } catch(e) { return null; } }
function _writeFxCache(o) { try { fs.writeFileSync(FX_CACHE_FILE, JSON.stringify(o)); } catch(e) {} }

// ECB daily reference rates — free, no key, no rate limit, every currency in one
// request. Also the rates Portuguese tax reporting uses.
async function _fxFromEcb() {
  const res = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', { headers: { 'User-Agent': FX_UA } });
  if (!res.ok) throw new Error('ECB HTTP ' + res.status);
  const xml   = await res.text();
  const rates = { EUR: 1 };
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) rates[m[1]] = parseFloat(m[2]);
  if (Object.keys(rates).length < 2) throw new Error('ECB: no rates parsed');
  return { rates, date: (xml.match(/time=['"]([\d-]+)['"]/) || [])[1] || null, source: 'ECB' };
}

// Fallback: Yahoo, EUR/USD only (all this app had before)
async function _fxFromYahoo() {
  const res = await yfetch('https://query1.finance.yahoo.com/v8/finance/chart/EURUSD%3DX?interval=1d&range=1d');
  if (!res.ok) throw new Error('Yahoo FX HTTP ' + res.status);
  const rate = (await res.json())?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!rate) throw new Error('Yahoo FX: no rate');
  return { rates: { EUR: 1, USD: rate }, date: new Date().toISOString().slice(0, 10), source: 'Yahoo' };
}

async function getFxRates() {
  if (_fxMem && !_fxMem.stale && Date.now() - _fxMem.fetchedAt < FX_TTL_MS) return _fxMem;

  const disk = _readFxCache();
  if (disk && Date.now() - disk.fetchedAt < FX_TTL_MS) { _fxMem = { ...disk, stale: false }; return _fxMem; }

  for (const src of [_fxFromEcb, _fxFromYahoo]) {
    try {
      _fxMem = { ...(await src()), fetchedAt: Date.now(), stale: false };
      _writeFxCache(_fxMem);
      return _fxMem;
    } catch(e) { console.error('FX source failed:', e.message); }
  }

  const last = disk || _fxMem;                        // last known good, however old
  if (last) { _fxMem = { ...last, stale: true }; return _fxMem; }
  return null;                                        // never invent a rate
}

// The renderer had its own hardcoded copy of this table (js/actions.js FX_RATES,
// frozen at USD 1.08) used for display currency, cash and dividend conversion.
// One source of truth instead.
ipcMain.handle('get-fx-rates', async () => {
  const fx = await getFxRates();
  return fx ? { rates: fx.rates, source: fx.source, date: fx.date, stale: !!fx.stale } : null;
});

// Native price → EUR. Returns null when the rate is unknown, so callers can skip
// the holding instead of showing a wrong number.
function priceToEur(price, currency, fx) {
  if (!currency || currency === 'EUR') return price;
  if (currency === 'GBp') {                            // LSE quotes in pence
    const gbp = fx?.rates?.GBP;
    return gbp ? price / 100 / gbp : null;
  }
  const rate = fx?.rates?.[currency];
  return rate ? price / rate : null;
}

// ── Dividend + earnings data ───────────────────────────────────────────────────
// Primary source: v7/quote (no auth, handles EU tickers via suffix resolution).
// Supplement: quoteSummary for calendarEvents (earnings dates, ex-div).
ipcMain.handle('fetch-dividends', async (event, tickers) => {
  const ts2date = ts => (ts && ts > 0) ? new Date(ts * 1000).toISOString().slice(0, 10) : null;
  const rv = (obj, key) => { const v = obj?.[key]; if (v == null) return null; return (typeof v === 'object' && 'raw' in v) ? v.raw : v; };

  const entries = await mapLimit(tickers || [], 3, async ticker => {
      try {
        // Run v7/quote and quoteSummary in parallel
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

        // `dps` is in the listing's own currency (USD for AAPL) — the renderer
        // converts it; it used to be shown with a € sign as if it were euros.
        const currency = v7Data?.currency || null;
        return [ticker, { dps, currency, forwardYield, trailingYield, exDivDate, nextPayDate, nextEarningsDate, earningsDateEnd }];
      } catch(e) {
        if (!(e instanceof RateLimited)) console.error('[fetch-dividends] Error for', ticker, ':', e.message);
        return [ticker, null];
      }
  });

  const results = {};
  for (const [ticker, data] of entries) if (data) results[ticker] = data;
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
      // The currency the price is quoted in. Was financialCurrency first — the
      // currency the company *reports* in — so NIO, quoted in USD but reporting
      // in CNY, showed its dollar price labelled as yuan.
      currency:    meta.currency || v7?.currency || null,
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

  // A few at a time: the Overview asks for three ranges of every holding at
  // once, which used to be ~50 simultaneous requests for 15 holdings.
  const results = {};
  let refused = false;
  await mapLimit(tickers || [], 3, async ticker => {
    try {
      // fetchV8Chart resolves exchange suffix (e.g. SXR8 → SXR8.DE, EDP → EDP.LS)
      const { result } = await fetchV8Chart(ticker, `interval=${interval}&range=${range}`);
      if (!result) return;
      const timestamps = result.timestamp;
      const closes     = result.indicators?.quote?.[0]?.close;
      const currency   = result.meta?.currency;
      if (timestamps && closes) results[ticker] = { timestamps, closes, currency };
    } catch(e) {
      if (e instanceof RateLimited) refused = true;
      else console.error('fetch-history error', ticker, e);
    }
  });

  // A partial answer from a rate-limited run must not be cached for 15 minutes
  if (!refused) _histCache.set(cacheKey, { data: results, ts: Date.now() });
  return results;
});

// ── Stock splits ──────────────────────────────────────────────────────────────
// Split events for each ticker since its first lot, plus Yahoo's split-adjusted
// close on each lot date. The renderer compares a lot's recorded price with
// that close to tell whether the lot was entered before the split (needs
// adjusting) or already in post-split terms (as broker exports usually are).
// Input: [{ ticker, from: 'YYYY-MM-DD', dates: ['YYYY-MM-DD', …] }]
ipcMain.handle('fetch-splits', async (event, items) => {
  const data = {};
  let rateLimited = false;
  const iso = ts => new Date(ts * 1000).toISOString().slice(0, 10);
  await mapLimit(items || [], 3, async ({ ticker, from, dates }) => {
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')) return;
      const p1 = Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000) - 7 * 86400;
      const p2 = Math.floor(Date.now() / 1000) + 86400;
      const { result } = await fetchV8Chart(ticker, `interval=1d&period1=${p1}&period2=${p2}&events=split`);
      if (!result) return;
      const splits = Object.values(result.events?.splits || {})
        .filter(s => s && s.date && s.numerator > 0 && s.denominator > 0 && s.numerator !== s.denominator)
        .map(s => ({ date: iso(s.date), ratio: s.numerator / s.denominator }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const bars = (result.timestamp || []).map((t, i) => [iso(t), result.indicators?.quote?.[0]?.close?.[i]])
        .filter(b => b[1] != null);
      const closeOn = {};
      for (const d of dates || []) {
        let c = null;
        for (const [bd, bc] of bars) { if (bd > d) break; c = bc; }   // last close on/before the lot
        if (c != null) closeOn[d] = c;
      }
      data[ticker] = { currency: result.meta?.currency || null, splits, closeOn };
    } catch (e) {
      if (e instanceof RateLimited) rateLimited = true;
    }
  });
  return { data, rateLimited };
});

// ── Price fetching via Yahoo Finance v8 chart endpoint (no crumb/cookie needed) ─
ipcMain.handle('fetch-prices', async (event, tickers) => {
  // 1. Live FX table (ECB → Yahoo → last known good → null; never a guess)
  const fx = await getFxRates();

  // One symbol → { price, … }, { fxMissing } when the symbol exists but its
  // currency has no rate, or null when Yahoo doesn't know the symbol. Throws
  // RateLimited on 429 so the caller stops instead of probing suffixes.
  async function fetchYahooQuote(symbol) {
    const res  = await yfetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    );
    let data; try { data = await res.json(); } catch (e) { return null; }
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    let price = meta.regularMarketPrice;
    // v8/chart meta rarely includes regularMarketChangePercent — when absent,
    // derive the day change from the previous session's close instead.
    let dayChangePct = meta.regularMarketChangePercent ?? null;
    if (dayChangePct == null) {
      const prev = meta.chartPreviousClose ?? meta.previousClose;
      if (prev > 0) dayChangePct = (meta.regularMarketPrice - prev) / prev * 100;
    }
    if (dayChangePct != null) dayChangePct = Math.round(dayChangePct * 100) / 100;

    // Convert whatever the exchange quotes in — not just USD, which is all this
    // handled before (a GBP or CHF holding was passed through as if it were EUR).
    const currency = meta.currency || 'EUR';
    const eur = priceToEur(price, currency, fx);
    // Rate unknown → leave the previous price alone. Not `null`: that would read
    // as "no such symbol" and send the lookup off probing exchange suffixes.
    if (eur == null) return { fxMissing: true };

    return {
      price: Math.round(eur * 10000) / 10000,
      dayChangePct,
      // Audit trail: which rate produced this number, so a wrong value can be
      // diagnosed after the fact instead of guessed at.
      priceNative: price,
      priceCurrency: currency,
      fxRate: currency === 'EUR' ? 1 : Math.round((price / eur) * 1000000) / 1000000
    };
  }

  // 2. Fetch tickers a few at a time (not all at once — see RateLimited above).
  //    Suffix resolution is shared with every other Yahoo call and remembered
  //    on disk, so a European holding is probed once ever, not once per launch.
  let rateLimited = false;
  const entries = await mapLimit(tickers || [], 3, async ticker => {
    try {
      const { value } = await withResolution(ticker, fetchYahooQuote);
      return [ticker, value && !value.fxMissing ? value : null];
    } catch (e) {
      if (e instanceof RateLimited) rateLimited = true;   // keep the previous price
      else console.error(`Price fetch error for ${ticker}:`, e);
    }
    return [ticker, null];
  });

  const result = {};
  for (const [ticker, data] of entries) {
    if (data !== null) result[ticker] = data;
  }
  // FX provenance for the renderer's staleness indicator. Carries no `.price`,
  // so the existing `if (data && data.price)` loop skips it harmlessly.
  result._fx = fx
    ? { source: fx.source, date: fx.date, stale: !!fx.stale, ageMs: Date.now() - fx.fetchedAt, rateLimited }
    : { source: null, date: null, stale: true, ageMs: null, rateLimited };
  return result;
});

// ══════════════ PAYSLIP PARSER ══════════════
function parsePayslipText(t) {
  // Smart number parser — handles European (1.234,56) and US/UK (1,234.56) formats
  // Rejects values that look like dates (years, months, MM/YYYY patterns)
  const ptNum = s => {
    if (!s) return null;
    s = s.trim().replace(/\s/g, '');
    // Reject year values (2000–2100)
    if (/^\d{4}$/.test(s) && +s >= 2000 && +s <= 2100) return null;
    // Reject bare month values (1–12 or 01–12 without decimals)
    if (/^(0?[1-9]|1[0-2])$/.test(s)) return null;
    // Reject date patterns like MM/YYYY, YYYY/MM, MM-YYYY
    if (/^(0?[1-9]|1[0-2])[\/\-]\d{4}$/.test(s)) return null;
    if (/^\d{4}[\/\-](0?[1-9]|1[0-2])$/.test(s)) return null;
    // European format: 1.234,56 or 1.234 or 500,00
    if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s)) return parseFloat(s.replace(/\./g,'').replace(',','.'));
    // US format: 1,234.56 or 1,234 or 500.00
    if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(s)) return parseFloat(s.replace(/,/g,''));
    const n = parseFloat(s.replace(/[^\d.]/g,''));
    return isNaN(n) ? null : n;
  };

  // Amount pattern — prefers values with decimal separator (monetary amounts)
  // Matches: 1.234,56 | 500,00 | 1,234.56 | 500.00 | 1234,5 | plain large numbers
  const A = '([\\d][\\d.]*,[\\d]{1,2}|[\\d][\\d,]*\\.[\\d]{1,2}|[\\d]{2,}(?![\\d\\/\\-]))';

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
    new RegExp(`vencimento\\s+bruto\\s*:?\\s*${A}`, 'i'),
    new RegExp(`gross\\s+(?:salary|pay|wage|earnings?)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`total\\s+(?:gross|earnings?)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`salario\\s+bruto\\s*:?\\s*${A}`, 'i'),
    new RegExp(`total\\s+devengado\\s*:?\\s*${A}`, 'i'),
    new RegExp(`salaire\\s+brut\\s*:?\\s*${A}`, 'i'),
    new RegExp(`bruttogehalt\\s*:?\\s*${A}`, 'i'),
    new RegExp(`bruttolohn\\s*:?\\s*${A}`, 'i'),
    new RegExp(`retribuzione\\s+lorda\\s*:?\\s*${A}`, 'i'),
    new RegExp(`totale\\s+competenze\\s*:?\\s*${A}`, 'i'),
    new RegExp(`\\bbruto\\s*:?\\s*${A}`, 'i'),
    new RegExp(`\\bgross\\s*:?\\s*${A}`, 'i'),
  );

  // ── Net salary ───────────────────────────────────────────────────────────
  const netRaw = first(
    new RegExp(`venc\\.?\\s*l[íi]q\\.?\\s*(?:impostos?)?\\s*:?\\s*${A}`, 'i'),
    new RegExp(`l[íi]quido\\s*a?\\s*(?:receber|pagar)?\\s*:?\\s*${A}`, 'i'),
    new RegExp(`net\\s+(?:salary|pay|wage|take[- ]home)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`total\\s+net\\s*:?\\s*${A}`, 'i'),
    new RegExp(`net\\s+(?:à\\s+payer|payé)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`salaire\\s+net\\s*:?\\s*${A}`, 'i'),
    new RegExp(`l[íi]quido\\s+a\\s+percibir\\s*:?\\s*${A}`, 'i'),
    new RegExp(`neto\\s+a\\s+percibir\\s*:?\\s*${A}`, 'i'),
    new RegExp(`nettogehalt\\s*:?\\s*${A}`, 'i'),
    new RegExp(`auszahlungsbetrag\\s*:?\\s*${A}`, 'i'),
    new RegExp(`netto\\s+(?:in\\s+busta|a\\s+pagare)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`totale\\s+netto\\s*:?\\s*${A}`, 'i'),
    new RegExp(`\\bnett?o\\s*:?\\s*${A}`, 'i'),
  );

  // ── Base salary ──────────────────────────────────────────────────────────
  const baseRaw = first(
    new RegExp(`venc\\.?\\s*base\\s*:?\\s*${A}`, 'i'),
    new RegExp(`base\\s+salary\\s*:?\\s*${A}`, 'i'),
    new RegExp(`basic\\s+(?:salary|pay)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`salario\\s+base\\s*:?\\s*${A}`, 'i'),
    new RegExp(`salaire\\s+de\\s+base\\s*:?\\s*${A}`, 'i'),
    new RegExp(`grundgehalt\\s*:?\\s*${A}`, 'i'),
    new RegExp(`retribuzione\\s+base\\s*:?\\s*${A}`, 'i'),
  );

  // ── Tax deduction ────────────────────────────────────────────────────────
  // EY legacy: sum /401+/403+/404 lines (most reliable for EY PT payslips)
  const irs401 = ptNum(t.match(/\/401\s[^\n]*([\d.,]{4,})\s*$/m)?.[1]) || 0;
  const irs403 = ptNum(t.match(/\/403\s[^\n]*([\d.,]{4,})\s*$/m)?.[1]) || 0;
  const irs404 = ptNum(t.match(/\/404\s[^\n]*([\d.,]{4,})\s*$/m)?.[1]) || 0;
  const irsFromLines = irs401 + irs403 + irs404;
  const taxRaw = first(
    new RegExp(`(?:reten[çc][aã]o\\s+)?irs\\s*:?\\s*${A}`, 'i'),
    new RegExp(`income\\s+tax\\s*:?\\s*${A}`, 'i'),
    new RegExp(`(?:paye|tax\\s+withheld)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`(?:retenci[oó]n\\s+)?irpf\\s*:?\\s*${A}`, 'i'),
    new RegExp(`lohnsteuer\\s*:?\\s*${A}`, 'i'),
    new RegExp(`irpef\\s*:?\\s*${A}`, 'i'),
    new RegExp(`ritenuta\\s+fiscale\\s*:?\\s*${A}`, 'i'),
  );

  // ── Social security ──────────────────────────────────────────────────────
  // EY legacy /350 line (most reliable)
  const ssLegacy = ptNum(t.match(/\/350\s[^\n]*([\d.,]{4,})\s*$/m)?.[1]);
  const ssRaw = first(
    new RegExp(`contrib\\.?\\s*(?:empregado\\s+)?(?:p\\/? ?)?ss\\s*[^\\d]*(${A.slice(1,-1)})`, 'i'),
    new RegExp(`seguran[çc]a\\s+social\\s*:?\\s*${A}`, 'i'),
    new RegExp(`(?:national\\s+insurance|ni\\b)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`social\\s+security\\s*:?\\s*${A}`, 'i'),
    new RegExp(`seguridad\\s+social\\s*:?\\s*${A}`, 'i'),
    new RegExp(`cotisations?\\s+salariales?\\s*:?\\s*${A}`, 'i'),
    new RegExp(`sozialversicherung\\s*:?\\s*${A}`, 'i'),
    new RegExp(`contributi?\\s+(?:inps|previdenziali?)\\s*:?\\s*${A}`, 'i'),
  );

  // ── Meal allowance ───────────────────────────────────────────────────────
  // EY legacy /430 line (most reliable)
  const mealLegacy = ptNum([...t.matchAll(/\/430\s[^\n]*([\d.,]{4,})\s*$/mg)]?.[0]?.[1]);
  const mealRaw = first(
    new RegExp(`cart[aã]o\\s+refei[çc][aã]o\\s*:?\\s*${A}`, 'i'),
    new RegExp(`meal\\s+(?:allowance|voucher)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`ticket\\s+(?:restaurant|repas|meal)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`vales?\\s+(?:de\\s+)?comida\\s*:?\\s*${A}`, 'i'),
    new RegExp(`buoni?\\s+pasto\\s*:?\\s*${A}`, 'i'),
  );

  // ── Holiday subsidy ──────────────────────────────────────────────────────
  // EY legacy /0171 line (most reliable)
  const holidayLegacy = ptNum(t.match(/0171\s[^\n]*([\d.,]{4,})\s*$/m)?.[1]);
  const holidayRaw = first(
    new RegExp(`doud[eé]cimo\\s+(?:de\\s+)?sub\\.?\\s*f[eé]rias\\s*:?\\s*${A}`, 'i'),
    new RegExp(`sub\\.?\\s*(?:de\\s+)?f[eé]rias\\s*:?\\s*${A}`, 'i'),
    new RegExp(`holiday\\s+(?:pay|allowance|bonus)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`vacation\\s+(?:pay|allowance)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`urlaubsgeld\\s*:?\\s*${A}`, 'i'),
  );

  // ── Christmas / year-end bonus ───────────────────────────────────────────
  // EY legacy /0172 line (most reliable)
  const christmasLegacy = ptNum(t.match(/0172\s[^\n]*([\d.,]{4,})\s*$/m)?.[1]);
  const christmasRaw = first(
    new RegExp(`doud[eé]cimo\\s+(?:de\\s+)?sub\\.?\\s*natal\\s*:?\\s*${A}`, 'i'),
    new RegExp(`sub\\.?\\s*(?:de\\s+)?natal\\s*:?\\s*${A}`, 'i'),
    new RegExp(`christmas\\s+(?:bonus|allowance)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`13\\.?\\s*(?:th\\s+)?(?:month|salary|salario)\\s*:?\\s*${A}`, 'i'),
    new RegExp(`weihnachtsgeld\\s*:?\\s*${A}`, 'i'),
    new RegExp(`tredicesima\\s*:?\\s*${A}`, 'i'),
    new RegExp(`aguinaldo\\s*:?\\s*${A}`, 'i'),
  );

  // ── Employer ─────────────────────────────────────────────────────────────
  // Try to extract the first meaningful company-like line after the header
  let employerRaw = first(
    /entidade\s+empregadora\s*:?\s*(.+)/i,   // PT formal
    /empregador\s*:?\s*(.+)/i,
    /employer\s*:?\s*(.+)/i,
    /empresa\s*:?\s*(.+)/i,
    /employeur\s*:?\s*(.+)/i,
    /arbeitgeber\s*:?\s*(.+)/i,
    /company\s*:?\s*(.+)/i,
    /RECIBO\s+DE\s+REMUNERA[ÇC][OÕ]ES\s*\n([^\n]+)/i,
  );
  // Fallback: first ALL-CAPS line that looks like a company name (≥4 chars)
  if (!employerRaw) {
    const capsLine = t.match(/^([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][A-ZÁÉÍÓÚÀÂÊÔÃÕÇ\s,\.&\-]{3,60})$/m);
    if (capsLine) employerRaw = capsLine[1];
  }

  // ── Function / job title ─────────────────────────────────────────────────
  const functionRaw = first(
    /fun[çc][aã]o\s*:?\s*(.+)/i,
    /categoria\s+profissional\s*:?\s*(.+)/i,
    /cargo\s*:?\s*(.+)/i,
    /job\s+(?:title|position)\s*:?\s*(.+)/i,
    /position\s*:?\s*(.+)/i,
    /poste\s*:?\s*(.+)/i,
    /stelle\s*:?\s*(.+)/i,
    /mansione\s*:?\s*(.+)/i,
  );

  const irsDeduction  = irsFromLines > 0 ? irsFromLines : (ptNum(taxRaw) || 0);
  const ssDeduction   = ssLegacy != null ? ssLegacy : (ptNum(ssRaw) || 0);
  const mealAllowance = mealLegacy != null ? mealLegacy : (ptNum(mealRaw) || 0);
  const holidaySubsidy   = holidayLegacy != null ? holidayLegacy : (ptNum(holidayRaw) || 0);
  const christmasSubsidy = christmasLegacy != null ? christmasLegacy : (ptNum(christmasRaw) || 0);

  return {
    period, periodLabel,
    grossSalary:      ptNum(grossRaw),
    netSalary:        ptNum(netRaw),
    baseSalary:       ptNum(baseRaw),
    ssDeduction,
    irsDeduction,
    mealAllowance,
    holidaySubsidy,
    christmasSubsidy,
    employer:         employerRaw?.trim().replace(/\s+/g,' ').slice(0,80) || null,
    functionTitle:    functionRaw?.trim().replace(/\s+/g,' ').slice(0,80) || null,
    // Legacy / EY-specific (kept for backwards compatibility)
    baseComp:         ptNum(baseRaw) || 0,
    hoursExemption:   ptNum(t.match(/0124\s[^\n]*([\d.,]{4,})\s*$/m)?.[1]) || 0,
    irsBase:          ptNum(t.match(/Base IRS:\s*([\d.,]+)/)?.[1]),
    ssBase:           ptNum(t.match(/Base SS:\s*([\d.,]+)/)?.[1]),
    totalAbonos:      ptNum(t.match(/TOTAIS\s+([\d.,]+)\s+[\d.,]+/)?.[1]),
    totalDescontos:   ptNum(t.match(/TOTAIS\s+[\d.,]+\s+([\d.,]+)/)?.[1]),
    ytdIRSBase:       ptNum(t.match(/Ac\. Base IRS:\s*([\d.,]+)/)?.[1]),
    ytdSSDeduction:   ptNum(t.match(/Ac\. Retenção SS:\s*([\d.,]+)/)?.[1]),
    ytdIRSDeduction:  ptNum(t.match(/Ac\. Retenção IRS:\s*([\d.,]+)/)?.[1]),
    department:       t.match(/Departamento:\s*(.+)/)?.[1]?.trim() || null,
    // The full extracted text used to ride along as `_rawText` and was saved
    // with the payslip into the data file on Google Drive — name, tax
    // number, address and all. Nothing ever read it back.
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

  const parsed = parsePayslipText(result.stdout);
  parsed._filePath = filePath;  // so the modal can render the PDF visually
  return parsed;
}

// ══════════════ AI PAYSLIP PARSER (optional) ══════════════
// Sends the PDF directly to Claude (vision) — works for any language, layout,
// or company, and does not need Python. Used only when an API key is set;
// otherwise (or on any failure) Nexora falls back to the regex parser above.

const PAYSLIP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['period','grossSalary','netSalary','baseSalary','mealAllowance',
             'irsDeduction','ssDeduction','holidaySubsidy','christmasSubsidy',
             'employer','functionTitle'],
  properties: {
    period:           { type: 'string', description: 'The month the payslip refers to, formatted YYYY-MM' },
    grossSalary:      { anyOf: [{ type: 'number' }, { type: 'null' }] },
    netSalary:        { anyOf: [{ type: 'number' }, { type: 'null' }] },
    baseSalary:       { anyOf: [{ type: 'number' }, { type: 'null' }] },
    mealAllowance:    { anyOf: [{ type: 'number' }, { type: 'null' }] },
    irsDeduction:     { anyOf: [{ type: 'number' }, { type: 'null' }] },
    ssDeduction:      { anyOf: [{ type: 'number' }, { type: 'null' }] },
    holidaySubsidy:   { anyOf: [{ type: 'number' }, { type: 'null' }] },
    christmasSubsidy: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    employer:         { anyOf: [{ type: 'string' }, { type: 'null' }] },
    functionTitle:    { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

const PAYSLIP_PROMPT = [
  'Extract the salary fields from this payslip PDF:',
  '- period: the month the payslip refers to, as "YYYY-MM".',
  '- grossSalary: total gross pay for the month (all earnings before deductions).',
  '- netSalary: the net amount actually paid to the employee.',
  '- baseSalary: the contractual base salary line (before extras and subsidies).',
  '- mealAllowance: meal allowance / meal card amount for the month.',
  '- irsDeduction: income tax withheld this month (IRS, IRPF, PAYE, Lohnsteuer, IRPEF...). Sum multiple income-tax lines if present.',
  '- ssDeduction: the EMPLOYEE social security contribution (never the employer part).',
  '- holidaySubsidy: holiday/vacation subsidy paid this month, including monthly twelfths (duodecimos).',
  '- christmasSubsidy: Christmas / 13th-month subsidy paid this month, including monthly twelfths.',
  '- employer: the company name.',
  "- functionTitle: the employee's job title / professional category.",
  'Use null for any field not present on the payslip. Amounts are plain numbers (e.g. 1234.56).',
].join('\n');

async function parsePayslipAI(filePath, apiKey) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const pdfData = fs.readFileSync(filePath).toString('base64');

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4096,          // thinking shares this budget — 2048 risked truncation
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: PAYSLIP_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfData } },
        { type: 'text', text: PAYSLIP_PROMPT },
      ],
    }],
  });

  if (response.stop_reason === 'refusal') throw new Error('AI declined to process this document');
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('AI returned no result');
  const r = JSON.parse(textBlock.text);

  // Normalise into the shape the payslip modal expects
  const now = new Date();
  const period = /^\d{4}-\d{2}$/.test(r.period || '')
    ? r.period
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, m] = period.split('-').map(Number);
  const MONTH_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return {
    period,
    periodLabel:      `${MONTH_EN[m - 1]} ${y}`,
    grossSalary:      r.grossSalary,
    netSalary:        r.netSalary,
    baseSalary:       r.baseSalary,
    mealAllowance:    r.mealAllowance    || 0,
    irsDeduction:     r.irsDeduction     || 0,
    ssDeduction:      r.ssDeduction      || 0,
    holidaySubsidy:   r.holidaySubsidy   || 0,
    christmasSubsidy: r.christmasSubsidy || 0,
    employer:         r.employer         || null,
    functionTitle:    r.functionTitle    || null,
    baseComp:         r.baseSalary || r.grossSalary || 0,
    hoursExemption:   0,
    _aiParsed:        true,
  };
}

// Hybrid entry point: AI first (if key configured), regex parser as fallback.
async function parsePayslipHybrid(filePath) {
  const key = getAiKey();
  if (key) {
    try {
      const parsed = await parsePayslipAI(filePath, key);
      parsed._filePath = filePath; // so the modal can render the PDF visually
      return parsed;
    } catch (e) {
      console.error('[AI] Payslip parse failed — falling back to pattern parser:', e.status || '', e.message);
    }
  }
  return parsePdfAtPath(filePath); // sets _filePath itself
}

// ── AI expense categorization ─────────────────────────────────────────────────
// Given an expense description + the user's category list, returns the best
// matching category name (or null). Only called when an AI key is configured.
ipcMain.handle('ai-categorize', async (event, { desc, categories }) => {
  const key = getAiKey();
  if (!key || !desc || !Array.isArray(categories) || !categories.length) return null;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key, maxRetries: 0 });
    const response = await client.messages.create({
      // Picking one item from a fixed list, constrained by an enum schema — the
      // easiest task here and the most frequent call. Haiku is ~5x cheaper and
      // faster, and the schema makes a wrong-shaped answer impossible.
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      output_config: { format: { type: 'json_schema', schema: {
        type: 'object', additionalProperties: false, required: ['category'],
        properties: { category: { type: 'string', enum: categories } },
      } } },
      messages: [{
        role: 'user',
        content: `Which spending category fits this expense best?\nExpense: "${desc}"\nPick exactly one of: ${categories.join(', ')}.\nNote: merchant names may be Portuguese (e.g. Continente/Pingo Doce = groceries, Galp/BP = fuel, Farmácia = pharmacy).`,
      }],
    });
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock ? JSON.parse(textBlock.text).category : null;
  } catch (e) {
    console.error('[AI] categorize failed (non-fatal):', e.status || '', e.message);
    return null;
  }
});

// ── AI monthly summary ────────────────────────────────────────────────────────
// Receives a compact JSON of pre-aggregated stats (no raw transactions) and
// returns a short written summary of the user's financial month.
ipcMain.handle('ai-monthly-summary', async (event, payload) => {
  const key = getAiKey();
  if (!key || !payload) return null;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key, maxRetries: 1 });
    const response = await client.messages.create({
      model: 'claude-opus-5',
      // Thinking and response text share max_tokens, and thinking is invisible
      // but still billed against it. At 2048 a long think left nothing for the
      // summary — the call "succeeded" with no text and the card stayed empty.
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },   // 4-6 sentences over pre-aggregated stats
      messages: [{
        role: 'user',
        content:
          'You are the assistant inside Nexora, a personal finance app. ' +
          'Write a short monthly financial summary for the user (4-6 sentences, plain text, no headers or bullet points). ' +
          'Be direct and specific with the numbers (euros). Mention: how spending compares to income and to last month, ' +
          'the biggest spending category, portfolio performance if present, and one encouraging or cautionary note at the end. ' +
          'Do not invent data not present below. Aggregated data:\n' + JSON.stringify(payload),
      }],
    });
    if (response.stop_reason === 'refusal') return { error: 'The request was declined.' };
    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock ? textBlock.text.trim() : '';
    if (!text) {
      return { error: response.stop_reason === 'max_tokens'
        ? 'Ran out of room before writing the summary.'
        : 'No summary came back.' };
    }
    return text;
  } catch (e) {
    // Was a silent null — every failure looked identical to "no summary yet"
    console.error('[AI] monthly summary failed:', e.status || '', e.message);
    return { error: e.status === 401 ? 'API key rejected — check Settings → AI.'
           : e.status === 429 ? 'Rate limited by the API — try again shortly.'
           : (e.message || 'Request failed') };
  }
});

// Dialog-based import (button click)
ipcMain.handle('parse-payslip', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Select Payslip PDF',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return null;
  return parsePayslipHybrid(filePaths[0]);
});

// Path-based import (drag-and-drop)
ipcMain.handle('parse-payslip-from-path', async (event, filePath) => {
  if (!filePath) return null;
  return parsePayslipHybrid(filePath);
});

// YYYY-MM-DD in local time. toISOString() converts to UTC first, so a date
// built at local midnight came out a day early whenever the clock was ahead of
// UTC — every summer day in Portugal.
function _localIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Bank statement: return the raw grid, nothing more ────────────────────────
// Read locally and handed to the renderer as-is. Header detection, column
// mapping and categorising all happen there, where they can be shown and
// corrected. Nothing is uploaded — a statement never leaves this machine.
ipcMain.handle('read-statement', async (event, droppedPath) => {
  let filePath = droppedPath;

  // A dragged file arrives with its path; only fall back to the dialog when
  // there isn't one. Previously a drop opened the picker, which meant dropping
  // a file asked you to go and find that same file.
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      return { fileName: path.basename(filePath), rows: [], error: 'File not found' };
    }
    if (!/\.(xlsx|xls|csv)$/i.test(filePath)) {
      // .numbers is Apple's own protobuf format, not a spreadsheet — and it is
      // the likeliest wrong file to drop, since opening a bank export in Numbers
      // and saving produces one. Say what to do, not just what is wrong.
      const isNumbers = /\.numbers$/i.test(filePath);
      return { fileName: path.basename(filePath), rows: [], error: isNumbers
        ? 'Numbers files can\'t be read directly.\n\nIn Numbers: File → Export To → CSV…\nOr use the original .csv / .xlsx your bank gave you — it is often saved in the same folder.'
        : 'Needs a spreadsheet: .xlsx, .xls or .csv' };
    }
  } else {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Select Bank Statement',
      filters: [{ name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return null;
    filePath = filePaths[0];
  }
  const fileName = path.basename(filePath);

  try {
    if (/\.csv$/i.test(filePath)) {
      // Portuguese banks commonly emit ';' with a UTF-8 BOM
      let text = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
      const delim = (text.match(/;/g) || []).length > (text.match(/,/g) || []).length ? ';' : ',';
      const rows = text.split(/\r?\n/).filter(l => l.trim()).map(line => {
        // quote-aware split on the chosen delimiter
        const out = []; let cur = '', q = false;
        for (const ch of line) {
          if (ch === '"') q = !q;
          else if (ch === delim && !q) { out.push(cur); cur = ''; }
          else cur += ch;
        }
        out.push(cur);
        return out.map(c => c.trim());
      });
      return { fileName, rows };
    }

    const XLSX = require('xlsx');
    const wb = XLSX.readFile(filePath, { cellDates: true, raw: false });
    // Statements are single-sheet in practice; take the one with the most rows
    let best = [];
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
      if (rows.length > best.length) best = rows;
    }
    // A real date cell arrives as a Date, and String(Date) is "Tue Mar 05 2024
    // 00:00:00 GMT+0000…", which no date parser downstream recognised — so an
    // .xlsx with typed date cells imported zero rows. Hand over YYYY-MM-DD.
    const cell = c => c == null ? '' : (c instanceof Date ? _localIso(c) : String(c).trim());
    return { fileName, rows: best.map(r => r.map(cell)) };
  } catch (e) {
    return { fileName, rows: null, error: e.message };
  }
});
