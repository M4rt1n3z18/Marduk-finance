// ══════════════ MONTHLY DYNAMICS CHART ══════════════
let _portDynamicsFetchId = 0;

async function buildPortDynamicsChart(preData) {
  const el      = document.getElementById('chart-port-dynamics');
  const emptyEl = document.getElementById('port-dynamics-empty');
  if (!el || !el.offsetParent) return;

  const holdings = ap().holdings || [];
  destroyChart('port-dynamics');

  if (!holdings.length) {
    if (emptyEl) emptyEl.style.display = 'block';
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  // Use pre-fetched data if provided (parallel fetch from buildPortHistoryChart).
  // Fall back to own fetch only when called directly (e.g. benchmark change).
  const dynFetchId = ++_portDynamicsFetchId;
  let dynData = preData || {};
  if (!preData && window.electronAPI?.fetchHistory) {
    const tickerSet = new Set(holdings.map(h => h.ticker));
    tickerSet.add('EURUSD=X');
    if (selectedBenchmarkTicker) tickerSet.add(selectedBenchmarkTicker);
    try {
      dynData = await window.electronAPI.fetchHistory({ tickers: [...tickerSet], interval: '1mo', range: '2y' });
    } catch(e) { console.error('buildPortDynamicsChart fetchHistory error', e); }
  }
  if (dynFetchId !== _portDynamicsFetchId) return;

  const dynFx = (dynData['EURUSD=X']?.timestamps || [])
    .map((t, i) => ({ t, c: dynData['EURUSD=X'].closes[i] }))
    .filter(x => x.c != null);

  const dynTimelines = {};
  for (const h of holdings) {
    const d = dynData[h.ticker];
    if (!d) continue;
    dynTimelines[h.ticker] = d.timestamps
      .map((t, i) => ({ t, c: d.closes[i] }))
      .filter(x => x.c != null);
  }

  const tsSet = new Set();
  for (const tl of Object.values(dynTimelines)) tl.forEach(x => tsSet.add(x.t));
  const sortedTs = [...tsSet].sort((a, b) => a - b);
  if (sortedTs.length < 2) { if (emptyEl) { emptyEl.style.display='block'; el.style.display='none'; } return; }

  const cash = ap().cash || 0;
  const portVals = sortedTs.map(ts => {
    let total = cash; let hasAny = false;
    const eurUsd = nearestClose(dynFx, ts) || 1.08;
    for (const h of holdings) {
      const tl = dynTimelines[h.ticker]; if (!tl) continue;
      const close = nearestClose(tl, ts); if (close == null) continue;
      hasAny = true;
      total += h.shares * (dynData[h.ticker]?.currency === 'USD' ? close / eurUsd : close);
    }
    return hasAny ? total : null;
  });

  // Monthly % returns (prev → current)
  const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dynLabels = [], dynReturns = [], bmReturns = [];

  // Benchmark timeline for monthly dynamics
  const bmTimeline = selectedBenchmarkTicker && dynData[selectedBenchmarkTicker]
    ? (dynData[selectedBenchmarkTicker].timestamps || [])
        .map((t, i) => ({ t, c: dynData[selectedBenchmarkTicker].closes[i] }))
        .filter(x => x.c != null)
    : null;

  for (let i = 1; i < sortedTs.length; i++) {
    const prev = portVals[i - 1], curr = portVals[i];
    if (prev == null || curr == null || prev === 0) continue;
    const d = new Date(sortedTs[i] * 1000);
    dynLabels.push(`${SHORT_MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`);
    dynReturns.push(parseFloat(((curr - prev) / prev * 100).toFixed(2)));

    if (bmTimeline) {
      const bmPrev = nearestClose(bmTimeline, sortedTs[i-1]);
      const bmCurr = nearestClose(bmTimeline, sortedTs[i]);
      if (bmPrev && bmCurr && bmPrev !== 0) {
        bmReturns.push(parseFloat(((bmCurr - bmPrev) / bmPrev * 100).toFixed(2)));
      } else { bmReturns.push(null); }
    }
  }

  if (!dynLabels.length) { if (emptyEl) { emptyEl.style.display='block'; el.style.display='none'; } return; }

  // Update label
  const bmLbl = document.getElementById('port-dynamics-bm-label');
  if (bmLbl) bmLbl.textContent = selectedBenchmarkTicker ? `vs ${selectedBenchmarkName} (dashed)` : '';

  const datasets = [{
    label: 'Portfolio',
    data: dynReturns,
    backgroundColor: dynReturns.map(v => v >= 0 ? 'rgba(76,175,130,0.75)' : 'rgba(224,92,92,0.75)'),
    borderRadius: 3,
    borderSkipped: false,
  }];

  if (bmTimeline && bmReturns.some(v => v !== null)) {
    datasets.push({
      label: selectedBenchmarkName,
      data: bmReturns,
      type: 'line',
      borderColor: 'rgba(201,168,76,0.7)',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [5, 4],
      pointRadius: 2,
      pointBackgroundColor: 'rgba(201,168,76,0.7)',
      tension: 0.3,
      spanGaps: true,
    });
  }

  const ctx = el.getContext('2d');
  charts['port-dynamics'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: dynLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: {
          display: !!bmTimeline,
          labels: { color: textColor(), font: { size: 10, family: 'Karla' }, boxWidth: 14, padding: 10 }
        },
        tooltip: {
          mode: 'index', intersect: false,
          callbacks: { label: c => c.raw != null ? ` ${c.dataset.label}: ${c.raw > 0 ? '+' : ''}${c.raw.toFixed(2)}%` : '' }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor(), font: { size: 10 }, maxTicksLimit: 14 } },
        y: {
          grid: { color: gridColor() },
          ticks: { color: textColor(), font: { size: 10 }, callback: v => (v > 0 ? '+' : '') + v + '%' }
        }
      }
    }
  });
}

// ══════════════ HOLDINGS PERFORMANCE CHART ══════════════
let _hperfFetchId = 0;

async function buildHoldingsPerfChart(preData) {
  const wrap    = document.getElementById('hperf-chart-wrap');
  const emptyEl = document.getElementById('hperf-empty');
  if (!wrap || !wrap.closest('#tab-portfolio').offsetParent) return;

  const holdings = ap().holdings || [];
  if (!holdings.length) {
    wrap.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const RANGE_CFG = {
    '1M':  { interval: '1d',  range: '1mo' },
    '3M':  { interval: '1d',  range: '3mo' },
    '6M':  { interval: '1d',  range: '6mo' },
    'YTD': { interval: '1d',  range: 'ytd' },
    '1Y':  { interval: '1wk', range: '1y'  },
    'All': { interval: '1mo', range: 'max' },
  };
  const cfg = RANGE_CFG[hperfRange] || RANGE_CFG['1M'];

  const hperfId = ++_hperfFetchId;
  // Use pre-fetched data if provided; only fetch standalone when range changes.
  let hData = preData || {};
  if (!preData && window.electronAPI?.fetchHistory) {
    const tickers = new Set(holdings.map(h => h.ticker));
    tickers.add('EURUSD=X');
    if (selectedBenchmarkTicker) tickers.add(selectedBenchmarkTicker);
    try {
      hData = await window.electronAPI.fetchHistory({ tickers: [...tickers], ...cfg });
    } catch(e) { console.error('buildHoldingsPerfChart fetchHistory error', e); }
  }
  if (hperfId !== _hperfFetchId) return;

  const fxTl = (hData['EURUSD=X']?.timestamps || [])
    .map((t, i) => ({ t, c: hData['EURUSD=X'].closes[i] }))
    .filter(x => x.c != null);

  // Compute per-holding % return over the range
  const perfs = [];
  for (const h of holdings) {
    const d = hData[h.ticker];
    if (!d) continue;
    const tl = d.timestamps.map((t, i) => ({ t, c: d.closes[i] })).filter(x => x.c != null);
    if (tl.length < 2) continue;
    const startClose = tl[0].c, endClose = tl[tl.length - 1].c;
    if (!startClose) continue;
    const ret = (endClose - startClose) / startClose * 100;
    perfs.push({ ticker: h.ticker, ret: parseFloat(ret.toFixed(2)) });
  }

  // Benchmark % return for the same period
  let bmRet = null;
  if (selectedBenchmarkTicker && hData[selectedBenchmarkTicker]) {
    const bmD = hData[selectedBenchmarkTicker];
    const bmTl = bmD.timestamps.map((t, i) => ({ t, c: bmD.closes[i] })).filter(x => x.c != null);
    if (bmTl.length >= 2) {
      bmRet = parseFloat(((bmTl[bmTl.length-1].c - bmTl[0].c) / bmTl[0].c * 100).toFixed(2));
    }
  }

  if (!perfs.length) {
    wrap.innerHTML = '<p class="muted" style="font-size:12px;padding:6px 0;">Not enough price history for this range.</p>';
    return;
  }

  // Sort: highest return first
  perfs.sort((a, b) => b.ret - a.ret);
  const maxAbs = Math.max(...perfs.map(p => Math.abs(p.ret)), bmRet ? Math.abs(bmRet) : 0, 1);

  // Render as horizontal bars
  const bmLinePos = bmRet !== null ? Math.abs(bmRet) / maxAbs * 100 : null;

  wrap.innerHTML = perfs.map(p => {
    const pct = Math.abs(p.ret) / maxAbs * 100;
    const color = p.ret >= 0 ? '#4caf82' : '#e05c5c';
    const textCls = p.ret >= 0 ? 'up-text' : 'down-text';
    const bmMarker = bmLinePos !== null
      ? `<div class="hperf-bm" style="left:${bmLinePos.toFixed(1)}%;"></div>` : '';
    return `<div class="hperf-item">
      <div class="hperf-label">${p.ticker}</div>
      <div class="hperf-bar-wrap">
        <div class="hperf-bar" style="width:${pct.toFixed(1)}%;background:${color};"></div>
        ${bmMarker}
      </div>
      <div class="hperf-val ${textCls}">${p.ret >= 0 ? '+' : ''}${p.ret.toFixed(2)}%</div>
    </div>`;
  }).join('');

  // Show benchmark reference line legend
  if (bmRet !== null) {
    const bmCls = bmRet >= 0 ? 'up-text' : 'down-text';
    wrap.innerHTML += `<div style="font-size:11px;color:var(--text3);margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
      <span style="border-left:2px dashed rgba(201,168,76,0.7);padding-left:6px;">
        ${selectedBenchmarkName} over ${hperfRange}: <span class="${bmCls}" style="font-weight:600;">${bmRet >= 0 ? '+' : ''}${bmRet.toFixed(2)}%</span>
      </span>
    </div>`;
  }
}

// ══════════════ SECTOR ALLOCATION CHART ══════════════
const SECTOR_COLORS = {
  'Technology':             '#4c8aaf',
  'Financial Services':     '#c9a84c',
  'Healthcare':             '#4caf82',
  'Consumer Cyclical':      '#9b87f5',
  'Communication Services': '#e0965c',
  'Consumer Defensive':     '#5ccce0',
  'Industrials':            '#e05c5c',
  'Energy':                 '#a0d060',
  'Basic Materials':        '#c050f0',
  'Real Estate':            '#50c0f0',
  'Utilities':              '#f0c050',
  'ETF / Index':            '#a1a1aa',
  'ETF/Fund':               '#a1a1aa',
  'Cryptocurrency':         '#f7931a',
  'Crypto':                 '#f7931a',
  'Bond':                   '#d4b483',
  'Other':                  '#7a7a7a',
};
function sectorColor(s) { return SECTOR_COLORS[s] || '#6b6060'; }

function buildSectorChart() {
  const holdings = ap().holdings || [];
  const map = {};
  holdings.forEach(h => {
    // Priority: live sector from Yahoo → SECTOR_DB lookup → smart class fallback
    let key = h.sector || SECTOR_DB[h.ticker];
    if (!key) {
      const eff = guessAssetClass(h.ticker) !== 'Stock' ? guessAssetClass(h.ticker) : h.assetClass;
      if (eff === 'ETF/Fund') key = 'ETF / Index';
      else if (eff === 'Crypto') key = 'Cryptocurrency';
      else key = null; // unknown stocks → omit until sector is fetched
    }
    if (!key) return; // skip holdings with no known sector yet
    const val = (h.currentPrice || h.buyPrice) * h.shares;
    map[key] = (map[key] || 0) + val;
  });

  const bar    = document.getElementById('sector-bar');
  const legend = document.getElementById('sector-legend');
  const empty  = document.getElementById('sector-empty');
  const wrap   = document.getElementById('sector-chart-wrap');

  const entries = Object.entries(map).sort((a,b) => b[1]-a[1]);
  const totalVal = entries.reduce((s,[,v]) => s+v, 0) || 1;

  if (!entries.length) {
    if (empty)  empty.style.display  = 'block';
    if (wrap)   wrap.style.display   = 'none';
    return;
  }
  if (empty)  empty.style.display  = 'none';
  if (wrap)   wrap.style.display   = '';

  bar.innerHTML = entries.map(([sec, val]) =>
    `<div class="sector-bar-seg" style="width:${(val/totalVal*100).toFixed(2)}%;background:${sectorColor(sec)};" title="${sec}: ${eur(val)}"></div>`
  ).join('');

  legend.innerHTML = entries.map(([sec, val]) => {
    const pct = (val/totalVal*100).toFixed(1);
    return `<div class="sector-legend-row">
      <div class="sector-dot" style="background:${sectorColor(sec)};"></div>
      <span class="sector-legend-name">${sec}</span>
      <span class="sector-legend-val">${eur(val)}</span>
      <span class="sector-legend-pct">&nbsp;(${pct}%)</span>
    </div>`;
  }).join('');
}

