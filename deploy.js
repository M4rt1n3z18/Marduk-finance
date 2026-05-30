// deploy.js — builds MARDUK and installs it directly into /Applications
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');

// Find the arm64 DMG (for Apple Silicon Macs)
const dmgFiles = fs.readdirSync(dist).filter(f => f.endsWith('arm64.dmg'));
if (!dmgFiles.length) {
  console.error('❌  No arm64 DMG found in dist/ — did the build finish?');
  process.exit(1);
}
const dmg = path.join(dist, dmgFiles[0]);
console.log('📦  Mounting', path.basename(dmg));

// Mount the DMG
const mountOutput = execSync(`hdiutil attach "${dmg}" -nobrowse`).toString();
const mountPoint  = mountOutput.trim().split('\n').pop().split('\t').pop().trim();
console.log('💿  Mounted at', mountPoint);

try {
  // Copy app to /Applications, replacing old version
  execSync(`cp -Rf "${mountPoint}/MARDUK.app" /Applications/`);
  console.log('✅  MARDUK.app updated in /Applications!');
} catch (err) {
  console.error('❌  Copy failed:', err.message);
} finally {
  execSync(`hdiutil detach "${mountPoint}" -quiet`);
  console.log('⏏️   DMG unmounted.');
}
