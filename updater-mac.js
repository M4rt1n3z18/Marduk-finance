// macOS update helpers — plain Node, no Electron, so they can be tested on their own.
//
// The app is about to change its name and its GitHub repository. Two things in
// the old updater could not survive that:
//   • it looked up releases by the repository's *name* and did not follow
//     redirects, so a renamed repo answered "Moved Permanently" and the check
//     quietly found nothing, forever;
//   • it installed only a DMG containing `MARDUK.app`, by that exact name.
// Releases are now looked up by the repository's numeric id (stable across
// renames, with the name kept as a redirect-following fallback), and the
// installer takes whatever app the DMG holds.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// GET a JSON document, following redirects (a renamed repo answers 301)
function getJson(url, headers = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? require('https') : require('http');
    mod.get(url, { headers }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(getJson(new URL(res.headers.location, url).toString(), headers, hops + 1));
      }
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode > 299) return reject(new Error(`GitHub HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// The latest release: by repository id first, then by name
async function latestRelease({ repoId, owner, repo, headers, api = 'https://api.github.com' }) {
  try { return await getJson(`${api}/repositories/${repoId}/releases/latest`, headers); }
  catch (e) { return getJson(`${api}/repos/${owner}/${repo}/releases/latest`, headers); }
}

// The app bundle at the top of a mounted DMG (not the Applications shortcut)
function findApp(volume, preferName) {
  const apps = fs.readdirSync(volume).filter(f => f.endsWith('.app') && fs.lstatSync(path.join(volume, f)).isDirectory());
  return apps.find(f => f === preferName) || apps[0] || null;
}

// Copy the DMG's app next to the running one. If the name changed (MARDUK.app →
// Nexora.app), the old bundle goes to the Trash so there aren't two apps. Data
// lives elsewhere (Application Support, Google Drive) and isn't touched.
function installApp({ volume, currentBundle, trashDir = path.join(os.homedir(), '.Trash') }) {
  const name = findApp(volume, path.basename(currentBundle));
  if (!name) return { error: 'The update doesn’t contain an app.' };
  const parent = path.dirname(currentBundle), newBundle = path.join(parent, name);
  const cp = spawnSync('cp', ['-Rf', path.join(volume, name), `${parent}/`], { timeout: 60000 });
  if (cp.status !== 0) return { error: `Could not copy the update into ${parent}. Check that the folder is writable, or install the update manually.` };
  spawnSync('xattr', ['-cr', newBundle], { timeout: 5000 });
  let replaced = null;
  if (newBundle !== currentBundle && fs.existsSync(currentBundle)) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const dest = path.join(trashDir, `${path.basename(currentBundle, '.app')} ${stamp}.app`);
    // If it can't be moved (Trash on another volume), the old app simply stays — never deleted outright
    try { fs.renameSync(currentBundle, dest); replaced = dest; } catch (e) {}
  }
  return { newBundle, replaced };
}

module.exports = { getJson, latestRelease, findApp, installApp };
