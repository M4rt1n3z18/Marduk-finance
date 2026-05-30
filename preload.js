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
  fetchHistory:   (params)  => ipcRenderer.invoke('fetch-history', params),
  fetchDividends: (tickers) => ipcRenderer.invoke('fetch-dividends', tickers),
  fetchFxRate:    (params)  => ipcRenderer.invoke('fetch-fx-rate', params),

  // Ticker search
  searchTickers: (query) => ipcRenderer.invoke('search-tickers', query),

  // Sector data
  fetchSectors: (tickers) => ipcRenderer.invoke('fetch-sectors', tickers),

  // Rich company info for the detail modal
  fetchCompanyInfo: (ticker) => ipcRenderer.invoke('fetch-company-info', ticker),

  // Payslip PDF parser
  parsePayslip:         ()         => ipcRenderer.invoke('parse-payslip'),
  parsePayslipFromPath: (filePath) => ipcRenderer.invoke('parse-payslip-from-path', filePath),

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
