// Nexora was called Marduk until 2.0. Its local folder — the old password file,
// the AI key, backups, caches and the window's saved settings — was
// "<appData>/marduk" (Electron names it after package.json "name") and is now
// "<appData>/nexora". On the first start the old folder is *copied* across,
// never moved, so nothing disappears. Plain Node, so it can be tested alone.
const fs = require('fs');
const path = require('path');

const MARKER = '.carried-over-from-marduk';
// Chromium caches and lock files are rebuilt on their own; copying them only costs time
const SKIP = /^(Cache|Code Cache|GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|blob_storage|Singleton.*|update-relaunch\.log)$/;

function carryOver(oldDir, newDir) {
  if (fs.existsSync(path.join(newDir, MARKER))) return { done: false, reason: 'already' };
  let copied = false;
  if (oldDir !== newDir && fs.existsSync(oldDir)) {
    fs.cpSync(oldDir, newDir, { recursive: true, force: false, errorOnExist: false, filter: src => !SKIP.test(path.basename(src)) });
    // its own files take their new names
    for (const f of ['ai-key.bin', 'tickers.json', 'symbols.json', 'fx.json']) {
      const from = path.join(newDir, 'marduk-' + f), to = path.join(newDir, 'nexora-' + f);
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
    }
    copied = true;
  }
  fs.mkdirSync(newDir, { recursive: true });
  fs.writeFileSync(path.join(newDir, MARKER), new Date().toISOString());
  return { done: copied };
}

module.exports = { carryOver, MARKER };
