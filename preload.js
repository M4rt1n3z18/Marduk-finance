const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer (index.html)
contextBridge.exposeInMainWorld('electronAPI', {
  // Profiles — encrypted in the renderer; these only move the encrypted files
  profilesRead:  ()         => ipcRenderer.invoke('profiles-read'),
  profilesWrite: (json)     => ipcRenderer.invoke('profiles-write', json),
  profileRead:   (id)       => ipcRenderer.invoke('profile-read', id),
  profileWrite:  (id, json) => ipcRenderer.invoke('profile-write', id, json),
  profileRemove: (id)       => ipcRenderer.invoke('profile-remove', id),

  // Upgrade from Marduk 1.x (unencrypted data + password hash), once
  legacyStatus: () => ipcRenderer.invoke('legacy-status'),
  legacyRead:   () => ipcRenderer.invoke('legacy-read'),
  legacyRetire: () => ipcRenderer.invoke('legacy-retire'),

  // Prices
  fetchPrices:   (tickers) => ipcRenderer.invoke('fetch-prices', tickers),
  getFxRates:    () => ipcRenderer.invoke('get-fx-rates'),
  fetchHistory:   (params)  => ipcRenderer.invoke('fetch-history', params),
  fetchDividends: (tickers) => ipcRenderer.invoke('fetch-dividends', tickers),
  fetchDividendHistory: (tickers) => ipcRenderer.invoke('fetch-dividend-history', tickers),
  fetchFxRate:    (params)  => ipcRenderer.invoke('fetch-fx-rate', params),
  fetchFxHistory: (params)  => ipcRenderer.invoke('fetch-fx-history', params),
  fetchRiskFree:  (params)  => ipcRenderer.invoke('fetch-risk-free', params),
  fetchSplits:    (items)   => ipcRenderer.invoke('fetch-splits', items),

  // Ticker search
  searchTickers: (query) => ipcRenderer.invoke('search-tickers', query),
  getSymbolDirectory: () => ipcRenderer.invoke('get-symbol-directory'),

  // Sector data
  fetchSectors: (tickers) => ipcRenderer.invoke('fetch-sectors', tickers),

  // Rich company info for the detail modal
  fetchCompanyInfo: (ticker) => ipcRenderer.invoke('fetch-company-info', ticker),

  // Payslip PDF parser
  parsePayslip:         ()         => ipcRenderer.invoke('parse-payslip'),
  parsePayslipFromPath: (filePath) => ipcRenderer.invoke('parse-payslip-from-path', filePath),

  // AI features (optional — Anthropic API key, stored locally only)
  getAiKeyStatus:   ()        => ipcRenderer.invoke('get-ai-key-status'),
  setAiKey:         (key)     => ipcRenderer.invoke('set-ai-key', key),
  clearAiKey:       ()        => ipcRenderer.invoke('clear-ai-key'),
  aiCategorize:     (params)  => ipcRenderer.invoke('ai-categorize', params),
  aiMonthlySummary: (payload) => ipcRenderer.invoke('ai-monthly-summary', payload),

  // Automatic backups
  listBackups: (id)   => ipcRenderer.invoke('list-backups', id),
  readBackup:  (name) => ipcRenderer.invoke('read-backup', name),

  // Bank statement — filePath is set when the file was dragged in; omitted opens the picker
  readStatement: (filePath) => ipcRenderer.invoke('read-statement', filePath),
  // File.path works on Electron 29; webUtils is the replacement from 30 onward.
  // Exposed so drag-and-drop keeps working across an Electron upgrade.
  getPathForFile: (file) => { try { return require('electron').webUtils.getPathForFile(file); } catch(e) { return null; } },

  // App version
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Auto-updater
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, version) => cb(version)),
  onUpdateProgress:  (cb) => ipcRenderer.on('update-progress',  (_, pct)     => cb(pct)),
  onUpdateDownloaded:(cb) => ipcRenderer.on('update-downloaded', ()           => cb()),
  onUpdateError:     (cb) => ipcRenderer.on('update-error',     (_, msg)     => cb(msg)),
  installUpdate:     ()   => ipcRenderer.invoke('install-update'),
  checkForUpdates:   ()   => ipcRenderer.invoke('check-for-updates'),
});
