const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer (index.html)
contextBridge.exposeInMainWorld('electronAPI', {
  // Data
  saveData: (json) => ipcRenderer.invoke('save-data', json),
  loadData: () => ipcRenderer.invoke('load-data'),

  // Password
  getPw:   ()    => ipcRenderer.invoke('get-pw'),
  setPw:   (val) => ipcRenderer.invoke('set-pw', val),
  clearPw: ()    => ipcRenderer.invoke('clear-pw'),

  // Prices
  fetchPrices:   (tickers) => ipcRenderer.invoke('fetch-prices', tickers),
  getFxRates:    () => ipcRenderer.invoke('get-fx-rates'),
  fetchHistory:   (params)  => ipcRenderer.invoke('fetch-history', params),
  fetchDividends: (tickers) => ipcRenderer.invoke('fetch-dividends', tickers),
  fetchDividendHistory: (tickers) => ipcRenderer.invoke('fetch-dividend-history', tickers),
  fetchFxRate:    (params)  => ipcRenderer.invoke('fetch-fx-rate', params),

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
  listBackups: ()     => ipcRenderer.invoke('list-backups'),
  readBackup:  (name) => ipcRenderer.invoke('read-backup', name),

  // XTB Excel import
  importXtbExcel: () => ipcRenderer.invoke('import-xtb-excel'),

  // Logos (company favicons via Clearbit, from Yahoo assetProfile)
  // Note: logos are now bundled into fetch-sectors response

  // Info
  getDataPath: () => ipcRenderer.invoke('get-data-path'),

  // App version
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Auto-updater
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, version) => cb(version)),
  onUpdateProgress:  (cb) => ipcRenderer.on('update-progress',  (_, pct)     => cb(pct)),
  onUpdateDownloaded:(cb) => ipcRenderer.on('update-downloaded', ()           => cb()),
  installUpdate:     ()   => ipcRenderer.invoke('install-update'),
});
