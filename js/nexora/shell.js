// Nexora's interface layer: the redesigned look, profiles with encrypted data,
// My profile, languages, the dashboard, seasons and the Year Wrap — on top of the
// app's own rendering code (js/*.js), which it extends rather than replaces.
// It grew up as the 2.0 design preview and was moved into the app for 2.0.
(function () {
  // Settings saved by Marduk (theme, auto-lock, last version seen, split check) carry over:
  // the local folder was copied by main.js, and here the keys take their new names.
  try {
    for (const k of ['theme_mode', 'autolock_min', 'last_seen_version', 'split_check'])
      if (localStorage.getItem('nexora_' + k) == null && localStorage.getItem('marduk_' + k) != null)
        localStorage.setItem('nexora_' + k, localStorage.getItem('marduk_' + k));
  } catch (e) {}
  const MODERN = true;   // the redesign is the only look; the flag stays for the code paths it guards
  const today = new Date();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // ── Charts: the app passes gold/green/red literals; map them to the theme ──
  if (MODERN && window.Chart) {
    const Orig = window.Chart;
    const css = n => getComputedStyle(document.body).getPropertyValue(n).trim();
    const hexA = (hex, a) => { const h = hex.replace('#', ''); const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`; };
    const SALARY_PAL = { '#e8a838': '#A78BFA', '#e05c20': '#F5B84B', '#5fa84f': '#3DF5C0' };
    const map = s => {
      const accent = css('--gold'), up = css('--up'), down = css('--down');
      let m;
      if ((m = s.match(/^(#[0-9a-f]{6})([0-9a-f]{2})$/i))) {           // '#c9a84ccc' → mapped colour at that alpha
        const base = m[1].toLowerCase(), a = (parseInt(m[2], 16) / 255).toFixed(2);
        const to = base === '#4c8aaf' ? '#38BDF8' : SALARY_PAL[base] || map(base);
        return to.startsWith('#') ? hexA(to, a) : to;
      }
      if (SALARY_PAL[s.toLowerCase()]) return SALARY_PAL[s.toLowerCase()];
      if (/^#c9a84c$/i.test(s)) return accent;
      if ((m = s.match(/^rgba\(\s*201\s*,\s*168\s*,\s*76\s*,\s*([\d.]+)\s*\)$/))) return hexA(accent, m[1]);
      if (/^#4caf82$/i.test(s)) return up;
      if ((m = s.match(/^rgba\(\s*76\s*,\s*175\s*,\s*130\s*,\s*([\d.]+)\s*\)$/))) return hexA(up, m[1]);
      if (/^#e05c5c$/i.test(s)) return down;
      if ((m = s.match(/^rgba\(\s*224\s*,\s*92\s*,\s*92\s*,\s*([\d.]+)\s*\)$/))) return hexA(down, m[1]);
      if (/^#4c8aaf$/i.test(s)) return accent;                       // 'Stock' slice → azul elétrico
      if (/^#(9b9280|6b5f4a)$/i.test(s)) return css('--text3');
      if (/^#(13131a|ede7d9)$/i.test(s)) return css('--bg2');
      return s;
    };
    const walk = v => {
      if (typeof v === 'string') return map(v);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) { for (const k of Object.keys(v)) v[k] = walk(v[k]); }
      return v;
    };
    // ── Livelier donuts: thin ring on a faint track, rounded gapped segments,
    //    soft depth, and a centre that shows the total — or the hovered slice.
    const DONUT_CAPTION = { 'chart-alloc': 'Total', 'chart-port-donut': 'Portfolio', 'chart-exp-cat': 'Spent', 'chart-div-donut': 'Per year' };
    const donutPlugin = caption => ({
      id: 'nxDonut',
      beforeDatasetsDraw(chart) {
        const arc = chart.getDatasetMeta(0).data[0];
        if (!arc) return;
        const c = chart.ctx; c.save();
        c.beginPath(); c.arc(arc.x, arc.y, (arc.outerRadius + arc.innerRadius) / 2, 0, Math.PI * 2);
        c.lineWidth = arc.outerRadius - arc.innerRadius; c.strokeStyle = css('--bg3'); c.stroke(); c.restore();
      },
      beforeDatasetDraw(chart) {
        const c = chart.ctx; c.save();
        c.shadowColor = document.body.dataset.theme === 'light' ? 'rgba(16,24,40,0.16)' : 'rgba(0,0,0,0.45)';
        c.shadowBlur = 14; c.shadowOffsetY = 4;
      },
      afterDatasetDraw(chart) { chart.ctx.restore(); },
      afterDraw(chart) {
        const arc = chart.getDatasetMeta(0).data[0];
        if (!arc) return;
        const data = chart.data.datasets[0].data, total = data.reduce((s, v) => s + (+v || 0), 0);
        const act = chart.getActiveElements()[0];
        const money = v => v >= 10000 ? '€' + (v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k' : eur(v, 0);
        const c = chart.ctx, r = arc.innerRadius, maxW = r * 1.55;
        // shrink a line until it fits inside the hole
        const put = (txt, weight, size, colour, y) => {
          let s = size; c.font = `${weight} ${s}px Inter, sans-serif`;
          while (s > 9 && c.measureText(txt).width > maxW) c.font = `${weight} ${--s}px Inter, sans-serif`;
          c.fillStyle = colour; c.fillText(txt, arc.x, y);
        };
        c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
        if (act) {   // hovered slice: name, amount, share
          const v = +data[act.index] || 0, col = chart.data.datasets[0].backgroundColor[act.index];
          put(String(chart.data.labels[act.index]), 500, Math.max(10, Math.round(r * 0.18)), css('--text2'), arc.y - r * 0.4);
          put(money(v), 700, Math.round(r * 0.34), css('--text'), arc.y - r * 0.02);
          put((total ? v / total * 100 : 0).toFixed(1) + '%', 650, Math.max(10, Math.round(r * 0.2)), col, arc.y + r * 0.38);
        } else {
          put(money(total), 700, Math.round(r * 0.36), css('--text'), arc.y - r * 0.12);
          put(window.NX_I18N?.tr(caption, LANG) ?? caption, 500, Math.max(10, Math.round(r * 0.17)), css('--text3'), arc.y + r * 0.27);
        }
        c.restore();
      },
    });
    // ── Bars and lines: gradients, rounded bars, glowing lines, cleaner axes ──
    const rgbaOf = col => {
      if (typeof col !== 'string') return null;
      let m = col.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/);
      if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
      m = col.match(/^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i);
      if (!m) return null;
      const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
      const v = parseInt(h, 16);
      return [v >> 16 & 255, v >> 8 & 255, v & 255, m[2] ? parseInt(m[2], 16) / 255 : 1];
    };
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const pick = (base, i) => Array.isArray(base) ? base[i] : base;
    // A bar: full colour at its end, fading towards its base
    const barFill = (c, col, horizontal) => {
      const area = c.chart.chartArea, p = rgbaOf(col);
      if (!area || !p) return col;
      const g = horizontal ? c.chart.ctx.createLinearGradient(area.left, 0, area.right, 0)
                           : c.chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
      const top = p[3] < 1 ? Math.max(p[3], 0.45) : 1;   // faded 'other months' bars still read
      g.addColorStop(0, rgba(p, top * 0.5)); g.addColorStop(1, rgba(p, top));
      return g;
    };
    const areaFill = (c, col) => {
      const area = c.chart.chartArea, p = rgbaOf(col);
      if (!area || !p) return 'transparent';
      const g = c.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, rgba(p, 0.32)); g.addColorStop(0.7, rgba(p, 0.06)); g.addColorStop(1, rgba(p, 0));
      return g;
    };
    const chartsPlugin = {
      id: 'nxCharts',
      // Horizontal bars sit on a faint full-length track
      beforeDatasetsDraw(chart) {
        if (chart.options.indexAxis !== 'y' || chart.data.datasets.length !== 1) return;
        const a = chart.chartArea, c = chart.ctx; c.save(); c.fillStyle = css('--bg3');
        for (const bar of chart.getDatasetMeta(0).data) {
          const h = bar.height; c.beginPath(); c.roundRect(a.left, bar.y - h / 2, a.right - a.left, h, h / 2); c.fill();
        }
        c.restore();
      },
      // Lines glow in their own colour
      beforeDatasetDraw(chart, { index }) {
        const ds = chart.data.datasets[index];
        if ((ds.type || chart.config.type) !== 'line' || ds.borderDash?.length) return;
        const p = rgbaOf(ds.borderColor); if (!p) return;
        chart.ctx.save(); chart.ctx.shadowColor = rgba(p, 0.55); chart.ctx.shadowBlur = 12; chart.ctx.shadowOffsetY = 4;
        ds._nxGlow = true;
      },
      afterDatasetDraw(chart, { index }) {
        const ds = chart.data.datasets[index];
        if (ds._nxGlow) { chart.ctx.restore(); ds._nxGlow = false; }
      },
      // A guide line follows the pointer on line charts
      afterDatasetsDraw(chart) {
        if (chart.config.type !== 'line') return;
        const act = chart.getActiveElements()[0]; if (!act) return;
        const a = chart.chartArea, c = chart.ctx, x = act.element.x;
        c.save(); c.setLineDash([4, 4]); c.strokeStyle = css('--text3'); c.globalAlpha = 0.6; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, a.top); c.lineTo(x, a.bottom); c.stroke(); c.restore();
      },
    };
    const polish = (cfg) => {
      const horizontal = cfg.options?.indexAxis === 'y';
      const stacked = (cfg.data.datasets || []).some(d => d.stack);
      for (const ds of cfg.data.datasets || []) {
        if (ds.nxKeep) continue;
        const type = ds.type || cfg.type;
        if (type === 'bar') {
          const base = ds.backgroundColor;
          if (typeof base !== 'function') {
            ds.backgroundColor = c => barFill(c, pick(base, c.dataIndex), horizontal);
            ds.hoverBackgroundColor = c => pick(base, c.dataIndex);
          }
          Object.assign(ds, stacked ? { borderRadius: 5 } : { borderRadius: horizontal ? 999 : 8, borderSkipped: false });
          ds.maxBarThickness = horizontal ? 12 : 42;
          ds.borderWidth = 0;
        }
        if (type === 'line') {
          const col = ds.borderColor, n = (ds.data || []).length;
          Object.assign(ds, { borderWidth: ds.borderDash?.length ? 1.6 : 2.6, tension: 0.38, borderCapStyle: 'round',
            pointRadius: n <= 12 ? 3 : 0, pointHoverRadius: 6, pointBackgroundColor: col, pointBorderWidth: 0,
            pointHoverBorderWidth: 3, pointHoverBorderColor: css('--bg2'), pointHoverBackgroundColor: col });
          if (ds.fill) ds.backgroundColor = c => areaFill(c, col);
        }
      }
      const o = cfg.options = cfg.options || {};
      for (const [key, s] of Object.entries(o.scales || {})) {
        const valueAxis = horizontal ? key === 'x' : key === 'y';
        s.border = { display: false };
        s.ticks = Object.assign({}, s.ticks, { padding: 8, font: { size: 11 } }, valueAxis ? { maxTicksLimit: 6 } : {});
        if (valueAxis) {
          const cb = s.ticks.callback;
          s.ticks.callback = function (v, i, t) {
            const out = cb ? cb.call(this, v, i, t) : Orig.Ticks.formatters.numeric.call(this, v, i, t);
            return Array.isArray(out) ? out.map(x => nxNeg(String(x), true)) : nxNeg(String(out), true);
          };
        }
        if (s.grid && s.grid.display === false) continue;
        s.grid = Object.assign({}, s.grid, valueAxis ? { color: css('--border'), drawTicks: false } : { display: false });
      }
      o.plugins = o.plugins || {};
      const tcb = Object.assign({}, o.plugins.tooltip?.callbacks), lab = tcb.label;
      tcb.label = function (c) {
        const out = lab ? lab.call(this, c) : `${c.dataset.label ? c.dataset.label + ': ' : ''}${c.formattedValue}`;
        return Array.isArray(out) ? out.map(x => nxNeg(String(x), true)) : nxNeg(String(out), true);
      };
      o.plugins.tooltip = Object.assign({}, o.plugins.tooltip, { callbacks: tcb });
      o.plugins.tooltip = Object.assign({
        backgroundColor: css('--bg2'), titleColor: css('--text'), bodyColor: css('--text2'),
        borderColor: css('--border-strong'), borderWidth: 1, padding: 11, cornerRadius: 10,
        boxPadding: 5, usePointStyle: true, titleFont: { weight: '600' },
      }, o.plugins.tooltip || {});
      if (cfg.type === 'line' && !o.interaction) o.interaction = { mode: 'index', intersect: false };
      if (!o.animation || o.animation.duration == null || o.animation.duration > 0) {
        o.animation = Object.assign({ duration: 750, easing: 'easeOutQuart' }, o.animation,
          cfg.type === 'bar' ? { delay: c => (c.type === 'data' && c.mode === 'default') ? c.dataIndex * 40 : 0 } : {});
      }
      cfg.plugins = [...(cfg.plugins || []), chartsPlugin];
    };

    function Chart(ctx, cfg) {
      if (cfg && cfg.data && window.NX_I18N) {
        const trL = v => typeof v === 'string' ? (window.NX_I18N.tr(v.trim(), typeof UI_LANG === 'string' ? UI_LANG : 'en') ?? v) : v;
        if (Array.isArray(cfg.data.labels)) cfg.data.labels = cfg.data.labels.map(trL);
        (cfg.data.datasets || []).forEach(d => { if (typeof d.label === 'string') d.label = trL(d.label); });
      }
      if (cfg) {
        walk(cfg.data || {}); walk(cfg.options || {});
        if ((cfg.type === 'bar' || cfg.type === 'line') && cfg.data) polish(cfg);
        if (cfg.type === 'doughnut' && cfg.data?.datasets?.[0]) {
          const ds = cfg.data.datasets[0], id = (ctx.canvas || ctx).id;
          Object.assign(ds, { borderWidth: 0, spacing: 4, borderRadius: 7, hoverOffset: 9 });
          cfg.options = Object.assign(cfg.options || {}, { cutout: '76%', layout: { padding: 10 },
            animation: { animateRotate: true, animateScale: true, duration: 950, easing: 'easeOutQuart' } });
          cfg.options.plugins = Object.assign(cfg.options.plugins || {}, { tooltip: Object.assign(cfg.options.plugins?.tooltip || {}, { enabled: false }) });
          cfg.plugins = [...(cfg.plugins || []), donutPlugin(DONUT_CAPTION[id] || 'Total')];
        }
      }
      return new Orig(ctx, cfg);
    }
    Object.setPrototypeOf(Chart, Orig);
    Chart.prototype = Orig.prototype;
    window.Chart = Chart;
    Orig.defaults.font.family = "'Inter', system-ui, sans-serif";
  }

  // ── Negative numbers in brackets, as in accounts: €(3,29), (0.61%) ──
  // Applied to text as it reaches the screen (the language pass below) and to
  // chart labels, so every view follows the rule without its own formatter.
  // `bare` also brackets plain numbers; only for chart axes and tooltips.
  const NEG_SYM = '(?:€|\\$|£|₣|R\\$)';
  const NEG_RE = [
    [new RegExp(`[-−](${NEG_SYM})\\s?(\\d[\\d.,]*(?:\\s?[kM])?)`, 'g'), '$1($2)'],    // −€3,29 → €(3,29)
    [new RegExp(`(${NEG_SYM})\\s?[-−](\\d[\\d.,]*(?:\\s?[kM])?)`, 'g'), '$1($2)'],    // €-3,29 → €(3,29)
    [/(^|[\s(·:,])[-−](\d[\d.,]*)\s?%/g, '$1($2%)'],                              // −0.61% → (0.61%)
    [/\(\((\d[\d.,]*%)\)\)/g, '($1)'],                                             // (−0.61%) was wrapped already
    [/\(\+(\d[\d.,]*%)\)/g, '+$1'],                                                 // (+0.42%) → +0.42%, so brackets mean "negative"
  ];
  function nxNeg(s, bare) {
    if (typeof s !== 'string' || !/[-−]|\(\+/.test(s)) return s;
    for (const [re, to] of NEG_RE) s = s.replace(re, to);
    return bare ? s.replace(/(^|[\s:])[-−](\d[\d.,]*)(?=\s|$)/g, '$1($2)') : s;
  }

  // ── A modern categorical palette: the old one was built around gold
  const PALETTE = ['#2F6BFF', '#3DF5C0', '#8B5CF6', '#F5B84B', '#F2706D', '#38BDF8', '#F472B6', '#94A3B8', '#A3E635', '#FB923C', '#14B8A6', '#6366F1', '#FB7185', '#FACC15'];
  function swapPalettes() {
    if (!MODERN) return;
    if (typeof CAT_COLORS_PALETTE !== 'undefined') PALETTE.forEach((c, i) => { CAT_COLORS_PALETTE[i] = c; });
    if (typeof CLASS_COLORS !== 'undefined') Object.assign(CLASS_COLORS, { Stock: '#2F6BFF', 'ETF/Fund': '#3DF5C0', Crypto: '#8B5CF6', Bond: '#F5B84B', Cash: '#94A3B8' });
    if (typeof SECTOR_COLORS !== 'undefined') Object.assign(SECTOR_COLORS, {
      'Technology': '#2F6BFF', 'Financial Services': '#F5B84B', 'Healthcare': '#3DF5C0', 'Consumer Cyclical': '#8B5CF6',
      'Communication Services': '#38BDF8', 'Consumer Defensive': '#14B8A6', 'Industrials': '#F2706D', 'Energy': '#FB923C',
      'Basic Materials': '#F472B6', 'Real Estate': '#A3E635', 'Utilities': '#FACC15', 'ETF / Index': '#94A3B8', 'ETF/Fund': '#94A3B8' });
  }

  // ── Icons beside stat labels, Snowball-style ────────────────────
  const I = {
    wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17v2.5"/><rect x="3" y="7.5" width="18" height="12" rx="2.5"/><circle cx="16.5" cy="13.5" r="1.2"/>',
    pie: '<path d="M12 3v9h9"/><path d="M20.5 15.5A9 9 0 1 1 8.5 3.7"/>',
    up: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    down: '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
    coins: '<ellipse cx="9" cy="7.5" rx="5" ry="2.5"/><path d="M4 7.5v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4"/><path d="M10 16.5c.8 1 2.7 1.7 5 1.7 2.8 0 5-1.1 5-2.5v-4c0-1.4-2.2-2.5-5-2.5"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    hourglass: '<path d="M7 3h10M7 21h10M8 3v3a4 4 0 0 0 8 0V3M8 21v-3a4 4 0 0 1 8 0v3"/>',
    alert: '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    scale: '<path d="M12 4v16M6 20h12M5 8h14M7.5 8L5 14a2.6 2.6 0 0 0 5 0L7.5 8zM16.5 8L14 14a2.6 2.6 0 0 0 5 0l-2.5-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    note: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/>',
    spark: '<path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8L12 4z"/><path d="M18.5 15.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.6z"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
    plus: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/>',
    minus: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>',
    leaf: '<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    inc: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8.5 12.5L12 16l3.5-3.5"/>',
    flame: '<path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.7-2.5-6-4.2-8.8-.4 2-1.5 3.3-2.7 3.8C11.8 7 10.9 4.6 9 3c.3 3.5-3.5 6.3-3.5 11.5A6.5 6.5 0 0 0 12 21z"/><path d="M12 21a2.7 2.7 0 0 1-2.7-2.7c0-1.8 1.5-2.8 2.7-4.6 1.2 1.8 2.7 2.8 2.7 4.6A2.7 2.7 0 0 1 12 21z"/>',
  };
  // card titles that carry an icon in the app, by the card they sit in (the title text may be translated)
  const TITLE_IC = [['#fire-section', 'flame', 'coral'], ['#ai-summary-card', 'spark', 'violet'], ['#div-calendar-card', 'cal', 'mint'], ['#psub-expenses-allocations', 'target', 'amber']];
  const RULES = [
    [/net worth/, 'wallet', 'blue'], [/portfolio value|^value$/, 'pie', 'blue'], [/p&l|gain|profit|return/, 'up', 'mint'],
    [/spent|spending/, 'card', 'coral'], [/total invested|^invested/, 'coins', 'violet'], [/positions|holdings$/, 'layers', 'sky'],
    [/^allocated/, 'target', 'amber'], [/remaining/, 'hourglass', 'mint'], [/unallocated/, 'alert', 'coral'],
    [/volatility/, 'pulse', 'violet'], [/drawdown/, 'down', 'coral'], [/beta/, 'scale', 'sky'], [/effective/, 'grid', 'amber'],
    [/income/, 'inc', 'mint'], [/salary|net take|gross|base/, 'note', 'mint'], [/extra/, 'spark', 'amber'],
    [/savings rate|tax rate|ratio|yield/, 'percent', 'amber'], [/assets/, 'plus', 'mint'], [/liabilities|ss contribution|irs/, 'minus', 'coral'],
    [/dividend|passive|received|annual|monthly average|this year|last payment/, 'leaf', 'mint'], [/ytd|vs same|vs last/, 'cal', 'sky'],
  ];
  // ── One modern icon set for the header, menus and actions ──────
  const MI = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
    receipt: '<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/><path d="M9 8h6M9 12h6"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    pie: '<path d="M21 12A9 9 0 1 1 12 3"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    note: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5h.01M18 14.5h.01"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    coins: '<ellipse cx="9" cy="7.5" rx="5" ry="2.5"/><path d="M4 7.5v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4"/><path d="M10 16.5c.8 1 2.7 1.7 5 1.7 2.8 0 5-1.1 5-2.5v-4c0-1.4-2.2-2.5-5-2.5"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.1-7.5 9.5-4.4-1.4-7.5-4.9-7.5-9.5V6z"/>',
    wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17v2.5"/><rect x="3" y="7.5" width="18" height="12" rx="2.5"/><circle cx="16.5" cy="13.5" r="1.2"/>',
    swap: '<path d="M7 7h13M17 4l3 3-3 3M17 17H4M7 14l-3 3 3 3"/>',
    upload: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    download: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    lock: '<rect x="4.5" y="11" width="15" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    split: '<path d="M6 3v5a6 6 0 0 0 12 0V3"/><path d="M12 14v7"/>',
    pencil: '<path d="M16.5 3.5l4 4L8 20H4v-4z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    sparkles: '<path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8L12 4z"/><path d="M18.5 15.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.6z"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
    key: '<circle cx="7.75" cy="7.75" r="4.75" fill="currentColor" fill-opacity=".18"/><circle cx="7.75" cy="7.75" r="1.35" fill="currentColor" stroke="none"/><path d="M11.1 11.1l8.6 8.6M16.8 16.8l-2.2 2.2M19.7 19.7l-2.2 2.2"/>',
    menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3 2"/>',
    contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    monitor: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
    user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
    logout: '<path d="M14 4.5h3.5A2 2 0 0 1 19.5 6.5v11a2 2 0 0 1-2 2H14"/><path d="M10 16l-4-4 4-4M6 12h9.5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.7M6.6 6.6A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 5.3-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    shieldCheck: '<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.1-7.5 9.5-4.4-1.4-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.3 2.3 4.2-4.4"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    database: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    car: '<path d="M4 16.5V13l2.2-5.2A2 2 0 0 1 8 6.5h8a2 2 0 0 1 1.8 1.3L20 13v3.5z"/><path d="M4 13h16M6.5 16.5V19M17.5 16.5V19"/><circle cx="8" cy="15" r=".6" fill="currentColor"/><circle cx="16" cy="15" r=".6" fill="currentColor"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
    umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/><path d="M12 3v0"/>',
    star8: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 12.4l1.1 2.1 2.3.4-1.7 1.6.4 2.3-2.1-1.1-2.1 1.1.4-2.3-1.7-1.6 2.3-.4z"/>',
    chevL: '<path d="M15 6l-6 6 6 6"/>', chevR: '<path d="M9 6l6 6-6 6"/>', chevD: '<path d="M6 9l6 6 6-6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    pumpkin: '<path d="M12 7c-3.3-1.7-7.6-.6-8.4 3.4-.7 3.6 1 7.8 4.7 8.6 1.4.3 2.6 0 3.7-.6 1.1.6 2.3.9 3.7.6 3.7-.8 5.4-5 4.7-8.6C19.6 6.4 15.3 5.3 12 7z"/><path d="M12 7c.2-1.7 1-2.8 2.5-3.3M12 7.2c-1.3 3-1.3 8 0 11.2"/>',
  };
  const CHEV_R = '<svg class="nx-chev-r" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  const CHECK = '<svg class="nx-check-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const svgOf = name => `<svg class="nx-mi" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${MI[name]}</svg>`;
  const GLYPHS = /^[\s ↻⬆↓↑⇅✎＋✕⟳↶]+/;
  function setIcon(el, name) {
    if (!el || !MI[name]) return;
    const cur = el.querySelector(':scope > svg');
    if (cur && cur.classList.contains('nx-mi') && cur.dataset.icon === name) return;
    if (cur) cur.remove();
    const first = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (first) first.textContent = ' ' + first.textContent.replace(GLYPHS, '');
    el.insertAdjacentHTML('afterbegin', svgOf(name));
    el.querySelector(':scope > svg').dataset.icon = name;
  }
  const NAV = { overview: 'dashboard', portfolio: 'chart', expenses: 'receipt', networth: 'bank', budget: 'pie', goals: 'flag', salary: 'note' };
  const SUB = { 'portfolio:overview': 'dashboard', 'portfolio:holdings': 'list', 'portfolio:dividends': 'coins', 'portfolio:risk': 'shield',
                'portfolio:cash': 'wallet', 'portfolio:transactions': 'swap', 'expenses:overview': 'dashboard', 'expenses:logs': 'list',
                'expenses:import': 'upload', 'expenses:allocations': 'target' };
  const MENU_TEXT = [[/check for updates/i, 'refresh'], [/changelog/i, 'history'], [/backups/i, 'archive'], [/^\s*ai/i, 'sparkles'],
    [/theme/i, 'contrast'], [/auto-?lock/i, 'timer'], [/change password/i, 'key'], [/export data/i, 'download'], [/import data/i, 'upload'],
    [/refresh prices/i, 'refresh'], [/import csv/i, 'upload'], [/export csv/i, 'download'], [/stock splits/i, 'split'],
    [/rename/i, 'pencil'], [/new portfolio/i, 'plus'], [/delete/i, 'trash'], [/my profile/i, 'user'], [/sign out/i, 'logout']];
  function modernIcons() {
    for (const [tab, icon] of Object.entries(NAV)) setIcon(document.querySelector(`nav button[onclick^="showTab('${tab}'"]`), icon);
    document.querySelectorAll('[data-sub]').forEach(b => setIcon(b, SUB[b.dataset.sub]));
    setIcon(document.querySelector('.settings-btn[onclick^="toggleActionsMenu"]'), 'menu');
    document.querySelectorAll('#settings-menu > .settings-item, #actions-menu > .settings-item, #port-menu > .settings-item:not([data-ccy])').forEach(b => {
      const hit = MENU_TEXT.find(([re]) => re.test(b.textContent)); if (hit) setIcon(b, hit[1]);
    });
    setIcon(document.querySelector('#tab-salary .sec-header .btn[onclick^="importPayslip"]'), 'upload');
    setIcon(document.querySelector('#tab-salary .sec-header [onclick^="openAiSettings"]'), 'sparkles');
    setIcon(document.getElementById('theme-opt-light'), 'sun');
    setIcon(document.getElementById('theme-opt-dark'), 'moon');
    setIcon(document.getElementById('theme-opt-system'), 'monitor');
    // "Dark ▸" → "Dark ›" as a drawn chevron (app.js rewrites the text; this runs again after it)
    ['settings-theme-label', 'settings-autolock-label'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.textContent.includes('▸')) { el.textContent = el.textContent.replace(/\s*▸\s*$/, ''); el.classList.add('nx-sub-label'); el.insertAdjacentHTML('beforeend', CHEV_R); }
    });
    document.querySelectorAll('.theme-check').forEach(el => { if (!el.querySelector('svg')) el.innerHTML = CHECK; });
    // the last characters-as-icons from the old look → drawn icons (reads the glyph, not the word, so any language works)
    const LEAD = { '↓': 'download', '⬆': 'upload', '⟳': 'chart', '↶': 'undo' };
    document.querySelectorAll('button, .btn, .btn-ghost').forEach(b => {
      if (b.classList.contains('del-btn')) { if (b.textContent.trim() === '✕') b.innerHTML = svgOf('close'); return; }
      const tn = [...b.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim());
      if (!tn) return;
      const v = tn.nodeValue.trim();
      if (LEAD[v[0]]) setIcon(b, LEAD[v[0]]);
      else if (v[0] === '←') { tn.nodeValue = tn.nodeValue.replace('←', ''); b.insertAdjacentHTML('afterbegin', svgOf('chevL')); }
      else if (v.endsWith('→')) { tn.nodeValue = tn.nodeValue.replace('→', ''); b.insertAdjacentHTML('beforeend', svgOf('chevR')); }
    });
    document.querySelectorAll('button span, .benchmark-item span').forEach(s => {
      const v = s.textContent.trim();
      if (v === '▾') s.innerHTML = svgOf('chevD').replace('width="14" height="14"', 'width="11" height="11"');
      else if (v === '✓') s.innerHTML = CHECK;
    });
    degoldInline();
  }
  // Marduk's gold, hard-coded in the app's stylesheet and in markup the app writes → the accent
  const GOLD_RE = [[/rgba\(\s*201\s*,\s*168\s*,\s*76\s*,/g, 'rgba(var(--accent-rgb),'], [/%23c9a84c/gi, '%235C8CFF'], [/#c9a84c/gi, 'var(--gold)'], [/#e8c97a/gi, 'var(--gold-light)'], [/#8a6f30/gi, 'var(--gold-dim)']];
  const degold = s => GOLD_RE.reduce((a, [re, to]) => a.replace(re, to), s);
  function degoldStyles() {
    document.querySelectorAll('style').forEach(st => { if (/201\s*,\s*168\s*,\s*76|c9a84c|e8c97a|8a6f30/i.test(st.textContent)) st.textContent = degold(st.textContent); });
  }
  function degoldInline() {
    document.querySelectorAll('[style*="201,168,76"], [style*="201, 168, 76"], [style*="c9a84c" i]').forEach(el => el.setAttribute('style', degold(el.getAttribute('style'))));
  }

  function decorate(root) {
    if (!MODERN) return;
    modernIcons();
    (root || document).querySelectorAll('.stat-label, .div-stat-label').forEach(el => {
      if (el.querySelector('.nx-ic')) return;
      const txt = (el.childNodes[0]?.textContent || el.textContent).trim().toLowerCase();
      const rule = RULES.find(([re]) => re.test(txt)) || [null, 'spark', 'blue'];
      const ic = document.createElement('span');
      ic.className = 'nx-ic ' + rule[2];
      ic.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${I[rule[1]]}</svg>`;
      el.prepend(ic);
    });
    (root || document).querySelectorAll('.card-title > svg:first-child').forEach(svg => {
      const rule = TITLE_IC.find(([sel]) => svg.closest(sel)) || [null, 'spark', 'blue'];
      const ic = document.createElement('span');
      ic.className = 'nx-ic nx-ic-title ' + rule[2];
      ic.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${I[rule[1]]}</svg>`;
      svg.parentElement.classList.add('nx-has-ic');
      svg.replaceWith(ic);
    });
  }

  // ══════════════ PROFILE ══════════════
  const CCY = [['EUR', '€', 'Euro'], ['USD', '$', 'US dollar'], ['GBP', '£', 'British pound'], ['CHF', 'Fr', 'Swiss franc'], ['BRL', 'R$', 'Brazilian real']];
  const star = (cx, cy, r) => { let p = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; p += `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)} `; } return `<polygon points="${p.trim()}"/>`; };
  const EU_STARS = Array.from({ length: 12 }, (_, i) => star(16 + 7 * Math.cos(i * Math.PI / 6), 12 + 7 * Math.sin(i * Math.PI / 6), 1.45)).join('');
  const US_STRIPES = Array.from({ length: 7 }, (_, i) => `<rect y="${(i * 48 / 13).toFixed(2)}" width="32" height="${(24 / 13).toFixed(2)}" fill="#C8202F"/>`).join('');
  const US_STARS = Array.from({ length: 15 }, (_, i) => { const r = Math.floor(i / 5), c = i % 5; return `<circle cx="${(1.9 + c * 2.7 + (r % 2) * 1.2).toFixed(1)}" cy="${(2.3 + r * 4).toFixed(1)}" r=".7"/>`; }).join('');
  const FLAG_SVG = {
    EUR: `<rect width="32" height="24" fill="#1F3FA8"/><g fill="#FFD43B">${EU_STARS}</g>`,
    USD: `<rect width="32" height="24" fill="#fff"/>${US_STRIPES}<rect width="14.5" height="12.9" fill="#2B2F6E"/><g fill="#fff">${US_STARS}</g>`,
    GBP: `<rect width="32" height="24" fill="#14287A"/><path d="M0 0L32 24M32 0L0 24" stroke="#fff" stroke-width="4.8"/><path d="M0 0L32 24M32 0L0 24" stroke="#D4213D" stroke-width="1.6"/><path d="M16 0v24M0 12h32" stroke="#fff" stroke-width="8"/><path d="M16 0v24M0 12h32" stroke="#D4213D" stroke-width="4.6"/>`,
    CHF: `<rect width="32" height="24" fill="#E1261C"/><path d="M13.7 5h4.6v4.7H23v4.6h-4.7V19h-4.6v-4.7H9V9.7h4.7z" fill="#fff"/>`,
    BRL: `<rect width="32" height="24" fill="#14A44D"/><path d="M16 2.6L29.4 12 16 21.4 2.6 12z" fill="#FFD43B"/><circle cx="16" cy="12" r="5.2" fill="#1F3A93"/><path d="M11 10.9c3.4-.8 7-.2 10 1.7" stroke="#fff" stroke-width="1.1" fill="none"/>`,
    // countries (Country preference); GB/US/CH/BR reuse their currency's flag
    PT: `<rect width="32" height="24" fill="#DA291C"/><rect width="12.8" height="24" fill="#046A38"/><circle cx="12.8" cy="12" r="4.6" fill="none" stroke="#FFE000" stroke-width="1.4"/><path d="M10.9 9.4h3.8v3.8c0 1.2-.9 2-1.9 2.2-1-.2-1.9-1-1.9-2.2z" fill="#fff" stroke="#DA291C" stroke-width=".9"/>`,
    ES: `<rect width="32" height="24" fill="#C60B1E"/><rect y="6" width="32" height="12" fill="#FFC400"/>`,
    FR: `<rect width="32" height="24" fill="#fff"/><rect width="10.7" height="24" fill="#0055A4"/><rect x="21.3" width="10.7" height="24" fill="#EF4135"/>`,
    DE: `<rect width="32" height="8" fill="#111"/><rect y="8" width="32" height="8" fill="#DD0000"/><rect y="16" width="32" height="8" fill="#FFCE00"/>`,
    IT: `<rect width="32" height="24" fill="#fff"/><rect width="10.7" height="24" fill="#009246"/><rect x="21.3" width="10.7" height="24" fill="#CE2B37"/>`,
    CN: `<rect width="32" height="24" fill="#DE2910"/><g fill="#FFDE00">${star(6.4, 6.4, 3.6)}${star(11.6, 2.6, 1.2)}${star(13.8, 5, 1.2)}${star(13.8, 8.2, 1.2)}${star(11.6, 10.4, 1.2)}</g>`,
  };
  Object.assign(FLAG_SVG, { GB: FLAG_SVG.GBP, US: FLAG_SVG.USD, CH: FLAG_SVG.CHF, BR: FLAG_SVG.BRL });
  // h = height in px; width follows the flag's 4:3 shape, corners stay small so it reads as a flag, not a badge
  const flagIc = (c, h = 18) => { const w = Math.round(h * 4 / 3), r = Math.max(2.5, Math.round(h * 0.18)); return `<span class="nx-flagc" style="width:${w}px;height:${h}px;border-radius:${r}px;"><svg viewBox="0 0 32 24" width="${w}" height="${h}" preserveAspectRatio="none">${FLAG_SVG[c] || '<rect width="32" height="24" fill="#8a8f98"/>'}</svg></span>`; };
  const flagOf = c => flagIc(c, 12);
  // ══════════════ PROFILES ══════════════
  // The profile list — name, email, avatar, settings; never finances — is
  // Nexora/profiles.json in the Drive folder, so the log-in screen can show it
  // before anything is unlocked and every computer sees the same profiles. It's
  // read once at start-up and kept here; each change is written straight back.
  // Which profile is signed in on this computer stays in localStorage.
  // If the file exists but can't be read (Drive mid-sync), nothing is written,
  // so a half-synced file can never be replaced by a list missing profiles.
  const CUR_KEY = 'nexora_current', api = window.electronAPI;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let _accounts = [], _accountsUnreadable = false, _accSave = Promise.resolve();
  const accounts = () => structuredClone(_accounts);
  const saveAccounts = list => {
    if (_accountsUnreadable) return;
    _accounts = structuredClone(list);
    const json = JSON.stringify({ format: 'nexora-profiles', version: 1, profiles: _accounts });
    _accSave = _accSave.then(() => api?.profilesWrite(json))
      .then(ok => { if (ok === false) showToast('Couldn’t save your profile settings. Check that the Google Drive folder is available', 8000); })
      .catch(e => console.error(e));
  };
  async function loadAccounts() {
    let raw = null;
    try { raw = await api?.profilesRead(); } catch (e) {}
    if (!raw) { _accounts = []; return; }
    try { const f = JSON.parse(raw); _accounts = Array.isArray(f.profiles) ? f.profiles : []; }
    catch (e) { _accounts = []; _accountsUnreadable = true; }
  }
  let currentId = lsGet(CUR_KEY, null);
  const setCurrent = id => { currentId = id; lsSet(CUR_KEY, id); };
  const currentAccount = () => accounts().find(a => a.id === currentId) || null;
  function updateAccount(id, patch) {
    const list = accounts(), i = list.findIndex(a => a.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch }; saveAccounts(list); return list[i];
  }
  const AVATAR_BG = {
    blue: 'linear-gradient(135deg,#2F6BFF 0%,#2F6BFF 40%,#3DF5C0 125%)', violet: 'linear-gradient(135deg,#6D4DFF,#C084FC)',
    mint: 'linear-gradient(135deg,#0FAF86,#3DF5C0)', coral: 'linear-gradient(135deg,#F2706D,#F5B84B)',
    sky: 'linear-gradient(135deg,#0284C7,#67E8F9)', slate: 'linear-gradient(135deg,#334155,#94A3B8)' };
  const avatarBg = a => AVATAR_BG[a?.color] || AVATAR_BG.blue;
  // Symbols for avatars — drawn, not emoji
  const EMBLEMS = {
    star: '<path d="M12 2.5l2 5.2 5.2-2-2 5.3 5.3 2-5.3 2 2 5.2-5.2-2-2 5.3-2-5.3-5.2 2 2-5.2-5.3-2 5.3-2-2-5.3 5.2 2z"/>',
    gem: '<path d="M6.5 4h11l3.5 5-9 11-9-11z"/><path d="M3 9h18M9.5 4 8 9l4 11M14.5 4 16 9l-4 11"/>',
    lion: '<circle cx="12" cy="12.5" r="4.6"/><path d="M12 3.5l1.6 2.6 2.9-1 .3 3 3 .6-1.2 2.8 2 2.3-2.9 1 .2 3-3-.4-1.4 2.7L12 18.6 10.5 21l-1.4-2.7-3 .4.2-3-2.9-1 2-2.3-1.2-2.8 3-.6.3-3 2.9 1z"/><path d="M10.6 12h.01M13.4 12h.01M11 14.6c.6.5 1.4.5 2 0"/>',
    coins: '<ellipse cx="12" cy="6.5" rx="6.5" ry="2.5"/><path d="M5.5 6.5v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4M5.5 10.5v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4M5.5 14.5v3c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-3"/>',
    rise: '<path d="M4 19l5-6 4 3 7-9"/><path d="M15 7h5v5"/>',
    mountain: '<path d="M2.5 19.5 9 9.5l4 6 3-4 5.5 8z"/><circle cx="17" cy="5.8" r="2"/>',
    wave: '<path d="M2.5 10.5c2.4 0 2.4-2.5 4.8-2.5s2.4 2.5 4.7 2.5 2.4-2.5 4.8-2.5 2.4 2.5 4.7 2.5M2.5 15.5c2.4 0 2.4-2.5 4.8-2.5s2.4 2.5 4.7 2.5 2.4-2.5 4.8-2.5 2.4 2.5 4.7 2.5"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7.5-7.5"/>',
    bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/><path d="M17 4l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    crown: '<path d="M3.5 8.5l4.2 3.8L12 6l4.3 6.3 4.2-3.8-1.6 10H5.1z"/>',
  };
  function avatarHtml(a, cls = '') {
    const av = a?.avatar || {};
    if (av.kind === 'photo' && /^data:image\//.test(av.photo || '')) return `<span class="nx-avatar nx-avatar-photo ${cls}"><img src="${av.photo}" alt=""></span>`;
    if (av.kind === 'emblem' && EMBLEMS[av.emblem]) return `<span class="nx-avatar nx-avatar-sym ${cls}" style="background:${avatarBg(a)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${EMBLEMS[av.emblem]}</svg></span>`;
    return `<span class="nx-avatar ${cls}" style="background:${avatarBg(a)}">${escH(initials(a?.name))}</span>`;
  }
  // 0 empty · 1 weak · 2 fair · 3 strong
  const pwStrength = pw => !pw ? 0 : pw.length < 8 ? 1 : ([/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length + (pw.length >= 12 ? 1 : 0)) >= 3 ? 3 : 2;
  const loadProfile = () => { const a = currentAccount(); return a ? { name: a.name, email: a.email, ...(a.prefs || {}) } : null; };
  const saveProfile = p => {
    const a = currentAccount(); if (!a) return;
    const { name, email, _fromSignup, ...prefs } = p || {};
    updateAccount(a.id, { name: name ?? a.name, prefs: { ...(a.prefs || {}), ...prefs, setupDone: true } });
  };
  const initials = n => (n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '·';
  const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function applyProfile() {
    const p = loadProfile() || {};
    // Avatar in the header (replaces the Settings button's face; same menu)
    const btn = document.querySelector('.settings-btn[onclick^="toggleSettingsMenu"]');
    if (btn) {
      btn.classList.add('nx-avatar-btn'); btn.title = 'Profile & settings';
      btn.innerHTML = `${avatarHtml(currentAccount() || { name: p.name })}<svg class="nx-mi" data-icon="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
    }
    const lock = document.querySelector('.settings-btn[onclick^="lockApp"]');
    if (lock && !lock.classList.contains('nx-icon-btn')) {
      lock.classList.add('nx-icon-btn'); lock.title = 'Lock Nexora';
      lock.innerHTML = '<svg class="nx-mi" data-icon="lock" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="11" width="15" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';
    }
    // Profile header at the top of the settings menu
    const menu = document.getElementById('settings-menu');
    if (menu) {
      let head = document.getElementById('nx-profile-head');
      if (!head) { head = document.createElement('div'); head.id = 'nx-profile-head'; menu.prepend(head); menu.insertBefore(Object.assign(document.createElement('div'), { className: 'settings-divider' }), head.nextSibling); }
      const kind = { salary: 'Salaried', freelance: 'Freelance', both: 'Salary + freelance' }[p.income] || 'Personal';
      head.innerHTML = `${avatarHtml(currentAccount() || { name: p.name }, 'nx-avatar-lg')}
        <div style="flex:1;min-width:0;"><div class="nx-prof-name">${escH(p.name || 'Your profile')}</div>
        <div class="nx-prof-sub">${p.email ? escH(p.email) : `${kind} · ${flagOf(p.currency || 'EUR')} ${p.currency || 'EUR'}`}</div></div>`;
      // My profile at the top, Change password moves inside it, Sign out at the bottom
      if (!menu.dataset.nxAcct) {
        menu.dataset.nxAcct = '1';
        const me = Object.assign(document.createElement('button'), { className: 'settings-item', id: 'nx-me-item', innerHTML: svgOf('user').replace('<svg ', '<svg data-icon="user" ') + 'My profile' });
        me.setAttribute('onclick', "closeSettingsMenu();nxOpenMe('profile')");
        head.nextSibling.after(me);
        const yr = Object.assign(document.createElement('button'), { className: 'settings-item', id: 'nx-wrap-item', innerHTML: svgOf('star8').replace('<svg ', '<svg data-icon="star8" ') + 'Your year in Nexora' });
        yr.setAttribute('onclick', 'closeSettingsMenu();nxOpenWrap()');
        me.after(yr);
        const pw = [...menu.querySelectorAll(':scope > .settings-item')].find(b => /change password/i.test(b.textContent));
        if (pw) pw.style.display = 'none';
        const out = Object.assign(document.createElement('button'), { className: 'settings-item nx-signout-item', textContent: 'Sign out' });
        out.setAttribute('onclick', 'closeSettingsMenu();nxSignOut()');
        const footer = document.getElementById('settings-footer');
        footer.before(out, Object.assign(document.createElement('div'), { className: 'settings-divider' }));
      }
    }
    // Greeting on the Overview
    const ov = document.getElementById('tab-overview');
    if (ov) {
      let g = document.getElementById('nx-greet');
      if (!g) { g = document.createElement('div'); g.id = 'nx-greet'; ov.prepend(g); }
      const h = new Date().getHours(), part = h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening';
      g.innerHTML = `<div class="nx-greet-title">${part}${p.name ? ', ' + escH(p.name.split(/\s+/)[0]) : ''}</div>
        <div class="nx-greet-sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>`;
      g.innerHTML = `<div>${g.innerHTML}</div><button class="btn-ghost nx-cust-btn" onclick="nxDashEdit(true)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>Customize</button>`;
    }
    // What the answers change
    const salaryBtn = document.querySelector('nav button[onclick^="showTab(\'salary\'"]');
    if (salaryBtn) salaryBtn.style.display = p.income === 'freelance' ? 'none' : '';
    const portWrap = document.getElementById('nav-portfolio-btn')?.closest('.nav-drop');
    if (portWrap) portWrap.style.display = p.invests === false ? 'none' : '';
  }

  // ── First-run setup ────────────────────────────────────────────
  let _setup = null, _step = 0;
  const STEPS = [
    { id: 'name',  title: 'Welcome to Nexora', sub: 'A few questions so Nexora fits the way you handle money. You can change any answer later.', skip: s => s._fromSignup },
    { id: 'income', title: 'How are you paid?', sub: 'Nexora shows the tools that match.' },
    { id: 'payday', title: 'When does your salary arrive?', sub: 'Your budget month will start on that day.', skip: s => s.income === 'freelance' },
    { id: 'invest', title: 'Do you invest?', sub: 'Portfolios, dividends and risk, or hide them.' },
    { id: 'currency', title: 'Your main currency', sub: 'Used to show your figures.' },
    { id: 'done',  title: 'You’re all set', sub: 'Here’s what Nexora set up for you.' },
  ];
  const SI = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const SETUP_IC = {
    salary: SI('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>'),
    freelance: SI('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9.5 13h6M9.5 17h4"/>'),
    both: SI('<path d="M12 3l2.2 5.3L20 9l-4.4 3.8L17 18.5 12 15.6 7 18.5l1.4-5.7L4 9l5.8-.7z"/>'),
    auto: SI('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M14.5 15.5l1.5 1.5 3-3"/>'),
    fixed: SI('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
    calendar: SI('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2"/>'),
    yes: SI('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    no: SI('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>'),
  };
  const opt = (key, val, label, desc, icon) => `<button class="nx-opt${_setup[key] === val ? ' sel' : ''}" onclick="nxSet('${key}', ${JSON.stringify(val).replace(/"/g, '&quot;')})">
      <span class="nx-opt-ic">${icon}</span><span><span class="nx-opt-label">${label}</span><span class="nx-opt-desc">${desc}</span></span></button>`;
  function stepBody(id) {
    if (id === 'name') return `<label class="nx-lbl">What should we call you?</label>
      <input id="nx-name" class="nx-input" placeholder="Your first name" value="${escH(_setup.name || '')}" oninput="nxSet('name', this.value, true)">`;
    if (id === 'income') return opt('income', 'salary', 'Salary', 'A monthly payslip from an employer', SETUP_IC.salary) +
      opt('income', 'freelance', 'Freelance', 'Invoices and irregular income', SETUP_IC.freelance) + opt('income', 'both', 'Both', 'A salary plus side income', SETUP_IC.both);
    if (id === 'payday') return opt('payday', 'auto', 'A business day near the end of the month', `Business day no. <input class="nx-day" type="number" min="1" max="10" value="${bizN(_setup)}" onclick="event.stopPropagation()" oninput="nxSet('bizDay', +this.value, true)"> from the end (1 is the last)`, SETUP_IC.auto) +
      opt('payday', 'fixed', 'A fixed day', `On day <input class="nx-day" type="number" min="1" max="31" value="${_setup.day || 25}" onclick="event.stopPropagation()" oninput="nxSet('day', +this.value, true)"> of each month`, SETUP_IC.fixed) +
      opt('payday', 'calendar', 'Start of the month', 'Budget months follow the calendar', SETUP_IC.calendar);
    if (id === 'invest') return opt('invests', true, 'Yes, I invest', 'Show Portfolio, Dividends and Risk', SETUP_IC.yes) + opt('invests', false, 'Not right now', 'Hide them. You can turn them on later', SETUP_IC.no);
    if (id === 'currency') return `<div class="nx-ccy-grid">${CCY.map(([c, , n]) => `<button class="nx-ccy-card${(_setup.currency || 'EUR') === c ? ' sel' : ''}" onclick="nxSet('currency','${c}')">${flagIc(c, 22)}<span class="nx-ccy-text"><span class="nx-ccy-name">${n}</span><span class="nx-ccy-code">${c}</span></span></button>`).join('')}</div>`;
    const lines = [
      `Hello${_setup.name ? ', ' + escH(_setup.name) : ''}. Your dashboard greets you by name`,
      _setup.income === 'freelance' ? 'Salary tab hidden; Extra income first' : 'Salary tab and payslip import ready',
      _setup.income !== 'freelance' ? ({ auto: `Budget months start on the ${bizLabel(bizN(_setup))}`, fixed: `Budget months start on day ${_setup.day || 25}`, calendar: 'Budget months follow the calendar' }[_setup.payday || 'auto']) : null,
      _setup.invests === false ? 'Investing tabs hidden' : 'Portfolio, Dividends and Risk on',
      `Figures shown in ${flagOf(_setup.currency || 'EUR')} ${_setup.currency || 'EUR'}`,
    ].filter(Boolean);
    return `<ul class="nx-summary">${lines.map(l => `<li><span>${CHECK}</span>${l}</li>`).join('')}</ul>`;
  }
  function renderSetup() {
    const s = STEPS[_step], m = document.getElementById('nx-setup');
    const visible = STEPS.filter(x => !(x.skip && x.skip(_setup)));
    const idx = visible.indexOf(s);
    m.querySelector('.nx-setup-card').innerHTML = `
      <div class="nx-dots">${visible.map((_, i) => `<span class="${i <= idx ? 'on' : ''}"></span>`).join('')}</div>
      <div class="nx-setup-title">${s.title}</div><div class="nx-setup-sub">${s.sub}</div>
      <div class="nx-setup-body">${stepBody(s.id)}</div>
      <div class="nx-setup-foot">
        ${idx > 0 ? '<button class="btn-ghost" onclick="nxNav(-1)">Back</button>' : '<button class="btn-ghost" onclick="nxCloseSetup()">Skip for now</button>'}
        <button class="btn" onclick="nxNav(1)">${s.id === 'done' ? 'Open my dashboard' : 'Continue'}</button>
      </div>`;
    if (s.id === 'name') setTimeout(() => document.getElementById('nx-name')?.focus(), 30);
  }
  window.nxSet = (k, v, quiet) => { _setup[k] = v; if (!quiet) renderSetup(); };
  window.nxNav = dir => {
    if (STEPS[_step].id === 'done' && dir > 0) return nxFinish();
    const from = _step;
    do { _step += dir; } while (STEPS[_step] && STEPS[_step].skip && STEPS[_step].skip(_setup));
    if (!STEPS[_step]) _step = from;
    renderSetup();
  };
  window.nxOpenSetup = (opts = {}) => {
    _setup = Object.assign({ income: 'salary', payday: 'auto', invests: true, currency: 'EUR' }, loadProfile() || {}, opts.fromSignup ? { _fromSignup: true } : {});
    _step = 0;
    while (STEPS[_step].skip && STEPS[_step].skip(_setup)) _step++;
    let m = document.getElementById('nx-setup');
    if (!m) { m = document.createElement('div'); m.id = 'nx-setup'; m.innerHTML = '<div class="nx-setup-card"></div>'; document.body.appendChild(m); }
    m.style.display = 'flex';
    renderSetup();
  };
  window.nxCloseSetup = () => { document.getElementById('nx-setup').style.display = 'none'; if (!loadProfile()) saveProfile({}); applyProfile(); };
  // Payday rule "business day no. N from the end": 1 = the last business day, 2 = the
  // second-to-last (the app's only rule until now). The app's secondToLastBusinessDay()
  // is swapped for this on load, so every budget-month boundary follows it.
  // To port: state.paycheckBizDay = N and nthLastBusinessDay(year, month, n) in render.js.
  // Public holidays of the profile's country don't count either (holidays.js).
  const countryOf = p => p?.country || NX_HOL.guessCountry(lsGet('nexora_lang', 'en'));
  let _bizN = 2, _country = null;
  const bizN = p => Math.min(10, Math.max(1, Math.round(+p?.bizDay) || 2));
  const nthLastBusinessDay = (year, month, n, cc = _country) => NX_HOL.nthLastBusinessDay(year, month, n, cc).date;
  const bizLabel = n => n === 1 ? 'last business day' : `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}-to-last business day`;
  // Payday → budget month boundaries; currency → portfolios without their own
  function applyPrefs(p) {
    if (!p || typeof state === 'undefined') return;
    _bizN = bizN(p); _country = countryOf(p);
    // A preference that was never set leaves the data as it is (a profile upgraded from Marduk keeps its own rule)
    if (p.income === 'freelance') state.paycheckDay = null;
    else if (p.payday) state.paycheckDay = p.payday === 'auto' ? 'auto' : p.payday === 'fixed' ? (p.day || 25) : null;
    (state.portfolios || []).forEach(pf => { if (!pf.currency) pf.currency = p.currency || 'EUR'; });
  }
  function nxFinish() {
    saveProfile(_setup);
    applyPrefs(_setup);
    document.getElementById('nx-setup').style.display = 'none';
    applyProfile(); renderAll();
  }

  // ── Portfolio ⋯ menu: currency with flags in its own sub-menu; New portfolio → Actions
  function restylePortfolioMenus() {
    const menu = document.getElementById('port-menu'), actions = document.getElementById('actions-menu');
    if (!menu || menu.dataset.nx) return;
    menu.dataset.nx = '1';
    menu.querySelectorAll('.port-menu-label, [data-ccy]').forEach(el => el.style.display = 'none');
    const newBtn = [...menu.querySelectorAll('.settings-item')].find(b => /new portfolio/i.test(b.textContent));
    if (newBtn && actions) {
      actions.appendChild(Object.assign(document.createElement('div'), { className: 'settings-divider' }));
      newBtn.setAttribute('onclick', 'closeActionsMenu();addPortfolio()');
      actions.appendChild(newBtn);
    }
    // drop the now-doubled dividers, keep one between the two groups
    const divs = [...menu.querySelectorAll(':scope > .settings-divider')];
    divs.slice(1).forEach(d => d.remove());
    const row = document.createElement('button');
    row.className = 'settings-item nx-ccy-row';
    row.innerHTML = '<svg class="nx-mi" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg> Currency <span class="nx-ccy-cur"></span><svg class="nx-mi nx-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>';
    const sub = document.createElement('div');
    sub.className = 'nx-ccy-sub';
    row.onclick = e => {
      e.stopPropagation();
      const cur = portCurrency();
      sub.innerHTML = '<div class="nx-sub-title">Show values in</div>' + CCY.map(([c, sym, n]) => `
        <button class="nx-ccy-item${c === cur ? ' active' : ''}" data-c="${c}">${flagIc(c, 20)}<span class="nx-ccy-text"><span class="nx-ccy-name">${n}</span><span class="nx-ccy-code">${c} · ${sym}</span></span>${c === cur ? CHECK : ''}</button>`).join('');
      sub.querySelectorAll('[data-c]').forEach(b => b.onclick = ev => { ev.stopPropagation(); closePortMenu(); sub.classList.remove('open'); setPortCurrency(b.dataset.c); });
      sub.classList.toggle('open');
    };
    divs[0].after(row);
    menu.appendChild(sub);
    // closing the ⋯ menu also closes the sub-menu
    new MutationObserver(() => { if (!menu.classList.contains('open')) sub.classList.remove('open'); }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  }
  function syncCcyRow() {
    const el = document.querySelector('.nx-ccy-cur');
    if (el && typeof portCurrency === 'function') { const c = portCurrency(); el.innerHTML = `${flagIc(c, 13)} ${c}`; }
  }

  // ── Budget: "Monthly Overview" as one clear split of the month's income ──
  function budgetNumbers(key) {
    const sal = (state.salaries || []).find(s => s.month === key)?.amount || 0;
    const extra = (state.extraIncomes || []).filter(x => x.month === key).reduce((s, x) => s + +x.amount, 0);
    const income = sal + extra;
    const spent = state.expenses.filter(e => expenseBelongsToMonth(e, key)).reduce((s, e) => s + +e.amount, 0);
    const alloc = typeof allocationTotalForMonth === 'function' ? allocationTotalForMonth(key) : 0;
    const saved = Math.max(0, income - spent - alloc);
    const base = Math.max(income, spent + alloc) || 1;
    const limit = state.budgets.reduce((s, b) => s + (+b.limit || 0), 0);
    const used = limit ? spent / limit : 0;
    return { income, spent, alloc, saved, base, limit, used };
  }
  const usedColour = used => used > 1 ? 'var(--down)' : used > 0.85 ? '#F5B84B' : 'var(--mint)';
  function nxBudgetOverview() {
    const spentBar = document.getElementById('bud-bar-spent'); if (!spentBar) return;
    const card = spentBar.closest('.card');
    if (!card.dataset.nx) { card.dataset.nx = '1'; [...card.children].forEach(ch => ch.style.display = 'none'); card.insertAdjacentHTML('beforeend', '<div id="nx-bud"></div>'); }
    const { income, spent, alloc, saved, base, limit, used } = budgetNumbers(selectedBudgetMonth || getExpenseMonthKey(now.getFullYear(), now.getMonth()));
    const segs = [['Spent', spent, 'var(--down)'], ['Invested', alloc, 'var(--gold)'], ['Saved', saved, 'var(--mint)']].filter(s => s[1] > 0);
    const pctOf = v => Math.round(v / (income || base) * 100);
    const usedCol = usedColour(used);
    document.getElementById('nx-bud').innerHTML = `
      <div class="nx-bud-head"><div class="card-title" style="margin:0;">This month at a glance</div>
        <div class="nx-bud-total"><strong>${eur(income, 0)}</strong> income</div></div>
      <div class="nx-split">${segs.map(([l, v, c]) => `<div class="nx-split-seg" style="flex:${v};background:${c};" title="${l}: ${eur(v)}"></div>`).join('')}</div>
      <div class="nx-split-legend">${segs.map(([l, v, c]) => `
        <div class="nx-leg"><span class="nx-leg-dot" style="background:${c};"></span><div><div class="nx-leg-label">${l}</div>
        <div class="nx-leg-val">${eur(v, 0)} <span>${pctOf(v)}%</span></div></div></div>`).join('')}</div>
      <div class="nx-limit">
        <div class="nx-limit-row"><span>Budget used</span><span><strong>${eur(spent, 0)}</strong> of ${eur(limit, 0)} · <strong style="color:${usedCol};">${Math.round(used * 100)}%</strong></span></div>
        <div class="nx-limit-track"><div class="nx-limit-fill" style="width:${Math.min(100, used * 100).toFixed(1)}%;background:${usedCol};"></div></div>
      </div>`;
  }

  // ══════════════ CUSTOMIZABLE DASHBOARD ══════════════
  // Every Overview card becomes a widget on a 12-column grid: reorder by dragging,
  // pick a width, hide it, or add cards from other tabs. Saved per profile.
  const DASH_KEY = 'nexora_dash';
  const SIZE_LABEL = { 4: 'S', 6: 'M', 8: 'L', 12: 'Full' };
  const cardOf = id => document.getElementById(id)?.closest('.card');
  const WIDGETS = [
    { id: 'kpis', title: 'Key figures', find: () => document.querySelector('#tab-overview .stats-grid'), size: 12, sizes: [12] },
    { id: 'ai', title: 'Your month in review', find: () => document.getElementById('ai-summary-card'), size: 12, sizes: [6, 12] },
    { id: 'spending', title: 'Spending · last 6 months', find: () => cardOf('chart-spending'), size: 8 },
    { id: 'alloc', title: 'Allocation by class', find: () => cardOf('chart-alloc'), size: 4 },
    { id: 'toppos', title: 'Top positions', find: () => cardOf('top-positions'), size: 6 },
    { id: 'catspend', title: 'Top categories', find: () => cardOf('chart-catspend'), size: 6 },
    { id: 'recent', title: 'Recent expenses', find: () => cardOf('ov-recent-body'), size: 12, sizes: [6, 8, 12] },
    { id: 'nw', title: 'Net worth history', find: () => cardOf('chart-nw-history'), size: 8 },
    { id: 'savrate', title: 'Savings rate history', find: () => cardOf('chart-savrate'), size: 4 },
    { id: 'income', title: 'Income history', find: () => cardOf('chart-income-history'), size: 12 },
    { id: 'budget', title: 'Budget this month', make: true, size: 6, hidden: true },     // from the Budget tab
    { id: 'goals', title: 'Goals', make: true, size: 6, hidden: true },                  // from the Goals tab
  ];
  const DI = d => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC_GRIP = DI('<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>');
  const IC_HIDE = DI('<path d="M3 3l18 18"/><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.7 3.8M6.6 6.6A13 13 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>');
  const IC_PLUS = DI('<path d="M12 5v14M5 12h14"/>');
  let dash = null, dragId = null;
  const dashDefault = () => ({ order: WIDGETS.map(w => w.id), hidden: WIDGETS.filter(w => w.hidden).map(w => w.id), size: {} });
  function dashLoad() {
    let d = null; try { d = JSON.parse(localStorage.getItem(DASH_KEY) || 'null'); } catch (e) {}
    d = d && Array.isArray(d.order) ? d : dashDefault();
    WIDGETS.forEach(w => { if (!d.order.includes(w.id)) { d.order.push(w.id); if (w.hidden) d.hidden.push(w.id); } });
    return d;
  }
  const dashSave = () => { try { localStorage.setItem(DASH_KEY, JSON.stringify(dash)); } catch (e) {} };

  function buildDash() {
    const ov = document.getElementById('tab-overview');
    if (!ov || document.getElementById('nx-dash')) return;
    dash = dashLoad();
    const bar = Object.assign(document.createElement('div'), { id: 'nx-dash-bar' });
    bar.innerHTML = `<div class="nx-dash-bar-text"><strong>Customize your dashboard</strong><span>Drag cards to reorder, pick a width, or hide what you don't need.</span></div>
      <button class="btn-ghost" onclick="nxDashReset()">Reset</button><button class="btn" onclick="nxDashEdit(false)">Done</button>`;
    const tray = Object.assign(document.createElement('div'), { id: 'nx-dash-tray' });
    const grid = Object.assign(document.createElement('div'), { id: 'nx-dash' });
    WIDGETS.forEach(w => {
      const el = w.make ? Object.assign(document.createElement('div'), { className: 'card', id: 'nx-wc-' + w.id }) : w.find();
      if (!el) return;
      const sizes = w.sizes || [4, 6, 8, 12];
      const box = Object.assign(document.createElement('div'), { className: 'nx-w' });
      box.dataset.id = w.id;
      box.innerHTML = `<div class="nx-w-tools"><span class="nx-w-grip" title="Drag to move">${IC_GRIP}</span>
        ${sizes.length > 1 ? `<span class="nx-w-sizes">${sizes.map(s => `<button class="nx-w-size" data-s="${s}" title="Width">${SIZE_LABEL[s]}</button>`).join('')}</span>` : ''}
        <button class="nx-w-hide" title="Hide ${w.title}">${IC_HIDE}</button></div>`;
      box.appendChild(el);
      grid.appendChild(box);
    });
    const greet = document.getElementById('nx-greet');
    if (greet) greet.after(bar, tray, grid); else ov.prepend(bar, tray, grid);
    ov.querySelectorAll(':scope > .chart-grid-2, :scope > .chart-grid-3').forEach(g => { if (!g.children.length) g.remove(); });

    grid.addEventListener('click', e => {
      const box = e.target.closest('.nx-w'); if (!box) return;
      const id = box.dataset.id, s = e.target.closest('[data-s]');
      if (s) { dash.size[id] = +s.dataset.s; dashApply(); }
      else if (e.target.closest('.nx-w-hide')) { dash.hidden.push(id); dashApply(); }
    });
    tray.addEventListener('click', e => {
      const b = e.target.closest('[data-add]'); if (!b) return;
      dash.hidden = dash.hidden.filter(x => x !== b.dataset.add); dashApply();
      const box = grid.querySelector(`.nx-w[data-id="${b.dataset.add}"]`);
      box.classList.add('nx-just-added'); setTimeout(() => box.classList.remove('nx-just-added'), 1200);
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    grid.addEventListener('dragstart', e => {
      const box = e.target.closest('.nx-w');
      if (!box || !document.body.classList.contains('nx-dash-editing')) return e.preventDefault();
      dragId = box.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
      requestAnimationFrame(() => { if (dragId === box.dataset.id) box.classList.add('dragging'); });
    });
    grid.addEventListener('dragover', e => {
      if (!dragId) return;
      e.preventDefault();
      const over = e.target.closest('.nx-w'), dragged = grid.querySelector(`.nx-w[data-id="${dragId}"]`);
      if (!over || over === dragged) return;
      const r = over.getBoundingClientRect(), wide = r.width > grid.clientWidth * 0.75;
      const before = wide ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
      if (before && over.previousElementSibling !== dragged) { over.before(dragged); dashLayout(); }
      else if (!before && over.nextElementSibling !== dragged) { over.after(dragged); dashLayout(); }
    });
    grid.addEventListener('dragend', () => {
      grid.querySelectorAll('.dragging').forEach(b => b.classList.remove('dragging'));
      dragId = null; dash.order = [...grid.children].map(b => b.dataset.id); dashSave();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('nx-dash-editing')) nxDashEdit(false); });
    dashApply();
  }

  // Lay the visible cards out row by row; a row that doesn't reach 12 columns
  // shares the leftover among its cards, so changing one card never leaves a hole.
  function dashLayout() {
    const grid = document.getElementById('nx-dash'); if (!grid) return;
    const items = [];
    grid.querySelectorAll('.nx-w').forEach(box => {
      const w = WIDGETS.find(x => x.id === box.dataset.id), size = dash.size[w.id] || w.size;
      box.classList.toggle('nx-off', dash.hidden.includes(w.id));
      box.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', +b.dataset.s === size));
      if (getComputedStyle(box).display !== 'none') items.push({ box, size });
    });
    let row = [], sum = 0;
    const flush = () => {
      const left = 12 - sum, n = row.length;
      row.forEach((it, i) => { it.span = it.size + Math.floor(left / n) + (i >= n - left % n ? 1 : 0); });
      row = []; sum = 0;
    };
    items.forEach(it => { if (sum + it.size > 12) flush(); row.push(it); sum += it.size; });
    if (row.length) flush();
    items.forEach(({ box, span }) => {
      if (box.style.gridColumn === `span ${span}`) return;
      box.style.gridColumn = `span ${span}`;
      box.classList.toggle('nx-wide', span >= 5);
    });
    // Chart.js normally catches container changes itself; tell it directly so
    // nothing waits on a ResizeObserver tick (and charts in a row that grew taller fill it).
    if (grid.offsetParent) grid.querySelectorAll('canvas').forEach(c => { const ch = Chart.getChart(c); if (ch) ch.resize(); });
  }

  function dashApply() {
    const grid = document.getElementById('nx-dash'); if (!grid) return;
    dash.order.forEach(id => { const b = grid.querySelector(`.nx-w[data-id="${id}"]`); if (b) grid.appendChild(b); });
    dashLayout();
    const off = dash.order.filter(id => dash.hidden.includes(id)).map(id => WIDGETS.find(w => w.id === id)).filter(Boolean);
    document.getElementById('nx-dash-tray').innerHTML = off.length
      ? `<span class="nx-tray-label">Add a card</span>${off.map(w => `<button class="nx-chip" data-add="${w.id}">${IC_PLUS}${w.title}</button>`).join('')}`
      : '<span class="nx-tray-label">Every card is on your dashboard</span>';
    renderDashExtras();
    dashSave();
  }

  function renderDashExtras() {
    if (!dash) return;
    const b = document.getElementById('nx-wc-budget');
    if (b && !dash.hidden.includes('budget')) {
      const key = getExpenseMonthKey(now.getFullYear(), now.getMonth());
      const { spent, limit, used } = budgetNumbers(key);
      const col = usedColour(used), left = limit - spent;
      const cats = state.budgets.map(x => {
        const s = state.expenses.filter(e => e.cat === x.cat && expenseBelongsToMonth(e, key)).reduce((a, e) => a + +e.amount, 0);
        return { cat: x.cat, s, l: +x.limit, u: x.limit ? s / x.limit : 0 };
      }).sort((a, z) => z.u - a.u).slice(0, 3);
      b.innerHTML = `<div class="card-title">Budget this month</div>
        <div class="nx-db-big"><strong style="color:${left < 0 ? 'var(--down)' : 'var(--text)'};">${eur(Math.abs(left), 0)}</strong> ${left < 0 ? 'over budget' : 'left to spend'}</div>
        <div class="nx-db-sub">${eur(spent, 0)} of ${eur(limit, 0)} · ${Math.round(used * 100)}% used</div>
        <div class="nx-limit-track" style="margin:12px 0 16px;"><div class="nx-limit-fill" style="width:${Math.min(100, used * 100).toFixed(1)}%;background:${col};"></div></div>
        ${cats.map(c => `<div class="nx-db-row"><span>${escH(c.cat)}</span><span class="nx-db-mini"><span style="width:${Math.min(100, c.u * 100).toFixed(0)}%;background:${usedColour(c.u)};"></span></span><span class="nx-db-num">${Math.round(c.u * 100)}%</span></div>`).join('')}`;
    }
    const g = document.getElementById('nx-wc-goals');
    if (g && !dash.hidden.includes('goals')) {
      const goals = (state.goals || []).slice(0, 4);
      g.innerHTML = `<div class="card-title">Goals</div>` + (goals.length ? goals.map(x => {
        const pct = x.target ? Math.min(1, (+x.current || 0) / x.target) : 0;
        return `<div class="nx-goal"><div class="nx-goal-row"><span class="nx-goal-name">${escH(x.name)}</span><span class="nx-goal-num"><strong>${eur(+x.current || 0, 0)}</strong> of ${eur(+x.target, 0)}</span></div>
          <div class="nx-limit-track"><div class="nx-limit-fill nx-goal-fill" style="width:${(pct * 100).toFixed(1)}%;"></div></div></div>`;
      }).join('') : '<div class="nx-db-sub">No goals yet.</div>');
    }
  }

  window.nxDashEdit = on => {
    document.body.classList.toggle('nx-dash-editing', on);
    document.querySelectorAll('#nx-dash .nx-w').forEach(b => b.draggable = on);
    if (on) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window.nxDashReset = () => { dash = dashDefault(); dashApply(); };

  // ══════════════ SALARY ══════════════
  // One main card for the latest payslip, one "this year" card, one chart, and a
  // payslip table whose rows open for the detail. Replaces 10 equal stat cards,
  // a perks strip, three overlapping charts and a full-width drop banner.
  const cssv = n => getComputedStyle(document.body).getPropertyValue(n).trim();
  const sortedPayslips = () => [...(state.payslips || [])].sort((a, b) => a.period.localeCompare(b.period));
  const tile = (cls, icon) => `<span class="nx-ic ${cls}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${MI[icon]}</svg></span>`;
  const shortMonth = (p, withYear) => { const [y, m] = p.period.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'short' }) + (withYear ? ' ' + String(y).slice(2) : ''); };
  const openRows = new Set();

  function nxSalary() {
    const tab = document.getElementById('tab-salary'), summary = document.getElementById('salary-summary');
    if (!tab || !summary) return;
    let chartCard = document.getElementById('nx-sal-chart-card');
    if (!chartCard) {
      summary.insertAdjacentHTML('afterend', `<div class="card" id="nx-sal-chart-card">
        <div class="nx-sal-chart-head"><div class="card-title" style="margin:0;">Gross to take-home, month by month</div>
          <div class="nx-sal-keys"><span><i style="background:var(--up)"></i>Take-home</span><span><i style="background:#A78BFA"></i>Social Security</span><span><i style="background:var(--down)"></i>IRS</span></div></div>
        <div class="chart-wrap nx-sal-chart-wrap"><canvas id="nx-sal-chart"></canvas></div></div>`);
      chartCard = document.getElementById('nx-sal-chart-card');
      const drop = document.querySelector('#salary-drop-zone > span:last-child');
      if (drop) drop.textContent = 'Drop the payslip PDF to import it';
    }
    const ps = sortedPayslips();
    tab.classList.toggle('nx-sal', ps.length > 0);
    chartCard.style.display = ps.length ? '' : 'none';
    if (!ps.length) return;

    const L = ps[ps.length - 1], P = ps[ps.length - 2];
    const gross = +L.grossSalary || 0, net = +L.netSalary || 0, ss = +L.ssDeduction || 0, irs = +L.irsDeduction || 0;
    const other = Math.max(0, gross - net - ss - irs);
    const segs = [['Take-home', net, 'var(--up)'], ['Social Security', ss, '#A78BFA'], ['IRS', irs, 'var(--down)'], ['Other deductions', other, 'var(--text3)']].filter(s => s[1] > 0.005);
    const delta = P ? net - (+P.netSalary || 0) : null;
    const year = L.period.slice(0, 4), ytd = ps.filter(p => p.period.startsWith(year));
    const sum = k => ytd.reduce((s, p) => s + (+p[k] || 0), 0);
    const ytdSS = sum('ssDeduction'), ytdIRS = sum('irsDeduction');
    const rate = gross ? (ss + irs) / gross * 100 : 0;
    const perks = [['Meal card', L.mealAllowance, ' / month'], ['Hours exemption', L.hoursExemption], ['Holiday ⅟₁₂', L.holidaySubsidy], ['Christmas ⅟₁₂', L.christmasSubsidy]].filter(p => +p[1] > 0);
    const meta = [L.periodLabel, L.employer, L.functionTitle].filter(Boolean).map(esc).join(' · ');
    const yrRow = (cls, icon, label, val, sub) => `<div class="nx-sal-yr">${tile(cls, icon)}<div class="nx-sal-yr-text"><div class="nx-sal-yr-label">${label}</div>${sub ? `<div class="nx-sal-yr-sub">${sub}</div>` : ''}</div><div class="nx-sal-yr-val">${val}</div></div>`;

    summary.innerHTML = `<div class="nx-sal-top">
      <div class="card nx-sal-hero">
        <div class="card-title" style="margin-bottom:2px;">Latest payslip</div>
        <div class="nx-sal-meta">${meta}</div>
        <div class="nx-sal-net"><span class="nx-sal-net-val">${eur(net)}</span><span class="nx-sal-net-lbl">take-home</span>
          ${delta !== null && Math.abs(delta) >= 0.005 ? `<span class="nx-delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : '−'}${eur(Math.abs(delta))} vs ${esc(P.periodLabel.split(' ')[0])}</span>` : ''}</div>
        <div class="nx-sal-split-head"><span>Where your gross goes</span><strong>${eur(gross)}</strong></div>
        <div class="nx-split">${segs.map(([l, v, c]) => `<div class="nx-split-seg" style="flex:${v};background:${c};" title="${l}: ${eur(v)}"></div>`).join('')}</div>
        <div class="nx-split-legend">${segs.map(([l, v, c]) => `<div class="nx-leg"><span class="nx-leg-dot" style="background:${c};"></span><div><div class="nx-leg-label">${l}</div><div class="nx-leg-val">${eur(v)} <span>${(v / gross * 100).toFixed(1)}%</span></div></div></div>`).join('')}</div>
        ${perks.length ? `<div class="nx-sal-perks">${perks.map(p => `<span class="nx-perk">${esc(p[0])} <strong>${eur(+p[1])}</strong>${p[2] || ''}</span>`).join('')}</div>` : ''}
      </div>
      <div class="card nx-sal-year">
        <div class="card-title" style="margin-bottom:2px;">${year} so far</div>
        <div class="nx-sal-meta">${ytd.length} payslip${ytd.length === 1 ? '' : 's'}</div>
        ${yrRow('mint', 'wallet', 'Take-home', eur(sum('netSalary')))}
        ${yrRow('blue', 'note', 'Gross', eur(sum('grossSalary')))}
        ${yrRow('coral', 'bank', 'Taxes', eur(ytdSS + ytdIRS), `Social Security ${eur(ytdSS, 0)} · IRS ${eur(ytdIRS, 0)}`)}
        ${yrRow('violet', 'pie', 'Effective tax rate', rate.toFixed(1) + '%', 'latest payslip')}
      </div>
    </div>`;

    // Payslip table: one line per month, the detail opens underneath
    const detail = p => [['Base salary', p.baseSalary], ['Social Security', p.ssDeduction], ['IRS', p.irsDeduction], ['Meal card', p.mealAllowance],
      ['Hours exemption', p.hoursExemption], ['Holiday ⅟₁₂', p.holidaySubsidy], ['Christmas ⅟₁₂', p.christmasSubsidy]]
      .filter(d => +d[1] > 0).map(([l, v]) => `<div><span>${l}</span><strong>${eur(+v)}</strong></div>`).join('')
      + (p.department ? `<div><span>Department</span><strong>${esc(p.department)}</strong></div>` : '');
    const list = document.getElementById('salary-list');
    list.innerHTML = `<table class="data-table nx-sal-table"><thead><tr><th>Month</th><th>Gross</th><th>Take-home</th><th>Taxes</th><th>Tax rate</th><th></th></tr></thead><tbody>
      ${[...ps].reverse().map(p => {
        const tx = (+p.ssDeduction || 0) + (+p.irsDeduction || 0), r = p.grossSalary ? tx / p.grossSalary * 100 : 0, open = openRows.has(p.id);
        return `<tr class="nx-sal-row${open ? ' open' : ''}" data-id="${esc(p.id)}">
            <td><svg class="nx-sal-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg><strong>${esc(p.periodLabel)}</strong></td>
            <td>${eur(p.grossSalary)}</td><td><strong>${eur(p.netSalary)}</strong></td><td class="down-text">${eur(tx)}</td>
            <td><span class="nx-rate"><span style="width:${Math.min(100, r * 2).toFixed(0)}%"></span></span>${r.toFixed(1)}%</td>
            <td><button class="nx-row-del" data-del="${esc(p.id)}" title="Remove payslip"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${MI.trash}</svg></button></td></tr>
          <tr class="nx-sal-detail"${open ? '' : ' hidden'}><td colspan="6"><div class="nx-sal-detail-grid">${detail(p)}</div></td></tr>`;
      }).join('')}</tbody></table>`;
    list.querySelectorAll('.nx-sal-row').forEach(tr => tr.addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) { e.stopPropagation(); delPayslip(del.dataset.del); return; }
      const id = tr.dataset.id, d = tr.nextElementSibling;
      if (openRows.has(id)) openRows.delete(id); else openRows.add(id);
      tr.classList.toggle('open'); d.hidden = !d.hidden;
    }));
  }

  let _nxSalChart = null;
  function nxSalaryChart() {
    const cv = document.getElementById('nx-sal-chart'), ps = sortedPayslips();
    if (_nxSalChart) { _nxSalChart.destroy(); _nxSalChart = null; }
    if (!cv || !ps.length) return;
    const multiYear = new Set(ps.map(p => p.period.slice(0, 4))).size > 1, bg = cssv('--bg2');
    const ds = (label, key, col) => ({ label, data: ps.map(p => +p[key] || 0), stack: 'pay', nxKeep: true,
      backgroundColor: () => col, hoverBackgroundColor: col, borderColor: bg, borderWidth: 2, borderRadius: 7, borderSkipped: false, maxBarThickness: 46 });
    _nxSalChart = new Chart(cv, {
      type: 'bar',
      data: { labels: ps.map(p => shortMonth(p, multiYear)),
        datasets: [ds('Take-home', 'netSalary', cssv('--up')), ds('Social Security', 'ssDeduction', '#A78BFA'), ds('IRS', 'irsDeduction', cssv('--down'))] },
      options: { responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false },
          tooltip: { callbacks: { title: items => ps[items[0].dataIndex].periodLabel, label: c => ` ${c.dataset.label}  ${eur(c.raw)}`,
            footer: items => 'Gross  ' + eur(ps[items[0].dataIndex].grossSalary) } } },
        scales: { x: { stacked: true, ticks: { color: cssv('--text3') } },
          y: { stacked: true, ticks: { color: cssv('--text3'), callback: v => '€' + Number(v).toLocaleString('de-DE') }, grid: {} } } },
    });
  }

  // ══════════════ BUDGET → INCOME CARD ══════════════
  // Two tiles (salary, extra income) with their totals up front; the forms open
  // only when you edit or add. The app's own inputs are moved in, not copied,
  // so logSalary()/logExtra() keep working unchanged.
  let incForm = null;   // 'sal' | 'extra' | null
  function nxIncomeCard() {
    const salIn = document.getElementById('e-sal-amount'); if (!salIn) return;
    const card = salIn.closest('.card');
    if (!card.dataset.nx) {
      card.dataset.nx = '1';
      const keep = ['bud-month-sel', 'bud-sal-day', 'e-sal-amount', 'e-sal-date', 'e-sal-btn', 'e-sal-clear', 'e-extra-desc', 'e-extra-amount', 'e-extra-date'].map(id => document.getElementById(id));
      const addBtn = card.querySelector('button[onclick^="logExtra"]');
      const shell = document.createElement('div');
      shell.className = 'nx-inc';
      shell.innerHTML = `<div class="nx-inc-head"><div><div class="card-title" style="margin:0;">Income</div><div class="nx-inc-total"></div></div><div class="nx-inc-month"></div></div>
        <div class="nx-inc-tiles">
          <div class="nx-inc-tile" data-k="sal"><div class="nx-inc-tile-top">${tile('mint', 'wallet')}<span class="nx-inc-tile-label">Salary</span><button class="nx-inc-act" data-open="sal"></button></div>
            <div class="nx-inc-val" data-v="sal"></div><div class="nx-inc-sub" data-s="sal"></div>
            <div class="nx-inc-form" data-f="sal"><div class="nx-inc-fields"><label>Amount<span data-slot="e-sal-amount"></span></label><label>Received on<span data-slot="e-sal-date"></span></label></div>
              <div class="nx-inc-btns"><span data-slot="e-sal-clear"></span><span style="flex:1"></span><button class="btn-ghost" data-close>Cancel</button><span data-slot="e-sal-btn"></span></div></div></div>
          <div class="nx-inc-tile" data-k="extra"><div class="nx-inc-tile-top">${tile('blue', 'plus')}<span class="nx-inc-tile-label">Extra income</span><button class="nx-inc-act" data-open="extra">Add</button></div>
            <div class="nx-inc-val" data-v="extra"></div><div class="nx-inc-sub" data-s="extra"></div>
            <div class="nx-inc-form" data-f="extra"><div class="nx-inc-fields"><label class="nx-inc-wide">What was it?<span data-slot="e-extra-desc"></span></label><label>Amount<span data-slot="e-extra-amount"></span></label><label>Date<span data-slot="e-extra-date"></span></label></div>
              <div class="nx-inc-btns"><span style="flex:1"></span><button class="btn-ghost" data-close>Cancel</button><span data-slot="add"></span></div></div></div>
        </div>
        <div class="nx-inc-list"></div>`;
      card.querySelectorAll(':scope > *').forEach(ch => ch.style.display = 'none');
      card.appendChild(shell);
      shell.querySelector('.nx-inc-month').append(keep[0]);
      shell.querySelector('[data-s="sal"]').append(keep[1]);
      keep.slice(2).forEach(el => el && shell.querySelector(`[data-slot="${el.id}"]`).replaceWith(el));
      shell.querySelector('[data-slot="add"]').replaceWith(addBtn);
      [keep[2], keep[3], keep[6], keep[7], keep[8]].forEach(el => { el.removeAttribute('style'); el.classList.add('nx-inc-input'); });
      [keep[4], addBtn].forEach(b => { b.removeAttribute('style'); b.classList.add('btn'); });
      keep[5].removeAttribute('style'); keep[5].className = 'btn-ghost nx-inc-remove'; keep[5].textContent = 'Remove';
      addBtn.textContent = 'Add income';
      shell.addEventListener('click', e => {
        const o = e.target.closest('[data-open]'), c = e.target.closest('[data-close]');
        if (o) { incForm = incForm === o.dataset.open ? null : o.dataset.open; nxIncomeCard(); if (incForm) setTimeout(() => shell.querySelector(`[data-f="${incForm}"] input:not([readonly])`)?.focus(), 30); }
        if (c) { incForm = null; nxIncomeCard(); }
      });
    }
    const key = selectedBudgetMonth || getExpenseMonthKey(now.getFullYear(), now.getMonth());
    const sal = (state.salaries || []).find(s => s.month === key);
    const extras = (state.extraIncomes || []).filter(x => x.month === key).sort((a, b) => b.date.localeCompare(a.date));
    const extraAmt = extras.reduce((s, x) => s + +x.amount, 0);
    const shell = card.querySelector('.nx-inc');
    shell.querySelector('.nx-inc-total').innerHTML = `<strong>${eur((sal ? +sal.amount : 0) + extraAmt)}</strong> this month`;
    shell.querySelector('[data-v="sal"]').innerHTML = sal ? eur(+sal.amount) : '<span class="nx-inc-empty">Not logged yet</span>';
    shell.querySelector('[data-open="sal"]').textContent = sal ? 'Edit' : 'Log salary';
    shell.querySelector('[data-v="extra"]').textContent = eur(extraAmt);
    shell.querySelector('[data-s="extra"]').textContent = extras.length ? `${extras.length} entr${extras.length === 1 ? 'y' : 'ies'}` : 'Freelance, bonuses, refunds…';
    shell.querySelectorAll('.nx-inc-tile').forEach(t => t.classList.toggle('editing', t.dataset.k === incForm));
    const fmtD = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    shell.querySelector('.nx-inc-list').innerHTML = extras.map(x => `<div class="nx-inc-row"><span class="nx-inc-date">${fmtD(x.date)}</span><span class="nx-inc-desc">${esc(x.desc)}</span>
      <span class="nx-inc-amt">+${eur(+x.amount)}</span><button class="nx-row-del" onclick="delExtra('${esc(x.id)}')" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${MI.trash}</svg></button></div>`).join('');
  }

  // ══════════════ SIGN UP / LOG IN / LOCK ══════════════
  // Encrypted profiles. Each profile's data file is encrypted with its own random
  // data key (AES-256-GCM). That key is stored twice, wrapped: once by the password
  // and once by the recovery key (each through PBKDF2-SHA256, 600k rounds). Either
  // one opens the file; changing the password only re-wraps the key; a wrong
  // password simply fails to unwrap it, so there's no password hash to attack on
  // its own. The profile list (name, colour) stays readable so the log-in screen
  // can show it before anything is unlocked.
  // main.js keeps one encrypted file per profile in the Drive folder; a Marduk 1.x
  // install (marduk-pw.bin + an unencrypted marduk-data.json) goes through the upgrade
  // screens once, and both leave for the local backups after the new file is checked.
  let authView = null, authSel = null, authMsg = '', appStarted = false, _dek = null;
  let _rk = null, _rkFlow = null, _upgPw = null, _upgJson = null, _saveChain = Promise.resolve();
  let _legacy = { data: false, password: false }, FRESH_STATE = '{}', APP_VERSION = '';
  const icon = (name, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${MI[name]}</svg>`;

  // ── Words (start screens in English and Portuguese) ──
  let LANG = lsGet('nexora_lang', 'en');
  const STR = {
    en: {
      tag: 'Your money,<br>clearly.', p1: 'Budgets that start on payday', p2: 'Portfolios in euros, with risk and dividends', p3: 'Payslips read for you',
      chip: 'All your money in one place', foot: 'Spending, budgets, investments, salary and goals, all in one app.',
      welcome_t: 'Welcome to Nexora', welcome_s: 'Create your profile to get started. It takes about a minute.', create: 'Create account',
      back: 'Back', back_login: 'Back to log in',
      signup_t: 'Create your account', signup_s: 'Your profile stays on this computer, and your data is encrypted with your password.',
      name: 'Name', name_ph: 'Your name', email: 'Email', optional: 'optional', password: 'Password', pw_ph: 'At least 8 characters',
      confirm: 'Confirm password', again: 'Type it again', have: 'Already have an account?', login: 'Log in',
      login_t: 'Welcome back', login_one: 'Log in to continue.', login_many: 'Choose your profile and log in.', your_pw: 'Your password',
      forgot: 'Forgot password?', new_here: 'New here?', create_one: 'Create an account', no_email: 'No email added',
      locked_t: 'Nexora is locked', locked_s: 'Enter your password to continue, {name}.', unlock: 'Unlock', not_you: 'Not {name}?', sign_out: 'Sign out',
      forgot_t: 'Reset your password', forgot_s: 'Enter the recovery key you saved when you created your profile. Your data stays exactly as it is.',
      rk: 'Recovery key', rk_ph: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', new_pw: 'New password', confirm_new: 'Confirm new password', set_new: 'Set new password',
      lost_both: 'Lost the recovery key too? Then the data can’t be opened by anyone. That’s what keeps it private.',
      rk_t: 'Save your recovery key', rk_s: 'It’s the only way back in if you forget your password. Not even Nexora can reset it without this key.',
      rk_where: 'Keep it away from this computer: in a password manager, or printed and put somewhere safe.',
      copy: 'Copy', copied: 'Copied', download: 'Download', rk_confirm: 'Type the last group to confirm you saved it', continue: 'Continue',
      creating: 'Encrypting your profile…', unlocking: 'Unlocking…', caps: 'Caps Lock is on',
      err_name: 'Please add your name.', err_email: 'That email doesn’t look right.', err_pw8: 'Use at least 8 characters for your password.',
      err_match: 'The two passwords don’t match.', err_wrong: 'Wrong password.', err_left: '{n} more before a pause.', err_wait: 'Too many attempts. Try again in {t}.',
      err_key: 'That recovery key doesn’t open this profile.', err_last: 'That isn’t the last group of your key.', err_pick: 'Choose a profile first.', err_pw: 'Enter your password.',
      strength: ['', 'Too weak', 'Fair', 'Strong'], steps_new: ['Account', 'Recovery key', 'Your setup'], steps_upg: ['Unlock', 'About you', 'Recovery key'],
      upg_t: 'Marduk is now Nexora', upg_s: 'Enter your Marduk password once. Your data moves into your new profile and is saved encrypted from now on. Nothing is lost.',
      cur_pw: 'Current password', you_t: 'Tell us about you', you_s: 'You’ll keep the same password.',
      done_toast: 'Your data is now encrypted', pw_changed: 'Password changed. You’re in.',
      upg_s_nopw: 'Choose a password. Your Marduk data moves into your new profile and is saved encrypted with it from now on.', fresh_instead: 'Start with an empty profile instead', unreadable_t: 'Your profiles can’t be read right now', unreadable_s: 'Google Drive may still be syncing the Nexora folder. Nothing has been changed. Close Nexora and open it again in a minute.', err_write: 'Couldn’t save. Check that the Google Drive folder is available.', upg_check_fail: 'The new profile couldn’t be checked, so nothing was changed. Your Marduk data is untouched. Try again.', upg_gone: 'Marduk’s data file isn’t there any more. It may already have been moved into a Nexora profile.', upg_unreadable: 'Marduk’s data file couldn’t be read. It may still be syncing from Google Drive. Try again in a minute.',
    },
    pt: {   // PT-PT, tratamento por "tu"
      tag: 'O teu dinheiro,<br>com clareza.', p1: 'Orçamentos que começam no dia do salário', p2: 'Carteiras em euros, com risco e dividendos', p3: 'Recibos de vencimento lidos por ti',
      chip: 'Todo o teu dinheiro num só lugar', foot: 'Despesas, orçamentos, investimentos, salário e objetivos, tudo numa só app.',
      welcome_t: 'Bem-vindo à Nexora', welcome_s: 'Cria o teu perfil para começar. Demora cerca de um minuto.', create: 'Criar conta',
      back: 'Voltar', back_login: 'Voltar ao início de sessão',
      signup_t: 'Cria a tua conta', signup_s: 'O teu perfil fica neste computador e os teus dados são encriptados com a tua palavra-passe.',
      name: 'Nome', name_ph: 'O teu nome', email: 'E-mail', optional: 'opcional', password: 'Palavra-passe', pw_ph: 'Pelo menos 8 caracteres',
      confirm: 'Confirmar palavra-passe', again: 'Escreve-a outra vez', have: 'Já tens conta?', login: 'Iniciar sessão',
      login_t: 'Bem-vindo de volta', login_one: 'Inicia sessão para continuar.', login_many: 'Escolhe o teu perfil e inicia sessão.', your_pw: 'A tua palavra-passe',
      forgot: 'Esqueceste-te da palavra-passe?', new_here: 'És novo por aqui?', create_one: 'Criar uma conta', no_email: 'Sem e-mail',
      locked_t: 'A Nexora está bloqueada', locked_s: 'Introduz a tua palavra-passe para continuar, {name}.', unlock: 'Desbloquear', not_you: 'Não és {name}?', sign_out: 'Terminar sessão',
      forgot_t: 'Repor a palavra-passe', forgot_s: 'Introduz a chave de recuperação que guardaste quando criaste o perfil. Os teus dados ficam exatamente como estão.',
      rk: 'Chave de recuperação', rk_ph: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', new_pw: 'Nova palavra-passe', confirm_new: 'Confirmar nova palavra-passe', set_new: 'Definir nova palavra-passe',
      lost_both: 'Também perdeste a chave? Então ninguém consegue abrir os dados. É isso que os mantém privados.',
      rk_t: 'Guarda a tua chave de recuperação', rk_s: 'É a única forma de voltares a entrar se te esqueceres da palavra-passe. Nem a Nexora a consegue repor sem esta chave.',
      rk_where: 'Guarda-a fora deste computador: num gestor de palavras-passe, ou impressa e num sítio seguro.',
      copy: 'Copiar', copied: 'Copiada', download: 'Transferir', rk_confirm: 'Escreve o último grupo para confirmares que a guardaste', continue: 'Continuar',
      creating: 'A encriptar o teu perfil…', unlocking: 'A desbloquear…', caps: 'O Caps Lock está ativo',
      err_name: 'Indica o teu nome.', err_email: 'Esse e-mail não parece estar certo.', err_pw8: 'Usa pelo menos 8 caracteres na palavra-passe.',
      err_match: 'As duas palavras-passe não coincidem.', err_wrong: 'Palavra-passe errada.', err_left: 'Mais {n} antes de uma pausa.', err_wait: 'Demasiadas tentativas. Tenta outra vez daqui a {t}.',
      err_key: 'Essa chave de recuperação não abre este perfil.', err_last: 'Esse não é o último grupo da tua chave.', err_pick: 'Escolhe primeiro um perfil.', err_pw: 'Introduz a tua palavra-passe.',
      strength: ['', 'Muito fraca', 'Razoável', 'Forte'], steps_new: ['Conta', 'Chave de recuperação', 'Configuração'], steps_upg: ['Desbloquear', 'Sobre ti', 'Chave de recuperação'],
      upg_t: 'O Marduk agora é a Nexora', upg_s: 'Introduz a tua palavra-passe do Marduk uma vez. Os teus dados passam para o teu novo perfil e ficam guardados encriptados a partir de agora. Não se perde nada.',
      cur_pw: 'Palavra-passe atual', you_t: 'Fala-nos de ti', you_s: 'Mantens a mesma palavra-passe.',
      done_toast: 'Os teus dados estão agora encriptados', pw_changed: 'Palavra-passe alterada. Já entraste.',
      upg_s_nopw: 'Escolhe uma palavra-passe. Os teus dados do Marduk passam para o teu novo perfil e ficam encriptados com ela a partir de agora.', fresh_instead: 'Começar antes com um perfil vazio', unreadable_t: 'Não é possível ler os teus perfis agora', unreadable_s: 'O Google Drive ainda pode estar a sincronizar a pasta Nexora. Nada foi alterado. Fecha a Nexora e abre-a outra vez daqui a um minuto.', err_write: 'Não foi possível guardar. Confirma que a pasta do Google Drive está disponível.', upg_check_fail: 'Não foi possível verificar o novo perfil, por isso nada foi alterado. Os teus dados do Marduk estão intactos. Tenta outra vez.', upg_gone: 'O ficheiro de dados do Marduk já não está lá. Pode já ter passado para um perfil da Nexora.', upg_unreadable: 'Não foi possível ler o ficheiro de dados do Marduk. Pode ainda estar a sincronizar com o Google Drive. Tenta outra vez daqui a um minuto.',
    },
  };
  STR.zh = {   // 简体中文
    tag: '你的财务，<br>一目了然。', p1: '从发薪日开始的预算', p2: '以欧元计价的投资组合，含风险与股息', p3: '自动读取工资单',
    chip: '所有资金尽在一处', foot: '支出、预算、投资、薪资和目标，一个应用全搞定。',
    welcome_t: '欢迎使用 Nexora', welcome_s: '创建你的资料即可开始，大约只需一分钟。', create: '创建账户',
    back: '返回', back_login: '返回登录',
    signup_t: '创建你的账户', signup_s: '你的资料保存在此电脑上，数据用你的密码加密。',
    name: '名字', name_ph: '你的名字', email: '邮箱', optional: '可选', password: '密码', pw_ph: '至少 8 个字符',
    confirm: '确认密码', again: '再输入一次', have: '已有账户？', login: '登录',
    login_t: '欢迎回来', login_one: '登录以继续。', login_many: '选择你的资料并登录。', your_pw: '你的密码',
    forgot: '忘记密码？', new_here: '第一次使用？', create_one: '创建账户', no_email: '未添加邮箱',
    locked_t: 'Nexora 已锁定', locked_s: '输入密码以继续，{name}。', unlock: '解锁', not_you: '不是 {name}？', sign_out: '退出登录',
    forgot_t: '重置密码', forgot_s: '输入你创建资料时保存的恢复密钥。你的数据保持不变。',
    rk: '恢复密钥', rk_ph: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', new_pw: '新密码', confirm_new: '确认新密码', set_new: '设置新密码',
    lost_both: '恢复密钥也丢了？那么任何人都无法打开这些数据。这正是它们保持私密的原因。',
    rk_t: '保存你的恢复密钥', rk_s: '忘记密码时，这是重新进入的唯一方式。没有它，连 Nexora 也无法重置。',
    rk_where: '把它保存在这台电脑之外：放进密码管理器，或打印出来放在安全的地方。',
    copy: '复制', copied: '已复制', download: '下载', rk_confirm: '输入最后一组字符，确认你已保存', continue: '继续',
    creating: '正在加密你的资料…', unlocking: '正在解锁…', caps: '大写锁定已开启',
    err_name: '请填写你的名字。', err_email: '这个邮箱看起来不正确。', err_pw8: '密码至少需要 8 个字符。',
    err_match: '两次输入的密码不一致。', err_wrong: '密码错误。', err_left: '再错 {n} 次将暂停。', err_wait: '尝试次数过多，请在 {t} 后重试。',
    err_key: '这个恢复密钥无法打开此资料。', err_last: '这不是你密钥的最后一组。', err_pick: '请先选择一个资料。', err_pw: '请输入你的密码。',
    strength: ['', '太弱', '一般', '强'], steps_new: ['账户', '恢复密钥', '设置'], steps_upg: ['解锁', '关于你', '恢复密钥'],
    upg_t: 'Marduk 现已更名为 Nexora', upg_s: '输入一次你的 Marduk 密码。你的数据将转入新资料，从此加密保存，不会丢失任何内容。',
    cur_pw: '当前密码', you_t: '介绍一下你自己', you_s: '你将继续使用相同的密码。',
    done_toast: '你的数据现已加密', pw_changed: '密码已更改，你已登录。',
    upg_s_nopw: '设置一个密码。你的 Marduk 数据将转入新资料，并从此用它加密保存。', fresh_instead: '改为从空白资料开始', unreadable_t: '暂时无法读取你的资料', unreadable_s: 'Google 云端硬盘可能仍在同步 Nexora 文件夹。没有任何更改。请关闭 Nexora，一分钟后再打开。', err_write: '无法保存。请检查 Google 云端硬盘文件夹是否可用。', upg_check_fail: '无法验证新资料，因此没有做任何更改。你的 Marduk 数据完好无损。请重试。', upg_gone: '找不到 Marduk 的数据文件。它可能已转入 Nexora 资料。', upg_unreadable: '无法读取 Marduk 的数据文件。它可能仍在从 Google 云端硬盘同步。请一分钟后重试。',
  };
  const T = (k, vars) => { let s = STR[LANG]?.[k] ?? STR.en[k] ?? k; if (vars && typeof s === 'string') for (const [a, b] of Object.entries(vars)) s = s.replace('{' + a + '}', b); return s; };

  const CAPS_IC = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l7.5 8H15v4H9v-4H4.5z"/><path d="M9 20h6"/></svg>';
  const pwField = (name, label, ph, auto, meter) => `<label class="nx-f"><span>${label}</span>
      <span class="nx-pw"><input name="${name}" type="password" autocomplete="${auto}" placeholder="${ph}"><button type="button" class="nx-eye" tabindex="-1" title="Show password">${icon('eye')}</button></span>
      <span class="nx-caps-msg">${CAPS_IC}${T('caps')}</span>
      ${meter ? '<span class="nx-meter" data-for="' + name + '"><i></i><i></i><i></i><b></b></span>' : ''}</label>`;
  // Caps Lock: any password field, on the start screens and in My profile
  const capsCheck = e => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement) || !inp.closest('.nx-pw') || !e.getModifierState) return;
    inp.closest('.nx-f')?.classList.toggle('nx-caps', e.getModifierState('CapsLock'));
  };
  document.addEventListener('keydown', capsCheck, true);
  document.addEventListener('keyup', capsCheck, true);

  // ── Encryption (Web Crypto) ──
  const KDF_ROUNDS = 600000, te = new TextEncoder(), td = new TextDecoder();
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function kekFrom(secret, salt) {
    const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(salt), iterations: KDF_ROUNDS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
  }
  async function wrapDek(dek, secret) {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16))), iv = crypto.getRandomValues(new Uint8Array(12));
    return { salt, iv: b64(iv), key: b64(await crypto.subtle.wrapKey('raw', dek, await kekFrom(secret, salt), { name: 'AES-GCM', iv })) };
  }
  const unwrapDek = async (slot, secret) => crypto.subtle.unwrapKey('raw', unb64(slot.key), await kekFrom(secret, slot.salt),
    { name: 'AES-GCM', iv: unb64(slot.iv) }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  // Each profile is one file, Nexora/<id>.nexora, moved by main.js and never readable there.
  // Saves, password changes and new recovery keys all go through one queue, so a
  // re-keyed file can't be overwritten by a save that still had the old keys.
  const _keys = {};
  const readFile = async id => { try { const raw = await api?.profileRead(id); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
  const putFile = async (id, f) => { const ok = await api?.profileWrite(id, JSON.stringify(f)); if (ok) _keys[id] = f.keys; return !!ok; };
  const enqueue = fn => { const p = _saveChain.then(fn); _saveChain = p.catch(() => {}); return p; };
  async function writeFile(id, json, keys) {
    keys = keys || _keys[id] || (await readFile(id))?.keys;
    if (!keys) return false;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return putFile(id, { format: 'nexora-encrypted', version: 1, kdf: { name: 'PBKDF2-SHA256', rounds: KDF_ROUNDS }, keys,
      iv: b64(iv), data: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _dek, te.encode(json))) });
  }
  const decryptWith = async (dek, f) => td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, dek, unb64(f.data)));
  async function openFile(id, secret, slot = 'password') {
    const f = await readFile(id);
    if (!f?.keys?.[slot]) throw new Error('nofile');
    const dek = await unwrapDek(f.keys[slot], secret);              // throws when the secret is wrong
    const json = await decryptWith(dek, f);
    _keys[id] = f.keys;
    return { dek, json };
  }
  // A new key slot (new password or recovery key) for the open profile, in the save queue
  const rekey = (id, slot, secret) => enqueue(async () => {
    const f = await readFile(id);
    if (!f?.keys) return false;
    f.keys = { ...f.keys, [slot]: await wrapDek(_dek, secret) };
    return putFile(id, f);
  });
  // What state.js loads and saves through. Backups of a profile are encrypted with the same
  // data key, so they open in the session that's unlocked; Marduk's old backups are plain JSON.
  let _vaultJson = null;
  window.NexoraVault = {
    json: () => _vaultJson,
    save: json => { _vaultJson = json; return enqueue(() => (_dek && currentId ? writeFile(currentId, json) : false)).catch(e => { console.error(e); return false; }); },
    listBackups: async () => (await api?.listBackups(currentId)) || [],
    readBackup: async name => {
      const raw = await api?.readBackup(name);
      if (!raw) return null;
      let f; try { f = JSON.parse(raw); } catch (e) { return null; }
      if (f.format !== 'nexora-encrypted') return raw;
      try { return _dek ? await decryptWith(_dek, f) : null; } catch (e) { return null; }
    },
  };
  const RK_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';                // no 0/O or 1/I to misread
  const newRecoveryKey = () => [...crypto.getRandomValues(new Uint8Array(24))].map(x => RK_ABC[x % 32]).join('').match(/.{4}/g).join('-');   // 120 bits
  const normKey = k => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // ── Wrong passwords: 5 tries, then pauses that double (30 s → 15 min), kept across restarts ──
  const lockKey = id => 'nexora_lock_' + id;
  const lockState = id => lsGet(lockKey(id), { fails: 0, round: 0, until: 0 });
  function registerFail(id) {
    const s = lockState(id); s.fails++;
    if (s.fails >= (s.round ? 1 : 5)) { s.round++; s.until = Date.now() + Math.min(900, 30 * 2 ** (s.round - 1)) * 1000; s.fails = 0; }
    lsSet(lockKey(id), s); return s;
  }
  const waitText = ms => { const s = Math.ceil(ms / 1000); return s < 60 ? `0:${String(s).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  let _waitTimer = null;
  function showWait(id) {
    clearInterval(_waitTimer);
    const tick = () => {
      const el = document.getElementById('nx-auth'), left = lockState(id).until - Date.now(), btn = el?.querySelector('#nx-login button[type="submit"]');
      if (!el || !el.classList.contains('open') || (authView !== 'login' && authView !== 'locked') || left <= 0) { clearInterval(_waitTimer); if (btn) btn.disabled = false; const e = el?.querySelector('.nx-auth-err'); if (e && left <= 0) e.textContent = ''; return; }
      el.querySelector('.nx-auth-err').textContent = T('err_wait', { t: waitText(left) });
      if (btn) btn.disabled = true;
    };
    tick(); _waitTimer = setInterval(tick, 1000);
  }

  // ── Screens ──
  const acctRow = (a, sel) => `<button type="button" class="nx-acct${sel ? ' sel' : ''}" data-pick="${escH(a.id)}">
      ${avatarHtml(a)}
      <span class="nx-acct-text"><b>${escH(a.name)}</b><small>${escH(a.email || T('no_email'))}</small></span>${sel ? CHECK : ''}</button>`;
  const steps = (names, at) => `<div class="nx-steps">${names.map((n, i) => `<span class="${i < at ? 'done' : i === at ? 'on' : ''}"><i>${i < at ? CHECK : i + 1}</i>${n}</span>`).join('')}</div>`;
  const err = '<div class="nx-auth-err" role="alert"></div>';
  function authBody() {
    const list = accounts(), sel = list.find(a => a.id === authSel) || list[0];
    const msg = authMsg ? `<div class="nx-auth-ok">${CHECK}${escH(authMsg)}</div>` : '';
    const first = a => escH((a?.name || '').split(/\s+/)[0]);
    switch (authView) {
      case 'welcome': return `
        <h1>${T('welcome_t')}</h1><p class="nx-auth-sub">${T('welcome_s')}</p>
        <button class="btn nx-auth-primary" data-go="signup">${T('create')}</button>`;
      case 'signup': return `
        <button class="nx-auth-back" data-go="${list.length ? 'login' : _legacy.data ? 'upgrade' : 'welcome'}">${CHEV_R}${list.length ? T('back_login') : T('back')}</button>
        ${steps(T('steps_new'), 0)}
        <h1>${T('signup_t')}</h1><p class="nx-auth-sub">${T('signup_s')}</p>
        <form id="nx-signup" novalidate>
          <label class="nx-f"><span>${T('name')}</span><input name="name" autocomplete="name" placeholder="${T('name_ph')}"></label>
          <label class="nx-f"><span>${T('email')} <em>${T('optional')}</em></span><input name="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
          ${pwField('pw', T('password'), T('pw_ph'), 'new-password', true)}
          ${pwField('pw2', T('confirm'), T('again'), 'new-password', false)}
          ${err}<button class="btn nx-auth-primary" type="submit">${T('create')}</button>
        </form>
        ${list.length ? `<p class="nx-auth-alt">${T('have')} <a data-go="login">${T('login')}</a></p>` : ''}`;
      case 'login': return `
        <h1>${T('login_t')}</h1><p class="nx-auth-sub">${list.length > 1 ? T('login_many') : T('login_one')}</p>
        ${msg}<div class="nx-acct-list">${(list.length > 1 ? list : [sel]).map(a => acctRow(a, a.id === sel.id)).join('')}</div>
        <form id="nx-login" novalidate>
          ${pwField('pw', T('password'), T('your_pw'), 'current-password', false)}
          <div class="nx-auth-row"><span></span><a data-go="forgot">${T('forgot')}</a></div>
          ${err}<button class="btn nx-auth-primary" type="submit">${T('login')}</button>
        </form>
        <p class="nx-auth-alt">${T('new_here')} <a data-go="signup">${T('create_one')}</a></p>`;
      case 'locked': { const a = currentAccount(); return `
        ${avatarHtml(a, 'nx-avatar-xl nx-auth-me')}
        <h1 class="nx-center">${T('locked_t')}</h1><p class="nx-auth-sub nx-center">${T('locked_s', { name: first(a) })}</p>
        ${msg}<form id="nx-login" novalidate>
          ${pwField('pw', T('password'), T('your_pw'), 'current-password', false)}
          <div class="nx-auth-row"><span></span><a data-go="forgot">${T('forgot')}</a></div>
          ${err}<button class="btn nx-auth-primary" type="submit">${T('unlock')}</button>
        </form>
        <p class="nx-auth-alt">${T('not_you', { name: first(a) })} <a data-go="signout">${T('sign_out')}</a></p>`; }
      case 'forgot': return `
        <button class="nx-auth-back" data-go="${document.getElementById('nx-auth').dataset.locked ? 'locked' : 'login'}">${CHEV_R}${T('back')}</button>
        <h1>${T('forgot_t')}</h1><p class="nx-auth-sub">${T('forgot_s')}</p>
        <form id="nx-forgot" novalidate>
          <label class="nx-f"><span>${T('rk')}</span><input name="rk" class="nx-rk-input" autocomplete="off" spellcheck="false" placeholder="${T('rk_ph')}"></label>
          ${pwField('pw', T('new_pw'), T('pw_ph'), 'new-password', true)}
          ${pwField('pw2', T('confirm_new'), T('again'), 'new-password', false)}
          ${err}<button class="btn nx-auth-primary" type="submit">${T('set_new')}</button>
        </form>
        <p class="nx-auth-note">${T('lost_both')}</p>`;
      case 'recovery': return `
        ${_rkFlow === 'upgrade' ? steps(T('steps_upg'), 2) : steps(T('steps_new'), 1)}
        <h1>${T('rk_t')}</h1><p class="nx-auth-sub">${T('rk_s')}</p>
        <div class="nx-rk"><code>${_rk}</code>
          <div class="nx-rk-btns"><button type="button" class="btn-ghost" data-act="rk-copy">${icon('card', 15)}<span>${T('copy')}</span></button>
            <button type="button" class="btn-ghost" data-act="rk-dl">${icon('download', 15)}${T('download')}</button></div></div>
        <p class="nx-auth-note nx-auth-note-ic">${icon('shieldCheck', 15)}<span>${T('rk_where')}</span></p>
        <form id="nx-rk-confirm" novalidate>
          <label class="nx-f"><span>${T('rk_confirm')}</span><input name="last" class="nx-rk-input nx-rk-last" maxlength="4" autocomplete="off" spellcheck="false" placeholder="····"></label>
          ${err}<button class="btn nx-auth-primary" type="submit">${T('continue')}</button>
        </form>`;
      case 'upgrade': return `
        ${steps(T('steps_upg'), 0)}
        <h1>${T('upg_t')}</h1><p class="nx-auth-sub">${T(_legacy.password ? 'upg_s' : 'upg_s_nopw')}</p>
        <form id="nx-upgrade" novalidate>
          ${_legacy.password ? pwField('pw', T('cur_pw'), T('your_pw'), 'current-password', false)
            : pwField('pw', T('password'), T('pw_ph'), 'new-password', true) + pwField('pw2', T('confirm'), T('again'), 'new-password', false)}
          ${err}<button class="btn nx-auth-primary" type="submit">${T('continue')}</button>
        </form>
        <p class="nx-auth-alt"><a data-go="signup">${T('fresh_instead')}</a></p>`;
      case 'unreadable': return `
        <h1>${T('unreadable_t')}</h1><p class="nx-auth-sub">${T('unreadable_s')}</p>`;
      case 'upgrade-you': return `
        ${steps(T('steps_upg'), 1)}
        <h1>${T('you_t')}</h1><p class="nx-auth-sub">${T('you_s')}</p>
        <form id="nx-upgrade-you" novalidate>
          <label class="nx-f"><span>${T('name')}</span><input name="name" autocomplete="name" placeholder="${T('name_ph')}"></label>
          <label class="nx-f"><span>${T('email')} <em>${T('optional')}</em></span><input name="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
          ${err}<button class="btn nx-auth-primary" type="submit">${T('continue')}</button>
        </form>`;
    }
    return '';
  }

  function nxAuthShow(view) {
    let el = document.getElementById('nx-auth');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'nx-auth' });
      document.body.appendChild(el);
      el.addEventListener('click', onAuthClick);
      el.addEventListener('submit', onAuthSubmit);
      el.addEventListener('input', e => {
        const m = e.target.name && el.querySelector(`.nx-meter[data-for="${e.target.name}"]`);
        if (m) { const s = pwStrength(e.target.value); m.dataset.s = s; m.querySelector('b').textContent = T('strength')[s]; }
        if (e.target.classList.contains('nx-rk-input')) e.target.value = e.target.value.toUpperCase();
        const waiting = (authView === 'login' || authView === 'locked') && lockState(authView === 'locked' ? currentId : authSel).until > Date.now();
        const er = el.querySelector('.nx-auth-err'); if (er && !waiting) er.textContent = '';
      });
    }
    if (view === 'locked') el.dataset.locked = '1'; else if (view !== 'forgot') delete el.dataset.locked;
    clearInterval(_waitTimer);           // a countdown belongs to the screen that started it
    authView = view;
    if (!authSel || !accounts().some(a => a.id === authSel)) authSel = currentId || accounts()[0]?.id || null;
    // The brand side shows no money — a lock screen must never reveal your figures
    el.innerHTML = `<div class="nx-auth-brand"><div class="nx-auth-glow"></div>
        <div class="nx-auth-logo"><span class="nx-auth-mark"></span>NEXORA</div>
        <div class="nx-auth-hero"><div class="nx-auth-tag">${T('tag')}</div>
          <ul class="nx-auth-points"><li>${CHECK}${T('p1')}</li><li>${CHECK}${T('p2')}</li><li>${CHECK}${T('p3')}</li></ul></div>
        <div class="nx-auth-illu" aria-hidden="true">
          <div class="nx-illu-card nx-illu-a"><svg viewBox="0 0 44 44" class="nx-illu-donut"><circle cx="22" cy="22" r="16" stroke="rgba(255,255,255,.18)"/><circle cx="22" cy="22" r="16" stroke="#3DF5C0" stroke-dasharray="52 49" transform="rotate(-90 22 22)"/><circle cx="22" cy="22" r="16" stroke="#9DB8FF" stroke-dasharray="30 71" stroke-dashoffset="-56" transform="rotate(-90 22 22)"/></svg>
            <div class="nx-illu-lines"><i style="width:72%"></i><i style="width:48%"></i><i style="width:60%"></i></div></div>
          <div class="nx-illu-card nx-illu-b"><svg viewBox="0 0 120 54" class="nx-illu-bars">${[18, 26, 22, 34, 30, 44].map((hh, i) => `<rect x="${4 + i * 19}" y="${50 - hh}" width="12" height="${hh}" rx="4" fill="${i === 5 ? '#3DF5C0' : 'rgba(255,255,255,.28)'}"/>`).join('')}</svg></div>
          <div class="nx-illu-chip">${icon('pie', 13)}${T('chip')}</div>
        </div>
        <div class="nx-auth-foot">${icon('dashboard', 14)}${T('foot')}</div></div>
      <div class="nx-auth-main">
        <div class="nx-lang" role="group" aria-label="Language">${[['en', 'EN'], ['pt', 'PT'], ['zh', '中文']].map(([l, lab]) => `<button type="button" data-lang="${l}" class="${l === LANG ? 'on' : ''}">${lab}</button>`).join('')}</div>
        <div class="nx-auth-form">${authBody()}</div><div class="nx-auth-ver">Nexora ${escH(APP_VERSION)}</div></div>`;
    el.classList.add('open');
    document.getElementById('app-wrapper').style.display = 'none';
    if (MODERN) NX_SEASONS.onBrand(el.querySelector('.nx-auth-brand'), activeSeason());
    setTimeout(() => el.querySelector('.nx-auth-form input')?.focus(), 40);
    const waitFor = view === 'locked' ? currentId : view === 'login' ? authSel : null;
    if (waitFor && lockState(waitFor).until > Date.now()) showWait(waitFor);
  }
  const authErr = (txt, shake = true) => {
    const el = document.getElementById('nx-auth'), e = el.querySelector('.nx-auth-err');
    e.textContent = txt;
    if (shake) { const f = el.querySelector('.nx-auth-form'); f.classList.remove('nx-shake'); void f.offsetWidth; f.classList.add('nx-shake'); }
  };
  const busy = (on, label) => {
    const b = document.querySelector('#nx-auth .nx-auth-form button[type="submit"]');
    if (!b) return;
    if (on) { b.dataset.label = b.textContent; b.textContent = label; b.disabled = true; b.classList.add('nx-busy'); }
    else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; b.classList.remove('nx-busy'); }
  };
  function onAuthClick(e) {
    const t = e.target;
    const eye = t.closest('.nx-eye');
    if (eye) { const inp = eye.previousElementSibling, show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; eye.innerHTML = icon(show ? 'eyeOff' : 'eye'); eye.title = show ? 'Hide password' : 'Show password'; return; }
    const lang = t.closest('[data-lang]');
    if (lang) { setLanguage(lang.dataset.lang, { save: false }); return; }
    const pick = t.closest('[data-pick]');
    if (pick) { authSel = pick.dataset.pick; authMsg = ''; nxAuthShow('login'); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'rk-copy') { navigator.clipboard?.writeText(_rk).then(() => { const s = t.closest('button').querySelector('span'); if (s) s.textContent = T('copied'); }).catch(() => {}); return; }
    if (act === 'rk-dl') {
      const who = currentAccount()?.name || '';
      const txt = `Nexora recovery key${who ? ': ' + who : ''}\n\n${_rk}\n\nCreated ${new Date().toLocaleDateString('en-GB')}.\nIt opens your Nexora data if you forget your password. Keep it somewhere safe, away from this computer.\n`;
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([txt], { type: 'text/plain' })), download: `Nexora recovery key${who ? ' - ' + who : ''}.txt` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
    }
    const go = t.closest('[data-go]');
    if (!go) return;
    authMsg = '';
    if (go.dataset.go === 'signout') return nxSignOut();
    if (go.dataset.go === 'forgot' && authView === 'locked') authSel = currentId;
    nxAuthShow(go.dataset.go);
  }

  // A new encrypted profile: random data key, wrapped by the password and by a new recovery key
  // The encrypted file is written first and the list entry after, so the list never points at a missing file
  async function createProfile({ name, email, password, json, prefs = {} }) {
    if (_accountsUnreadable) throw new Error(T('unreadable_t'));
    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const rk = newRecoveryKey(), colors = Object.keys(AVATAR_BG);
    const a = { id: 'u' + Date.now().toString(36), name, email, color: colors[accounts().length % colors.length],
                createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(), rkCreatedAt: new Date().toISOString(), prefs: { lang: LANG, ...prefs } };
    _dek = dek;
    const keys = { password: await wrapDek(dek, password), recovery: await wrapDek(dek, normKey(rk)) };
    if (!await enqueue(() => writeFile(a.id, json, keys))) { _dek = null; throw new Error(T('err_write')); }
    saveAccounts([...accounts(), a]);
    _vaultJson = json;
    setCurrent(a.id);
    return { rk, id: a.id };
  }
  // The upgraded profile's preferences, read from what Marduk kept in the data
  function prefsFromLegacy(json) {
    let s = {}; try { s = JSON.parse(json) || {}; } catch (e) {}
    const p = {}, pd = s.paycheckDay;
    if (pd === 'auto') Object.assign(p, { payday: 'auto', bizDay: 2 });          // Marduk's rule was the 2nd-to-last business day
    else if (typeof pd === 'number') Object.assign(p, { payday: 'fixed', day: pd });
    else if (pd === null) p.payday = 'calendar';
    const paid = (s.salaries || []).length || (s.payslips || []).length, extra = (s.extraIncomes || []).length;
    p.income = paid ? (extra ? 'both' : 'salary') : extra ? 'freelance' : 'salary';
    return p;
  }
  // Marduk's password: a SHA-256 hex hash, or from the oldest versions a base64 copy
  const sha256hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  async function legacyPasswordOk(stored, pw) {
    stored = String(stored || '').trim();
    if (/^[0-9a-f]{64}$/.test(stored)) return (await sha256hex(pw)) === stored;
    try { return pw === atob(stored); } catch (e) { return false; }
  }
  async function onAuthSubmit(e) {
    e.preventDefault();
    const f = e.target, v = n => (f.elements[n]?.value || '').trim(), pw = f.elements.pw?.value || '';
    if (f.id === 'nx-signup' || f.id === 'nx-upgrade-you') {
      if (!v('name')) return authErr(T('err_name'));
      if (v('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) return authErr(T('err_email'));
      if (f.id === 'nx-signup') { if (pw.length < 8) return authErr(T('err_pw8')); if (pw !== f.elements.pw2.value) return authErr(T('err_match')); }
      busy(true, T('creating'));
      const upgrading = f.id === 'nx-upgrade-you';
      try {
        const made = await createProfile({ name: v('name'), email: v('email'), password: upgrading ? _upgPw : pw, json: upgrading ? _upgJson : FRESH_STATE,
                                           prefs: upgrading ? { setupDone: true, ...prefsFromLegacy(_upgJson) } : {} });
        _rk = made.rk;
        if (upgrading) {
          // Read it back and open it like a log-in would; only an exact match retires Marduk's files
          const back = await openFile(made.id, _upgPw).catch(() => null);
          if (!back || back.json !== _upgJson) {
            await api?.profileRemove(made.id);
            saveAccounts(accounts().filter(x => x.id !== made.id)); setCurrent(null); _dek = null; _vaultJson = null;
            busy(false); return authErr(T('upg_check_fail'));
          }
          await api?.legacyRetire();
          _legacy = { data: false, password: false };
        }
      } catch (x) { busy(false); return authErr(String(x.message || x)); }
      _rkFlow = upgrading ? 'upgrade' : 'signup'; _upgPw = null; _upgJson = null;
      return nxAuthShow('recovery');
    }
    if (f.id === 'nx-upgrade') {
      const L = await api?.legacyRead();
      if (!L?.json) return authErr(T('upg_gone'));
      try { JSON.parse(L.json); } catch (x) { return authErr(T('upg_unreadable')); }
      if (L.password) {
        if (lockState('marduk').until > Date.now()) return showWait('marduk');
        if (!pw) return authErr(T('err_pw'));
        if (!await legacyPasswordOk(L.password, pw)) {
          const s = registerFail('marduk');
          if (s.until > Date.now()) return showWait('marduk');
          return authErr(`${T('err_wrong')} ${s.round ? '' : T('err_left', { n: 5 - s.fails })}`.trim());
        }
        localStorage.removeItem(lockKey('marduk'));
      } else {
        if (pw.length < 8) return authErr(T('err_pw8'));
        if (pw !== f.elements.pw2.value) return authErr(T('err_match'));
      }
      _upgPw = pw; _upgJson = L.json;
      return nxAuthShow('upgrade-you');
    }
    if (f.id === 'nx-rk-confirm') {
      if (normKey(v('last')) !== normKey(_rk).slice(-4)) return authErr(T('err_last'));
      const flow = _rkFlow; _rk = null; _rkFlow = null;
      enterApp(false);
      if (flow === 'signup') setTimeout(() => window.nxOpenSetup({ fromSignup: true }), 450);
      if (flow === 'upgrade') setTimeout(() => showToast(T('done_toast')), 600);
      return;
    }
    if (f.id === 'nx-login') {
      const locked = authView === 'locked', a = locked ? currentAccount() : accounts().find(x => x.id === authSel);
      if (!a) return authErr(T('err_pick'));
      if (lockState(a.id).until > Date.now()) return showWait(a.id);
      if (!pw) return authErr(T('err_pw'));
      busy(true, T('unlocking'));
      let opened = null;
      try { opened = await openFile(a.id, pw); } catch (x) {}
      if (!opened) {
        busy(false);
        const s = registerFail(a.id);
        if (s.until > Date.now()) return showWait(a.id);
        return authErr(`${T('err_wrong')} ${s.round ? '' : T('err_left', { n: 5 - s.fails })}`.trim());
      }
      localStorage.removeItem(lockKey(a.id));
      _dek = opened.dek; _vaultJson = opened.json;
      const resume = locked && appStarted && a.id === currentId;
      updateAccount(a.id, { lastLogin: new Date().toISOString() });
      setCurrent(a.id);
      return enterApp(resume);
    }
    if (f.id === 'nx-forgot') {
      const id = document.getElementById('nx-auth').dataset.locked ? currentId : authSel;
      if (pw.length < 8) return authErr(T('err_pw8'));
      if (pw !== f.elements.pw2.value) return authErr(T('err_match'));
      busy(true, T('unlocking'));
      let opened = null;
      try { opened = await openFile(id, normKey(v('rk')), 'recovery'); } catch (x) {}
      if (!opened) { busy(false); return authErr(T('err_key')); }
      _dek = opened.dek; _vaultJson = opened.json;
      if (!await rekey(id, 'password', pw)) { busy(false); return authErr(T('err_write')); }
      localStorage.removeItem(lockKey(id));
      const resume = appStarted && id === currentId;
      setCurrent(id); updateAccount(id, { lastLogin: new Date().toISOString() });
      enterApp(resume);
      setTimeout(() => showToast(T('pw_changed')), 500);
    }
  }
  // Into the dashboard: a fresh start loads the profile's decrypted data; after a lock it just resumes
  function enterApp(resume) {
    const lang = loadProfile()?.lang || LANG;
    setLanguage(lang, { save: false, quiet: true });   // also sweeps the page's static text, which is parsed before the observer exists
    document.getElementById('nx-auth').classList.remove('open');
    document.getElementById('app-wrapper').style.display = 'block';
    if (resume) { startAutoLock(); return; }
    appStarted = true;
    unlockApp().then(() => {
      applyPrefs(loadProfile()); applyProfile(); renderAll(); showTab('overview', document.querySelector('nav button[onclick^="showTab(\'overview\'"]'));
      applySeason(); if (MODERN) NX_SEASONS.greet(activeSeason());
    });
  }
  window.nxSignOut = () => {
    stopAutoLock();
    document.getElementById('nx-me')?.classList.remove('open');
    _dek = null; _vaultJson = null;
    setCurrent(null); authMsg = '';
    nxAuthShow(accounts().length ? 'login' : 'welcome');
  };

  // ══════════════ FIRE ══════════════
  // The same numbers as the app's renderFire() — 12-month average spending, the 25× rule,
  // net worth, income − spending — told as an answer ("independent in May 2045") with the
  // path drawn year by year. The app showed "18.5" for 18 years and 5 months; this says it.
  let fireRet = 7, fireSav = null, _nxFireChart = null;
  function fireNumbers() {
    const today = new Date();
    let exp = 0, expN = 0, inc = 0, incN = 0;
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1), key = getExpenseMonthKey(d.getFullYear(), d.getMonth());
      const mo = state.expenses.filter(e => expenseBelongsToMonth(e, key)).reduce((s, e) => s + Number(e.amount), 0);
      if (mo > 0) { exp += mo; expN++; }
      const sal = (state.salaries || []).find(s => s.month === key);
      if (sal) { inc += Number(sal.amount) + (state.extraIncomes || []).filter(x => x.month === key).reduce((s, x) => s + Number(x.amount), 0); incN++; }
    }
    const avgExp = expN ? exp / expN : 0, avgInc = incN ? inc / incN : 0;
    return { annualExp: avgExp * 12, target: avgExp * 12 * 25, nw: Math.max(nwTotals().net, 0), annualSav: Math.max((avgInc - avgExp) * 12, 0), avgInc };
  }
  // Years until net worth, growing at r and topped up by S a year, reaches the target
  function fireYears(nw, target, S, r) {
    if (target <= 0) return null;
    if (nw >= target) return 0;
    const num = nw + S / r, den = target + S / r;
    return num > 0 ? Math.log(den / num) / Math.log(1 + r) : Infinity;
  }
  const projected = (nw, S, r, k) => nw * Math.pow(1 + r, k) + S * (Math.pow(1 + r, k) - 1) / r;
  const rgbaOf = (hex, a) => { const v = parseInt(hex.replace('#', ''), 16); return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`; };
  function nxFire() {
    const sec = document.getElementById('fire-section');
    if (!sec || !sec.offsetParent) return;
    const F = fireNumbers();
    if (fireSav == null && F.avgInc > 0) fireSav = Math.max(Math.round(F.annualSav / 12 / 50) * 50, 0);
    let ui = sec.querySelector('.nx-fire');
    if (!ui) {
      sec.classList.add('nx-fire-card');
      ui = Object.assign(document.createElement('div'), { className: 'nx-fire' });
      ui.innerHTML = `
        <div class="nx-fire-head"><span class="nx-ic coral"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${I.flame}</svg></span>
          <div><div class="card-title">FIRE</div><div class="nx-fire-sub">Financial independence · retire early</div></div>
          <span class="nx-fire-basis">Based on the last 12 months<span class="info-tip">i<span class="tip-body">The 4% rule: investments worth 25 times your yearly spending have historically been able to pay for that spending for 30 years or more. Returns here are real, after inflation.</span></span></span></div>
        <div class="nx-fire-top"><div class="nx-fire-answer"></div>
          <div class="nx-fire-chart"><div class="nx-fire-chart-head"><span>Your path</span><span class="nx-fire-legend"><i class="a"></i><span>Projected net worth</span><i class="b"></i><span>FIRE number</span></span></div>
            <div class="nx-fire-canvas"><canvas id="nx-fire-chart"></canvas></div></div></div>
        <div class="nx-fire-bottom"><div class="nx-fire-figs"></div>
          <div class="nx-fire-whatif"><div class="nx-fire-wi-title">What if</div>
            <label class="nx-fire-sl"><span>Real return a year</span><b id="nx-fire-ret-v"></b><input type="range" id="nx-fire-ret" min="1" max="15" step="0.5"><small>after inflation</small></label>
            <label class="nx-fire-sl"><span>Saved each month</span><b id="nx-fire-sav-v"></b><input type="range" id="nx-fire-sav" min="0" step="50"><small id="nx-fire-sav-hint"></small></label></div></div>`;
      sec.appendChild(ui);
      ui.addEventListener('input', e => {
        if (e.target.id === 'nx-fire-ret') fireRet = +e.target.value;
        else if (e.target.id === 'nx-fire-sav') fireSav = +e.target.value;
        else return;
        fireUpdate();
      });
    }
    const ret = ui.querySelector('#nx-fire-ret'), sav = ui.querySelector('#nx-fire-sav');
    ret.value = fireRet;
    sav.max = Math.max((fireSav || 0) * 4, 5000); sav.value = fireSav || 0;
    if (_nxFireChart) { _nxFireChart.destroy(); _nxFireChart = null; }   // rebuilt with the theme's colours
    fireUpdate();
  }
  function fireUpdate() {
    const ui = document.querySelector('#fire-section .nx-fire'); if (!ui) return;
    const F = fireNumbers(), r = fireRet / 100, S = (fireSav || 0) * 12, today = new Date();
    const n = fireYears(F.nw, F.target, S, r), pct = F.target > 0 ? Math.min(100, F.nw / F.target * 100) : 0;
    const unit = (v, one, many) => `<b>${v}</b> <span>${v === 1 ? one : many}</span>`;
    let answer;
    if (n == null) answer = `<div class="nx-fire-k">Your path to financial independence</div><div class="nx-fire-big nx-fire-none">–</div><p>Log a few months of expenses to see your path.</p>`;
    else if (n === 0) answer = `<div class="nx-fire-k">You’ve reached financial independence</div><div class="nx-fire-big">100%</div><p>Your investments could cover your spending from here on.</p>`;
    else if (!isFinite(n) || n > 80) answer = `<div class="nx-fire-k">At this rate</div><div class="nx-fire-big nx-fire-none">Not yet in sight</div><p>Save more each month or expect a higher return.</p>`;
    else {
      const months = Math.round(n * 12), when = new Date(today.getFullYear(), today.getMonth() + months, 1);
      const y = Math.floor(months / 12), m = months % 12;
      answer = `<div class="nx-fire-k">You could be financially independent in</div><div class="nx-fire-big">${when.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
        <div class="nx-fire-in">${y ? unit(y, 'year', 'years') : ''}${y && m ? ' ' : ''}${m ? unit(m, 'month', 'months') : ''} <span>from now</span></div>`;
    }
    ui.querySelector('.nx-fire-answer').innerHTML = answer + (F.target > 0 ? `
      <div class="nx-fire-prog"><div class="nx-fire-prog-row"><span><b>${pct.toFixed(1)}%</b> <span>of the way there</span></span><span><b>${eur(F.nw, 0)}</b> <span>of</span> <b>${eur(F.target, 0)}</b></span></div>
        <div class="nx-limit-track"><div class="nx-limit-fill nx-fire-fill" style="width:${pct.toFixed(1)}%"></div></div></div>` : '');
    const fig = (label, v, sub) => `<div class="nx-fire-fig"><span>${label}</span><b>${v}</b><small>${sub}</small></div>`;
    ui.querySelector('.nx-fire-figs').innerHTML =
      fig('FIRE number', F.target > 0 ? eur(F.target, 0) : '–', '25× yearly spending') + fig('Net worth now', eur(F.nw, 0), 'assets − debts') +
      fig('Yearly spending', F.annualExp > 0 ? eur(F.annualExp, 0) : '–', '12-month average') + fig('Yearly savings', F.avgInc > 0 ? eur(F.annualSav, 0) : '–', 'income − spending');
    const ret = ui.querySelector('#nx-fire-ret'), sav = ui.querySelector('#nx-fire-sav');
    ui.querySelector('#nx-fire-ret-v').textContent = fireRet.toFixed(1) + '%';
    ui.querySelector('#nx-fire-sav-v').textContent = eur(fireSav || 0, 0);
    ui.querySelector('#nx-fire-sav-hint').innerHTML = F.avgInc > 0 ? `<span>You save about</span> <b>${eur(F.annualSav / 12, 0)}</b> <span>a month now</span>` : '';
    [ret, sav].forEach(el => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100).toFixed(1) + '%'));
    // the path: projected net worth each year against the FIRE number
    const cv = ui.querySelector('#nx-fire-chart');
    if (F.target <= 0 || !cv.offsetParent) { if (_nxFireChart) { _nxFireChart.destroy(); _nxFireChart = null; } return; }
    const span = isFinite(n) && n != null ? Math.min(50, Math.max(10, Math.ceil(n) + 3)) : 30;
    const ks = Array.from({ length: span + 1 }, (_, k) => k), hit = isFinite(n) && n != null ? Math.ceil(n) : -1;
    const labels = ks.map(k => String(today.getFullYear() + k)), path = ks.map(k => Math.round(projected(F.nw, S, r, k)));
    if (_nxFireChart) {
      _nxFireChart.data.labels = labels;
      _nxFireChart.data.datasets[0].data = path; _nxFireChart.data.datasets[0].pointRadius = ks.map(k => k === hit ? 5 : 0);
      _nxFireChart.data.datasets[1].data = ks.map(() => F.target);
      _nxFireChart.update('none');
      return;
    }
    const accent = cssv('--gold'), mint = cssv('--mint') || '#3DF5C0';
    const money = v => v >= 1e6 ? '€' + (v / 1e6).toFixed(1).replace('.', ',') + 'M' : '€' + Math.round(v / 1000) + 'k';
    _nxFireChart = new Chart(cv, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Projected net worth', data: path, borderColor: accent, borderWidth: 2.5, tension: .3, fill: true, pointRadius: ks.map(k => k === hit ? 5 : 0), pointBackgroundColor: accent,
          backgroundColor: c => { const a = c.chart.chartArea; if (!a) return 'transparent'; const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, rgbaOf(accent, .28)); g.addColorStop(1, rgbaOf(accent, 0)); return g; } },
        { label: 'FIRE number', data: ks.map(() => F.target), borderColor: mint, borderWidth: 1.6, borderDash: [6, 5], pointRadius: 0, fill: false },
      ] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}  ${eur(c.raw, 0)}` } } },
        scales: { x: { grid: { display: false }, ticks: { color: cssv('--text3'), maxTicksLimit: 8, maxRotation: 0 } },
                  y: { beginAtZero: true, grid: { color: cssv('--border') }, ticks: { color: cssv('--text3'), callback: money, maxTicksLimit: 5 } } } },
    });
  }

  // ══════════════ SEASONS & YEAR WRAP ══════════════
  // The theme follows the profile's country (holidays.js) and draws through seasons.js.
  function activeSeason() {
    const p = loadProfile();
    if (p?.seasonal === false) return null;
    return NX_HOL.seasonFor(new Date(), countryOf(p));
  }
  const wrapOpen = () => NX_HOL.wrapSeason(new Date());
  function applySeason() {
    if (!MODERN) return;
    NX_SEASONS.apply(activeSeason());
    const item = document.getElementById('nx-wrap-item');
    if (item) item.style.display = wrapOpen() ? '' : 'none';
    renderSeasonNotes();
  }
  const seaDismissed = k => !!lsGet('nexora_sea_dismiss', {})[k];
  window.nxSeaDismiss = k => { lsSet('nexora_sea_dismiss', { ...lsGet('nexora_sea_dismiss', {}), [k]: 1 }); renderSeasonNotes(); };
  // Under the greeting: the Year Wrap in December and January, the month's scariest expense at Halloween
  function renderSeasonNotes() {
    const greet = document.getElementById('nx-greet');
    if (!greet || typeof state === 'undefined' || !state.expenses) return;
    let box = document.getElementById('nx-sea-notes');
    if (!box) { box = Object.assign(document.createElement('div'), { id: 'nx-sea-notes' }); greet.after(box); }
    const season = activeSeason(), yr = NX_HOL.wrapYear(), today = new Date(), notes = [];
    const x = k => `<button type="button" class="nx-note-x" onclick="nxSeaDismiss('${k}')" title="Dismiss">${icon('close', 14)}</button>`;
    if (wrapOpen() && !seaDismissed('wrap' + yr))
      notes.push(`<div class="nx-sea-note nx-note-wrap"><span class="nx-ic blue">${icon('star8', 15)}</span><div class="nx-note-text"><b>Your ${yr} in Nexora</b><span>A look back at your year in money.</span></div>
        <button type="button" class="btn" onclick="nxOpenWrap()">Open</button>${x('wrap' + yr)}</div>`);
    if (season === 'halloween') {
      const key = getExpenseMonthKey(today.getFullYear(), today.getMonth());
      const top = state.expenses.filter(e => expenseBelongsToMonth(e, key) && !e.recurring && !['Housing', 'Utilities'].includes(e.cat)).sort((a, b) => +b.amount - +a.amount)[0];
      if (top && !seaDismissed('boo' + key))
        notes.push(`<div class="nx-sea-note nx-note-boo"><span class="nx-ic amber">${icon('pumpkin', 15)}</span><div class="nx-note-text"><b>The month’s scariest expense</b><span><span data-no-tr>${escH(top.desc)}</span> · ${eur(+top.amount)}</span></div>
          <span class="nx-note-tag">Boo.</span>${x('boo' + key)}</div>`);
    }
    box.innerHTML = notes.join('');
  }

  // Everything the Year Wrap shows, from the data already in Nexora. Budget months, so
  // the totals match the Expenses and Budget tabs.
  function wrapData(year) {
    const today = new Date(), current = year === today.getFullYear();
    const last = current ? today.getMonth() : 11;
    const keys = Array.from({ length: last + 1 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const perMonth = keys.map(k => state.expenses.filter(e => expenseBelongsToMonth(e, k)));
    const totals = perMonth.map(l => l.reduce((s, e) => s + (+e.amount || 0), 0));
    const all = perMonth.flat(), spent = totals.reduce((a, b) => a + b, 0);
    const inYear = (s, k = 'month') => String(s?.[k] || '').startsWith(year + '-') && String(s[k]).slice(0, 7) <= keys.at(-1);
    const salary = (state.salaries || []).filter(s => inYear(s)).reduce((a, s) => a + (+s.amount || 0), 0);
    const extra = (state.extraIncomes || []).filter(s => inYear(s)).reduce((a, s) => a + (+s.amount || 0), 0);
    const used = totals.map((v, i) => v > 0 || (state.salaries || []).some(s => s.month === keys[i]) ? i : -1).filter(i => i >= 0);
    const active = totals.map((v, i) => [v, i]).filter(([v]) => v > 0);
    const top = active.length ? active.reduce((a, b) => b[0] > a[0] ? b : a) : null;
    const byCat = {};
    all.forEach(e => { const c = e.cat || 'Other'; byCat[c] = (byCat[c] || 0) + (+e.amount || 0); });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cat, amount]) => ({ cat, amount, share: spent ? amount / spent * 100 : 0 }));
    // the place you went most: rent and bills aren't places
    const places = {};
    all.filter(e => !e.recurring && !['Housing', 'Utilities'].includes(e.cat)).forEach(e => {
      const name = String(e.desc || '').trim(); if (!name) return;
      const p = places[name.toLowerCase()] || (places[name.toLowerCase()] = { name, visits: 0, total: 0 });
      p.visits++; p.total += +e.amount || 0;
    });
    const place = Object.values(places).sort((a, b) => b.visits - a.visits || b.total - a.total)[0] || null;
    const holdings = (state.portfolios || []).flatMap(p => p.holdings || []);
    const invested = (state.portfolios || []).flatMap(p => p.transactions || []).filter(x => /buy/i.test(x.type) && inYear(x, 'date')).reduce((a, x) => a + x.shares * x.price, 0);
    const dividends = (state.dividendLog || []).filter(x => inYear(x, 'date')).reduce((a, x) => a + (+x.amountEur || 0), 0);
    const best = holdings.filter(h => h.buyPrice > 0).map(h => ({ ticker: h.ticker, pct: ((h.currentPrice || h.buyPrice) / h.buyPrice - 1) * 100 })).sort((a, b) => b.pct - a.pct)[0] || null;
    // net worth: from the last snapshot before the year (or its first) to now
    const hist = state.nwHistory || [], T = nwTotals();
    const before = hist.filter(x => x.month < year + '-01').at(-1), during = hist.filter(x => inYear(x));
    const start = before?.value ?? during[0]?.value;
    const nowNw = current ? T.net : (during.at(-1)?.value ?? T.net);
    const points = [...(before ? [before.value] : []), ...during.map(x => x.value), ...(current ? [T.net] : [])];
    return {
      year, partial: current, from: used.length ? used[0] : 0, to: last,
      income: { total: salary + extra, salary, extra },
      spent: { total: spent, avg: active.length ? spent / active.length : 0, top: top ? { m: top[1], amount: top[0] } : null },
      cats, place: place && place.visits > 1 ? place : null,
      kept: { amount: salary + extra - spent, rate: salary + extra ? (salary + extra - spent) / (salary + extra) * 100 : 0 },
      invest: holdings.length ? { value: totalPortfolioStats().val, invested, dividends, best } : null,
      nw: start != null ? { now: nowNw, change: nowNw - start, points } : null,
      goals: (state.goals || []).map(g => ({ name: g.name, pct: g.target ? (+g.current || 0) / g.target * 100 : 0 })),
    };
  }
  window.nxOpenWrap = () => NX_SEASONS.openWrap(wrapData(NX_HOL.wrapYear()));

  // ══════════════ LANGUAGE ══════════════
  // English (US), Português (PT-PT, "tu") and 中文 (Simplified). The start screens
  // use STR; everything else is translated by matching the app's English text
  // against i18n.js as it renders, and put back from the original when you switch
  // back. To port: move the app's strings into translation keys.
  let UI_LANG = LANG;
  const LANG_TAG = { en: 'en-US', pt: 'pt-PT', zh: 'zh-CN' };
  document.documentElement.lang = LANG_TAG[LANG] || 'en-US';
  const TR_SKIP = 'script,style,code,pre,textarea,#nx-auth,.nx-rk,[data-no-tr]';
  const ORIG = new WeakMap();
  const trKey = s => window.NX_I18N?.tr(s, UI_LANG) ?? null;
  function trNode(n) {
    const cur = n.nodeValue;
    let orig = ORIG.get(n);
    if (orig === undefined || cur !== n.__nxSet) { orig = cur; ORIG.set(n, orig); }   // the app wrote new text
    const src = orig, key = src.replace(/\s+/g, ' ').trim();
    const tr = key && /[A-Za-z]/.test(key) ? trKey(key) : null;
    const want = nxNeg(tr == null ? src : src.match(/^\s*/)[0] + tr + src.match(/\s*$/)[0]);
    n.__nxSet = want;
    if (cur !== want) n.nodeValue = want;
  }
  function trAttrs(el) {
    for (const a of ['placeholder', 'title', 'aria-label']) {
      if (!el.hasAttribute(a)) continue;
      const st = el.__nxAttr || (el.__nxAttr = {}), cur = el.getAttribute(a);
      if (st[a] === undefined || cur !== st[a + '!']) st[a] = cur;
      const want = trKey(st[a].trim()) ?? st[a];
      st[a + '!'] = want;
      if (cur !== want) el.setAttribute(a, want);
    }
  }
  function trTree(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (root.parentElement && !root.parentElement.closest(TR_SKIP)) trNode(root); return; }
    if (root.nodeType !== 1 || root.closest(TR_SKIP)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement.closest(TR_SKIP)) trNode(n);
    [root, ...root.querySelectorAll('[placeholder],[title],[aria-label]')].forEach(el => { if (!el.closest(TR_SKIP)) trAttrs(el); });
  }
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') { if (m.target.nodeValue !== m.target.__nxSet) trTree(m.target); }
      else m.addedNodes.forEach(trTree);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  function setLanguage(lang, { save = true, quiet = false } = {}) {
    UI_LANG = lang; LANG = lang; lsSet('nexora_lang', lang);
    document.documentElement.lang = LANG_TAG[lang] || 'en-US';
    if (save && currentAccount()) saveProfile({ ...(loadProfile() || {}), lang });
    if (document.body) trTree(document.body);
    if (quiet) return;
    if (appStarted) { applyProfile(); try { renderAll(); } catch (e) { console.error(e); } }
    if (document.getElementById('nx-me')?.classList.contains('open')) renderMe();
    if (document.getElementById('nx-auth')?.classList.contains('open')) nxAuthShow(authView);
  }

  // ══════════════ MY PROFILE ══════════════
  let meSec = 'profile', meRk = null, mePeek = false, mePeekText = '', meAvTab = 'initials';
  const ME_SECTIONS = [['profile', 'user', 'Profile'], ['security', 'shieldCheck', 'Security'], ['prefs', 'sliders', 'Preferences'], ['ai', 'sparkles', 'AI features'], ['data', 'database', 'Data & privacy']];
  let meAi = { loaded: false, masked: null };   // the AI key as main.js reports it (masked), once asked
  const fmtLong = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
  const seg = (name, cur, opts) => `<div class="nx-seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  function meBody() {
    const a = currentAccount(), p = loadProfile() || {};
    if (meSec === 'profile') return `
      <div class="nx-me-avatar-row">${avatarHtml(a, 'nx-avatar-xl')}
        <div class="nx-av-edit">${seg('avtab', meAvTab, [['initials', 'Initials'], ['emblem', 'Symbol'], ['photo', 'Photo']])}
          ${meAvTab !== 'photo' ? `<div class="nx-me-label">Background</div><div class="nx-swatches">${Object.entries(AVATAR_BG).map(([k, bg]) => `<button type="button" data-color="${k}" class="${(a.color || 'blue') === k ? 'on' : ''}" style="background:${bg}" title="${k}"></button>`).join('')}</div>` : ''}
          ${meAvTab === 'emblem' ? `<div class="nx-me-label">Symbol</div><div class="nx-emblems">${Object.entries(EMBLEMS).map(([k, d]) => `<button type="button" data-emblem="${k}" title="${k}" class="${a.avatar?.kind === 'emblem' && a.avatar.emblem === k ? 'on' : ''}" style="background:${avatarBg(a)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></button>`).join('')}</div>` : ''}
          ${meAvTab === 'photo' ? `<div class="nx-av-photo"><div><button type="button" class="btn-ghost" data-act="photo-pick">${icon('upload', 15)}${a.avatar?.photo ? 'Choose another photo' : 'Choose a photo'}</button>
              ${a.avatar?.photo ? '<button type="button" class="nx-me-link" data-act="photo-remove">Remove photo</button>' : ''}</div>
              <small>Cropped to a square. Like your name, it shows on the log-in screen.</small><input type="file" accept="image/*" id="nx-av-file" hidden></div>` : ''}
        </div></div>
      <form id="nx-me-profile" novalidate>
        <label class="nx-f"><span>Name</span><input name="name" value="${escH(a.name)}" autocomplete="name"></label>
        <label class="nx-f"><span>Email</span><input name="email" type="email" value="${escH(a.email || '')}" placeholder="you@example.com" autocomplete="email"><small>Stays on this computer.</small></label>
        <div class="nx-auth-err"></div>
        <div class="nx-me-foot"><span class="nx-me-meta">Member since ${fmtLong(a.createdAt)}</span><button class="btn" type="submit">Save changes</button></div>
      </form>`;
    if (meSec === 'ai') {
      if (!meAi.loaded) { api?.getAiKeyStatus?.().then(m => { meAi = { loaded: true, masked: m || null }; if (meSec === 'ai') renderMe(); }).catch(() => {}); }
      const on = !!meAi.masked;
      return `
      <div class="nx-me-group nx-me-inline"><div><h3>${on ? 'On' : 'Off'}</h3><p>${on ? `<span>Using the key</span> <b>${escH(meAi.masked)}</b>` : 'Add an Anthropic API key to turn these on. Everything else in Nexora works without one.'}</p></div>
        ${on ? `<button type="button" class="nx-goal-link" data-act="ai-remove">Remove key</button>` : ''}</div>
      <div class="nx-me-group"><h3>What it does</h3>
        <ul class="nx-me-facts"><li>${icon('note', 15)}<span><b>Reads payslips</b>: any language and any layout. Without a key, Nexora uses its own pattern reader.</span></li>
          <li>${icon('receipt', 15)}<span><b>Suggests a category</b> for an expense it hasn’t seen before.</span></li>
          <li>${icon('sparkles', 15)}<span><b>Sums up your month</b> in a few lines on the Overview.</span></li></ul></div>
      <div class="nx-me-group"><h3>What it sees</h3><p>The payslip you import, an expense’s description when it suggests a category, and the month’s totals for the summary. Never your list of transactions, your holdings or your password.</p></div>
      <div class="nx-me-group"><h3>${on ? 'Replace the key' : 'Your key'}</h3><p>Stored only on this computer, never in Google Drive. Get one at console.anthropic.com; it costs a few cents per payslip, and less for the rest.</p>
        <form id="nx-me-ai" novalidate class="nx-me-rk-form"><label class="nx-f"><span>API key</span><input name="key" type="password" autocomplete="off" placeholder="sk-ant-…"></label><button class="btn" type="submit">Save key</button><div class="nx-auth-err"></div></form></div>`;
    }
    if (meSec === 'security') { const al = typeof getAutolockMode === 'function' ? String(getAutolockMode()) : '10'; return `
      <div class="nx-me-group"><h3>Password</h3><p>The password you use to open Nexora.</p>
        <form id="nx-me-pw" novalidate>
          ${pwField('cur', 'Current password', '', 'current-password', false)}
          <div class="nx-me-2col">${pwField('pw', 'New password', 'At least 8 characters', 'new-password', true)}${pwField('pw2', 'Confirm new password', '', 'new-password', false)}</div>
          <div class="nx-auth-err"></div><div class="nx-me-foot"><span></span><button class="btn" type="submit">Update password</button></div>
        </form></div>
      <div class="nx-me-group"><h3>Recovery key</h3><p>Opens your data if you forget your password. Made ${a.rkCreatedAt ? fmtLong(a.rkCreatedAt) : '–'}. Lost it? Make a new one, and the old one stops working.</p>
        ${meRk ? `<div class="nx-rk nx-rk-me"><code>${meRk}</code><div class="nx-rk-btns"><button type="button" class="btn-ghost" data-act="me-rk-copy">${icon('card', 15)}<span>Copy</span></button><button type="button" class="btn-ghost" data-act="me-rk-dl">${icon('download', 15)}Download</button></div></div>
          <p class="nx-me-warn">${icon('shieldCheck', 14)}Save it now. It won’t be shown again.</p>`
        : `<form id="nx-me-rk" novalidate class="nx-me-rk-form">${pwField('cur', 'Your password', '', 'current-password', false)}<button class="btn-ghost" type="submit">Make a new recovery key</button><div class="nx-auth-err"></div></form>`}</div>
      <div class="nx-me-group"><h3>Auto-lock</h3><p>Lock Nexora after this long without activity.</p>
        ${seg('autolock', al, [['5', '5 min'], ['10', '10 min'], ['30', '30 min'], ['off', 'Never']])}</div>
      <div class="nx-me-group nx-me-inline"><div><h3>Session</h3><p>Last log in: ${a.lastLogin ? new Date(a.lastLogin).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–'}</p></div>
        <button type="button" class="btn-ghost nx-me-signout" data-act="signout">${icon('logout', 15)}Sign out</button></div>`; }
    if (meSec === 'prefs') return `
      <div class="nx-me-row"><div><h4>Language</h4><p>The whole app, including the log-in screens.</p></div>
        <div data-no-tr>${seg('lang', UI_LANG, [['en', 'English (US)'], ['pt', 'Português (PT)'], ['zh', '中文（简体）']])}</div></div>
      <div class="nx-me-row"><div><h4>Country</h4><p>For public holidays and seasonal themes.</p></div>
        <label class="nx-me-country">${flagIc(countryOf(p), 14)}<select data-pref="country">${NX_HOL.COUNTRIES.map(([c, n]) => `<option value="${c}"${c === countryOf(p) ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="nx-me-row"><div><h4>How you're paid</h4><p>Shows the Salary tab and payslip import when you have a salary.</p></div>${seg('income', p.income || 'salary', [['salary', 'Salary'], ['freelance', 'Freelance'], ['both', 'Both']])}</div>
      <div class="nx-me-row${p.income === 'freelance' ? ' nx-off-row' : ''}"><div><h4>Budget month starts</h4><p>The day your salary arrives.</p></div>
        <div class="nx-me-ctl">${seg('payday', p.payday || 'auto', [['auto', 'Business day'], ['fixed', 'Fixed day'], ['calendar', 'Day 1']])}
        ${(p.payday || 'auto') === 'auto' ? `<label class="nx-me-day"><span>Business day no.</span><input type="number" min="1" max="10" value="${bizN(p)}" data-pref="bizDay"><span>from the end</span></label>`
          : p.payday === 'fixed' ? `<label class="nx-me-day">Day <input type="number" min="1" max="31" value="${p.day || 25}" data-pref="day"></label>` : ''}
        ${p.payday === 'calendar' ? '' : payHint(p)}</div></div>
      <div class="nx-me-row"><div><h4>Investing</h4><p>Portfolio, Dividends and Risk.</p></div><button type="button" class="nx-switch${p.invests === false ? '' : ' on'}" data-toggle="invests" role="switch" aria-checked="${p.invests !== false}"><i></i></button></div>
      <div class="nx-me-row"><div><h4>Main currency</h4><p>How your figures are shown.</p></div>
        <div class="nx-me-ccy">${CCY.map(([c, , n]) => `<button type="button" data-ccy-pick="${c}" class="${(p.currency || 'EUR') === c ? 'on' : ''}" title="${n}">${flagIc(c, 14)}${c}</button>`).join('')}</div></div>
      <div class="nx-me-row"><div><h4>Seasonal themes</h4><p>Christmas, Halloween, New Year and your country’s festivities, at the edges and never over your numbers.</p>${seasonLine(p)}</div>
        <button type="button" class="nx-switch${p.seasonal === false ? '' : ' on'}" data-toggle="seasonal" role="switch" aria-checked="${p.seasonal !== false}"><i></i></button></div>
      <button type="button" class="nx-me-link" data-act="setup">${icon('refresh', 14)}Answer the setup questions again</button>`;
    return `
      <div class="nx-me-tiles">
        <button type="button" data-act="export">${tile('blue', 'download')}<b>Export data</b><small>A copy of everything as a file</small></button>
        <button type="button" data-act="import">${tile('blue', 'upload')}<b>Import data</b><small>Replace with a Nexora file</small></button>
        <button type="button" data-act="backups">${tile('amber', 'archive')}<b>Backups</b><small>Daily copies, last 10 days</small></button>
      </div>
      <div class="nx-me-group"><h3>Where your data lives</h3>
        <ul class="nx-me-facts"><li>${icon('lock', 15)}<span><b>Your finances</b>: encrypted on this computer with your password, then saved as one file in your Google Drive folder. Without your password or recovery key it’s unreadable, to Google too.</span></li>
          <li>${icon('shieldCheck', 15)}<span><b>Your password</b>: never stored anywhere. It only unlocks the key that opens your file.</span></li>
          <li>${icon('sparkles', 15)}<span><b>AI features</b>: off unless you add a key. What they see is listed under AI features.</span></li></ul>
        <button type="button" class="nx-me-link" data-act="peek">${icon('eye', 14)}${mePeek ? 'Hide' : 'See'} what’s saved in your Drive</button>
        ${mePeek ? `<pre class="nx-me-peek">${escH(mePeekText)}…</pre>` : ''}</div>
      <div class="nx-me-danger"><div><h3>Delete profile</h3><p>Removes ${escH(a.name)}'s profile from this computer.</p></div><button type="button" class="nx-btn-danger" data-act="delete">Delete profile</button></div>`;
  }
  // What the rule gives this month, so "2" or "4" is never a guess
  function payHint(p) {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth(), auto = (p.payday || 'auto') === 'auto';
    const r = auto ? NX_HOL.nthLastBusinessDay(y, m, bizN(p), countryOf(p)) : { date: new Date(y, m, Math.min(p.day || 25, new Date(y, m + 1, 0).getDate())), skipped: [] };
    const day = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
    return `<span class="nx-me-hint">${auto ? `<span>${bizLabel(bizN(p)).replace(/^./, c => c.toUpperCase())}</span><i>·</i>` : ''}<span>This month:</span> <b>${day(r.date)}</b></span>` +
      (!auto ? '' : r.skipped.length ? `<span class="nx-me-hint"><span>Skips the holiday on</span> <b>${day(r.skipped[0].date)}</b></span>` : `<span class="nx-me-hint nx-me-soft">Weekends and public holidays don’t count.</span>`);
  }
  // "On now: Halloween" / "Next: Christmas 1 Dec"
  function seasonLine(p) {
    if (p.seasonal === false) return '';
    const cc = countryOf(p), now = new Date(), cur = NX_HOL.seasonFor(now, cc);
    if (cur) return `<p class="nx-me-hint"><span>On now:</span> <b>${NX_HOL.SEASONS[cur].name}</b></p>`;
    for (let i = 1; i < 400; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i), s = NX_HOL.seasonFor(d, cc);
      if (s) return `<p class="nx-me-hint"><span>Next:</span> <b>${NX_HOL.SEASONS[s].name}</b> <span>${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></p>`;
    }
    return '';
  }
  function renderMe() {
    const el = document.getElementById('nx-me'), a = currentAccount();
    if (!a) return;
    el.querySelector('.nx-me-who').innerHTML = `${avatarHtml(a, 'nx-avatar-lg')}<div><b>${escH(a.name)}</b><small>${escH(a.email || 'No email added')}</small></div>`;
    el.querySelectorAll('[data-sec]').forEach(b => b.classList.toggle('on', b.dataset.sec === meSec));
    el.querySelector('.nx-me-title').textContent = ME_SECTIONS.find(s => s[0] === meSec)[2];
    el.querySelector('.nx-me-content').innerHTML = meBody();
  }
  function setPref(patch) {
    const p = { ...(loadProfile() || {}), ...patch };
    saveProfile(p); applyPrefs(p); applyProfile(); renderAll(); applySeason(); renderMe();
  }
  window.nxOpenMe = (sec = 'profile') => {
    if (!currentAccount()) return;
    meSec = sec; meAvTab = currentAccount().avatar?.kind || 'initials';
    let el = document.getElementById('nx-me');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nx-me';
      el.innerHTML = `<div class="nx-me-card" role="dialog" aria-label="My profile">
          <aside class="nx-me-nav"><div class="nx-me-who"></div>
            ${ME_SECTIONS.map(([k, ic, l]) => `<button type="button" data-sec="${k}">${icon(ic, 16)}${l}</button>`).join('')}</aside>
          <section class="nx-me-main"><header><h2 class="nx-me-title"></h2><button type="button" class="nx-me-x" data-act="close" title="Close">${icon('close', 16)}</button></header>
            <div class="nx-me-content"></div></section></div>`;
      document.body.appendChild(el);
      el.addEventListener('mousedown', e => { if (e.target === el) el.classList.remove('open'); });
      el.addEventListener('input', e => {
        const m = e.target.name && el.querySelector(`.nx-meter[data-for="${e.target.name}"]`);
        if (m) { const s = pwStrength(e.target.value); m.dataset.s = s; m.querySelector('b').textContent = ['', 'Too weak', 'Fair', 'Strong'][s]; }
        const er = e.target.closest('form')?.querySelector('.nx-auth-err'); if (er) er.textContent = '';
      });
      el.addEventListener('change', e => {
        if (e.target.dataset.pref === 'day') setPref({ day: Math.min(31, Math.max(1, +e.target.value || 25)) });
        if (e.target.dataset.pref === 'bizDay') setPref({ bizDay: bizN({ bizDay: e.target.value }) });
        if (e.target.dataset.pref === 'country') setPref({ country: e.target.value });
        // A photo: centre-cropped to a square, scaled to 256 px, saved as a small JPEG
        if (e.target.id === 'nx-av-file' && e.target.files[0]) {
          const img = new Image(), url = URL.createObjectURL(e.target.files[0]);
          img.onload = () => {
            const s = Math.min(img.width, img.height), c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
            c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
            URL.revokeObjectURL(url);
            updateAccount(currentId, { avatar: { ...(currentAccount().avatar || {}), kind: 'photo', photo: c.toDataURL('image/jpeg', 0.85) } });
            applyProfile(); renderMe();
          };
          img.onerror = () => { URL.revokeObjectURL(url); showToast('That file isn’t an image Nexora can read.'); };
          img.src = url;
        }
      });
      el.addEventListener('click', async e => {
        const t = e.target;
        const eye = t.closest('.nx-eye');
        if (eye) { const inp = eye.previousElementSibling, show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; eye.innerHTML = icon(show ? 'eyeOff' : 'eye'); return; }
        const sec = t.closest('[data-sec]'); if (sec) { meSec = sec.dataset.sec; meRk = null; mePeek = false; renderMe(); return; }
        const col = t.closest('[data-color]'); if (col) { updateAccount(currentId, { color: col.dataset.color }); applyProfile(); renderMe(); return; }
        const emb = t.closest('[data-emblem]'); if (emb) { updateAccount(currentId, { avatar: { ...(currentAccount().avatar || {}), kind: 'emblem', emblem: emb.dataset.emblem } }); applyProfile(); renderMe(); return; }
        const sg = t.closest('.nx-seg button');
        if (sg) {
          const name = sg.parentElement.dataset.seg, val = sg.dataset.v;
          if (name === 'autolock') { setAutolockMode(val); renderMe(); }
          else if (name === 'lang') setLanguage(val);
          else if (name === 'avtab') {
            meAvTab = val;
            if (val === 'initials') updateAccount(currentId, { avatar: { ...(currentAccount().avatar || {}), kind: 'initials' } });
            if (val === 'emblem' && currentAccount().avatar?.kind !== 'emblem') updateAccount(currentId, { avatar: { ...(currentAccount().avatar || {}), kind: 'emblem', emblem: currentAccount().avatar?.emblem || 'star' } });
            if (val === 'photo' && currentAccount().avatar?.photo) updateAccount(currentId, { avatar: { ...currentAccount().avatar, kind: 'photo' } });
            applyProfile(); renderMe();
          }
          else setPref({ [name]: val });
          return;
        }
        const tg = t.closest('[data-toggle]'); if (tg) { setPref({ [tg.dataset.toggle]: !tg.classList.contains('on') }); return; }
        const cc = t.closest('[data-ccy-pick]'); if (cc) { setPref({ currency: cc.dataset.ccyPick }); return; }
        const act = t.closest('[data-act]')?.dataset.act;
        if (act === 'close') { el.classList.remove('open'); meRk = null; }
        if (act === 'me-rk-copy') { navigator.clipboard?.writeText(meRk).then(() => { const s = t.closest('button').querySelector('span'); if (s) s.textContent = 'Copied'; }).catch(() => {}); }
        if (act === 'me-rk-dl') { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([`Nexora recovery key: ${currentAccount().name}\n\n${meRk}\n\nCreated ${new Date().toLocaleDateString('en-GB')}. Keep it somewhere safe, away from this computer.\n`], { type: 'text/plain' })), download: `Nexora recovery key - ${currentAccount().name}.txt` }); a.click(); }
        if (act === 'peek') { mePeek = !mePeek; if (mePeek) mePeekText = JSON.stringify(await readFile(currentId) || {}, null, 1).slice(0, 520); renderMe(); }
        if (act === 'photo-pick') document.getElementById('nx-av-file')?.click();
        if (act === 'photo-remove') { updateAccount(currentId, { avatar: { kind: 'initials' } }); meAvTab = 'initials'; applyProfile(); renderMe(); }
        if (act === 'signout') nxSignOut();
        if (act === 'setup') { el.classList.remove('open'); window.nxOpenSetup(); }
        if (act === 'export') exportData();
        if (act === 'import') { el.classList.remove('open'); importData(); }
        if (act === 'backups') { el.classList.remove('open'); openBackupsModal(); }
        if (act === 'ai-remove') {
          if (!await nexoraConfirm('Remove the AI key? Payslips go back to the built-in reader, and categories and the monthly summary stop.')) return;
          await api?.clearAiKey?.(); meAi = { loaded: true, masked: null }; renderMe(); showToast('AI key removed');
        }
        if (act === 'delete') {
          const a = currentAccount();
          if (!await nexoraConfirm(`Delete ${a.name}'s profile?\n\nIt disappears from Nexora on every computer. Its encrypted file is kept in this computer's backups.`, 'Delete profile')) return;
          await enqueue(() => api?.profileRemove(a.id));
          saveAccounts(accounts().filter(x => x.id !== a.id));
          localStorage.removeItem(lockKey(a.id));
          nxSignOut();
        }
      });
      el.addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target, err = txt => { f.querySelector('.nx-auth-err').textContent = txt; };
        if (f.id === 'nx-me-profile') {
          const name = f.elements.name.value.trim(), email = f.elements.email.value.trim();
          if (!name) return err('Please add your name.');
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('That email doesn’t look right.');
          updateAccount(currentId, { name, email });
          applyProfile(); renderMe(); showToast('Profile saved');
        }
        if (f.id === 'nx-me-pw') {
          const pw = f.elements.pw.value;
          if (pw.length < 8) return err('Use at least 8 characters for the new password.');
          if (pw !== f.elements.pw2.value) return err('The two new passwords don’t match.');
          let opened = null; try { opened = await openFile(currentId, f.elements.cur.value); } catch (x) {}
          if (!opened) return err('Your current password isn’t right.');
          // only the key is re-wrapped; the data stays as it is
          if (!await rekey(currentId, 'password', pw)) return err('Couldn’t save. Check that the Google Drive folder is available.');
          renderMe(); showToast('Password updated');
        }
        if (f.id === 'nx-me-ai') {
          const key = f.elements.key.value.trim();
          if (!key) return err('Paste your API key first.');
          const res = await api?.setAiKey?.(key);
          if (!res?.ok) return err(res?.error || 'Couldn’t save the key.');
          meAi = { loaded: false, masked: null }; renderMe(); showToast('AI key saved');
        }
        if (f.id === 'nx-me-rk') {
          let opened = null; try { opened = await openFile(currentId, f.elements.cur.value); } catch (x) {}
          if (!opened) return err('That password isn’t right.');
          const rk = newRecoveryKey();
          if (!await rekey(currentId, 'recovery', normKey(rk))) return err('Couldn’t save. Check that the Google Drive folder is available.');
          updateAccount(currentId, { rkCreatedAt: new Date().toISOString() });
          meRk = rk; renderMe();
        }
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') el.classList.remove('open'); });
    }
    renderMe();
    el.classList.add('open');
  };

  // ══════════════ LOANS ══════════════
  // An instalment is part interest, part principal; only the principal lowers the
  // debt. The app takes the whole instalment off and computes "months left" as
  // balance ÷ instalment (a €150k mortgage at 3.5% paying €650 shows ~231 months;
  // the real figure is 384). Both need the loan's annual rate (TAN).
  const loanMonthlyRate = l => +l.rate > 0 ? +l.rate / 100 / 12 : 0;
  // Annuity: n = −ln(1 − r·B/P) / ln(1 + r). null = no instalment; Infinity = it doesn't cover the interest
  function loanMonthsLeft(l) {
    const B = +l.value, P = +l.instalment, r = loanMonthlyRate(l);
    if (!(B > 0)) return 0;
    if (!(P > 0)) return null;
    if (!r) return Math.ceil(B / P);
    if (P <= B * r) return Infinity;
    return Math.ceil(-Math.log(1 - r * B / P) / Math.log(1 + r));
  }
  function loanPayoffDate(l) {
    const n = loanMonthsLeft(l);
    return n == null || !isFinite(n) ? null : new Date(now.getFullYear(), now.getMonth() + n, 1);
  }
  // Takes a matching instalment's principal off its loan and records it on the
  // expense, so deleting it or undoing an import restores the balance exactly
  function applyLoanPayment(exp) {
    const d = String(exp.desc || '').toLowerCase();
    const l = (state.liabilities || []).find(x => x.isCredit && x.linkedKeyword && d.includes(x.linkedKeyword.toLowerCase()));
    if (!l || !(l.value > 0)) return false;
    const interest = Math.min(exp.amount, parseFloat((l.value * loanMonthlyRate(l)).toFixed(2)));
    const principal = parseFloat(Math.min(l.value, exp.amount - interest).toFixed(2));
    l.value = parseFloat((l.value - principal).toFixed(2));
    exp.loanPayment = { id: l.id, principal, interest };
    return true;
  }
  function revertLoanPayment(exp) {
    const p = exp && exp.loanPayment;
    const l = p && (state.liabilities || []).find(x => x.id === p.id);
    if (l) l.value = parseFloat((l.value + p.principal).toFixed(2));
  }
  const spanMonths = n => { const y = Math.floor(n / 12), m = n % 12; return [y && `${y} yr${y > 1 ? 's' : ''}`, m && `${m} mo`].filter(Boolean).join(' ') || 'this month'; };
  function installLoanLogic() {
    // Every place an expense is created pays its loan; deleting or undoing gives it back
    window.addExpense = function () {
      const desc = document.getElementById('e-desc').value.trim();
      const amount = parseFloat(document.getElementById('e-amount').value);
      const cat = document.getElementById('e-cat').value;
      const date = getDateRaw('e-date') || localIso();
      const recurring = document.getElementById('e-recurring').checked;
      if (!desc || isNaN(amount) || amount <= 0) return;
      const exp = { id: uid(), desc, amount, cat, date, recurring };
      applyLoanPayment(exp);
      state.expenses.push(exp);
      document.getElementById('e-desc').value = ''; document.getElementById('e-amount').value = '';
      document.getElementById('e-recurring').checked = false;
      save(); renderAll(); checkRecurring();
    };
    window.delExpense = (orig => function (id) { revertLoanPayment(state.expenses.find(e => e.id === id)); return orig.apply(this, arguments); })(window.delExpense);
    const payNew = orig => function () {
      const before = new Set(state.expenses.map(e => e.id));
      const out = orig.apply(this, arguments);
      if (state.expenses.filter(e => !before.has(e.id)).map(applyLoanPayment).some(Boolean)) { save(); renderAll(); }
      return out;
    };
    window.addOneRecurring = payNew(window.addOneRecurring);
    window.addAllRecurring = payNew(window.addAllRecurring);
    window.impCommit = payNew(window.impCommit);
    window.impUndoBatch = (orig => async function (id) {
      const batch = state.expenses.filter(e => e.importBatch === id);
      await orig.apply(this, arguments);
      if (!(state.importBatches || []).some(b => b.id === id) && batch.some(e => e.loanPayment)) { batch.forEach(revertLoanPayment); save(); renderAll(); }
    })(window.impUndoBatch);
    // Monthly snapshots keep what you own and owe, not only the difference
    window.snapshotNetWorth = (orig => function () {
      orig.apply(this, arguments);
      const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, s = (state.nwHistory || []).find(x => x.month === key);
      if (s) { const t = nwTotals(); s.assets = Math.round(t.owned); s.liabilities = Math.round(t.owed); }
    })(window.snapshotNetWorth);
  }

  // ══════════════ NET WORTH ══════════════
  const ASSET_TYPES = { invest: ['Investments', 'chart', 'blue', '#2F6BFF'], cash: ['Cash & savings', 'wallet', 'mint', '#12C99B'],
    property: ['Property', 'home', 'violet', '#8B5CF6'], retirement: ['Retirement', 'umbrella', 'sky', '#0EA5E9'],
    vehicle: ['Vehicles', 'car', 'amber', '#F5B84B'], other: ['Other', 'coins', 'slate', '#94A3B8'] };
  const DEBT_TYPES = { mortgage: ['Mortgage', 'home'], car: ['Car loan', 'car'], personal: ['Personal loan', 'note'], card: ['Credit card', 'card'], other: ['Other debt', 'receipt'] };
  const LOAN_KINDS = ['mortgage', 'car', 'personal'];
  const assetType = a => a.type || (/hous|apart|casa|home|flat|im[oó]vel|terreno|propert/i.test(a.name) ? 'property' : /\bcar\b|carro|auto|mota|moto|vehic/i.test(a.name) ? 'vehicle'
    : /ppr|pension|reforma|retire/i.test(a.name) ? 'retirement' : /saving|poupan|account|conta|dep[oó]sit|cash|bank|banco/i.test(a.name) ? 'cash' : 'other');
  const debtType = l => l.type || (/mortg|hipot|habita|casa|house|home/i.test(l.name) ? 'mortgage' : /\bcar\b|carro|auto/i.test(l.name) ? 'car' : /card|cart[aã]o/i.test(l.name) ? 'card' : l.isCredit ? 'personal' : 'other');
  const ago = iso => { if (!iso) return null; const d = Math.floor((Date.now() - new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).getTime()) / 864e5);
    return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 31 ? `${d} days ago` : d < 365 ? `${Math.round(d / 30)} month${Math.round(d / 30) > 1 ? 's' : ''} ago` : `${(d / 365).toFixed(1)} years ago`; };
  const staleDays = iso => iso ? (Date.now() - new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).getTime()) / 864e5 : Infinity;
  function nwTotals() {
    const port = totalPortfolioStats().val;
    const owned = port + state.assets.reduce((s, a) => s + (+a.value || 0), 0);
    const owed = state.liabilities.reduce((s, l) => s + (+l.value || 0), 0);
    return { port, owned, owed, net: owned - owed };
  }
  let nwForm = null, nwRange = '1Y', nwDebtKind = 'car';
  const mk = s => { const [y, m] = s.split('-').map(Number); return { y, m }; };
  function nwChanges(net) {
    const H = [...(state.nwHistory || [])].sort((a, b) => a.month.localeCompare(b.month));
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prev = H.filter(h => h.month < cur).pop();
    const lastDec = H.find(h => h.month === `${now.getFullYear() - 1}-12`) || H.find(h => h.month.startsWith(String(now.getFullYear())) && h.month < cur);
    return { month: prev ? net - prev.value : null, year: lastDec ? net - lastDec.value : null, yearLabel: lastDec && lastDec.month.endsWith('-12') ? 'this year' : 'since ' + (lastDec ? new Date(mk(lastDec.month).y, mk(lastDec.month).m - 1, 1).toLocaleString('en-GB', { month: 'short' }) : ''), H };
  }
  const chip = (v, label) => v == null ? '' : `<span class="nx-delta ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : '−'}${eur(Math.abs(v), 0)} ${label}</span>`;
  const editable = (kind, id, val, cls = '') => `<button type="button" class="nx-nw-val ${cls}" data-edit="${kind}:${escH(id)}" title="Click to change">${val}</button>`;

  function nxNetWorth() {
    const tab = document.getElementById('tab-networth');
    if (!tab) return;
    let root = document.getElementById('nx-nw');
    if (!root) {
      [...tab.children].forEach(ch => { if (!ch.classList.contains('sec-header')) ch.style.display = 'none'; });
      root = Object.assign(document.createElement('div'), { id: 'nx-nw' });
      tab.appendChild(root);
      root.addEventListener('click', onNwClick);
      root.addEventListener('submit', onNwSubmit);
      root.addEventListener('change', e => { if (e.target.name === 'kind') { nwDebtKind = e.target.value; nxNetWorth(); } });
      root.addEventListener('keydown', e => {
        if (!e.target.classList.contains('nx-nw-edit')) return;
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') { e.target.dataset.cancel = '1'; e.target.blur(); }
      });
      root.addEventListener('focusout', e => { if (e.target.classList.contains('nx-nw-edit')) commitEdit(e.target); });
    }
    const T = nwTotals(), ch = nwChanges(T.net);
    const spark = ch.H.slice(-12).map(h => h.value).concat(T.net);
    const lo = Math.min(...spark), hi = Math.max(...spark), sx = i => (i / Math.max(1, spark.length - 1) * 220).toFixed(1), sy = v => (52 - (v - lo) / ((hi - lo) || 1) * 44).toFixed(1);
    const sparkPath = spark.map((v, i) => `${i ? 'L' : 'M'}${sx(i)} ${sy(v)}`).join(' ');

    // What you own, by type
    const owned = [{ id: '__portfolio__', name: 'Portfolio', value: T.port, type: 'invest', live: true }, ...state.assets.map(a => ({ ...a, type: assetType(a) }))];
    const byType = Object.keys(ASSET_TYPES).map(k => [k, owned.filter(a => a.type === k).reduce((s, a) => s + (+a.value || 0), 0)]).filter(x => x[1] > 0);
    const ownRows = owned.sort((a, b) => b.value - a.value).map(a => {
      const [lab, ic, cls] = ASSET_TYPES[a.type], stale = !a.live && staleDays(a.updatedAt) > 90;
      return `<div class="nx-nw-row">${tile(cls, ic)}<div class="nx-nw-main"><b>${escH(a.name)}</b>
          <small>${lab} · ${a.live ? 'updates with prices' : a.updatedAt ? `<span class="${stale ? 'nx-stale' : ''}">updated ${ago(a.updatedAt)}${stale ? '. Still right?' : ''}</span>` : 'date not recorded'}</small></div>
        ${a.live ? `<button type="button" class="nx-nw-val nx-nw-link" data-act="portfolio">${eur(a.value)}</button><span class="nx-nw-x-ph"></span>`
                 : `${editable('asset', a.id, eur(a.value))}<button type="button" class="nx-row-del" data-del="asset:${escH(a.id)}" title="Remove">${icon('trash', 14)}</button>`}</div>`;
    }).join('');

    // What you owe
    const debts = state.liabilities.map(l => ({ ...l, kind: debtType(l) })).sort((a, b) => b.value - a.value);
    const debtRows = debts.map(l => {
      const [lab, ic] = DEBT_TYPES[l.kind];
      let extra = '';
      if (l.isCredit) {
        const orig = +l.originalValue || +l.value, paid = Math.max(0, orig - l.value), pct = orig > 0 ? Math.min(1, paid / orig) : 0, n = loanMonthsLeft(l), pay = loanPayoffDate(l);
        const when = n == null ? '' : !isFinite(n) ? '<span class="nx-stale">the instalment doesn’t cover the interest</span>'
          : l.rate > 0 ? `paid off <b>${pay.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</b> · ${spanMonths(n)}`
          : `<button type="button" class="nx-nw-inline" data-edit="rate:${escH(l.id)}">Add the interest rate</button> to see when it’s paid off`;
        extra = `<div class="nx-nw-loan"><span class="nx-limit-track"><span class="nx-limit-fill" style="width:${(pct * 100).toFixed(1)}%;background:var(--up);"></span></span>
            <span class="nx-nw-loan-pct">${Math.round(pct * 100)}% repaid</span></div>
          <small class="nx-nw-when">${when}</small>`;
      }
      const meta = [lab, l.isCredit && l.instalment ? `${eur(+l.instalment)}/mo` : '', l.isCredit ? (l.rate > 0 ? editable('rate', l.id, `${l.rate}% a year`, 'nx-nw-rate') : '') : ''].filter(Boolean).join(' · ');
      return `<div class="nx-nw-row nx-nw-debt">${tile('coral', ic)}<div class="nx-nw-main"><b>${escH(l.name)}</b><small>${meta}</small>${extra}</div>
        ${editable('debt', l.id, eur(+l.value), 'nx-nw-neg')}<button type="button" class="nx-row-del" data-del="debt:${escH(l.id)}" title="Remove">${icon('trash', 14)}</button></div>`;
    }).join('') || '<div class="nx-nw-empty">No debts. Nice.</div>';

    const typeOpts = (types, sel) => Object.entries(types).filter(([k]) => k !== 'invest').map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v[0]}</option>`).join('');
    const isLoan = LOAN_KINDS.includes(nwDebtKind);
    const assetForm = nwForm !== 'asset' ? '' : `<form class="nx-nw-form" id="nx-nw-asset" novalidate>
        <label class="nx-f nx-nw-wide"><span>Name</span><input name="name" placeholder="e.g. Apartment in Lisbon"></label>
        <label class="nx-f"><span>Type</span><select name="type" class="nx-select">${typeOpts(ASSET_TYPES, 'cash')}</select></label>
        <label class="nx-f"><span>Value (€)</span><input name="value" type="number" min="0" step="0.01" placeholder="0.00"></label>
        <div class="nx-auth-err"></div><div class="nx-nw-form-btns"><button type="button" class="btn-ghost" data-act="cancel">Cancel</button><button class="btn" type="submit">Add</button></div></form>`;
    const debtForm = nwForm !== 'debt' ? '' : `<form class="nx-nw-form" id="nx-nw-debt" novalidate>
        <label class="nx-f nx-nw-wide"><span>Name</span><input name="name" placeholder="e.g. Mortgage at CGD"></label>
        <label class="nx-f"><span>Type</span><select name="kind" class="nx-select">${typeOpts(DEBT_TYPES, nwDebtKind)}</select></label>
        <label class="nx-f"><span>${isLoan ? 'Still owed (€)' : 'Balance (€)'}</span><input name="value" type="number" min="0" step="0.01" placeholder="0.00"></label>
        ${isLoan ? `<label class="nx-f"><span>Original loan (€)</span><input name="orig" type="number" min="0" step="0.01" placeholder="e.g. 150000"></label>
        <label class="nx-f"><span>Monthly instalment (€)</span><input name="inst" type="number" min="0" step="0.01" placeholder="e.g. 650"></label>
        <label class="nx-f"><span>Interest rate (% a year)</span><input name="rate" type="number" min="0" step="0.01" placeholder="e.g. 3.5"><small>The TAN on your loan statement.</small></label>
        <label class="nx-f"><span>Payment keyword <em>optional</em></span><input name="kw" placeholder="e.g. Prestação Casa"><small>Expenses containing it pay this loan.</small></label>` : ''}
        <div class="nx-auth-err"></div><div class="nx-nw-form-btns"><button type="button" class="btn-ghost" data-act="cancel">Cancel</button><button class="btn" type="submit">Add</button></div></form>`;

    root.innerHTML = `
      <div class="card nx-nw-hero">
        <div><div class="nx-nw-label">Net worth</div><div class="nx-nw-big">${eur(T.net)}</div>
          <div class="nx-nw-chips">${chip(ch.month, 'this month')}${chip(ch.year, ch.yearLabel)}</div>
          <div class="nx-nw-sum"><span>Own</span> <b>${eur(T.owned, 0)}</b> · <span>Owe</span> <b>${eur(T.owed, 0)}</b> · <span>Debt ratio</span> <b>${T.owned ? Math.round(T.owed / T.owned * 100) : 0}%</b></div></div>
        <svg class="nx-nw-spark" viewBox="0 0 220 56" preserveAspectRatio="none"><defs><linearGradient id="nxNwArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".28"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
          <path d="${sparkPath} L220 56 L0 56Z" fill="url(#nxNwArea)"/><path d="${sparkPath}" fill="none" stroke="var(--gold)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="nx-nw-grid">
        <div class="card">
          <div class="nx-nw-head"><div><div class="card-title" style="margin:0;">What you own</div><div class="nx-nw-tot">${eur(T.owned)}</div></div>
            <button type="button" class="nx-inc-act" data-form="asset">${nwForm === 'asset' ? 'Close' : '+ Add'}</button></div>
          <div class="nx-split nx-nw-split">${byType.map(([k, v]) => `<div class="nx-split-seg" style="flex:${v};background:${ASSET_TYPES[k][3]};" title="${ASSET_TYPES[k][0]}: ${eur(v)}"></div>`).join('')}</div>
          <div class="nx-nw-legend">${byType.map(([k, v]) => `<span><i style="background:${ASSET_TYPES[k][3]}"></i>${ASSET_TYPES[k][0]} <b>${Math.round(v / T.owned * 100)}%</b></span>`).join('')}</div>
          ${assetForm}<div class="nx-nw-list">${ownRows}</div>
        </div>
        <div class="card">
          <div class="nx-nw-head"><div><div class="card-title" style="margin:0;">What you owe</div><div class="nx-nw-tot nx-nw-neg">${eur(T.owed)}</div></div>
            <button type="button" class="nx-inc-act" data-form="debt">${nwForm === 'debt' ? 'Close' : '+ Add'}</button></div>
          ${debtForm}<div class="nx-nw-list">${debtRows}</div>
        </div>
      </div>
      <div class="card">
        <div class="nx-nw-head"><div class="card-title" style="margin:0;">Net worth over time</div>
          <div class="nx-seg" data-range>${['6M', '1Y', 'All'].map(r => `<button type="button" data-r="${r}" class="${r === nwRange ? 'on' : ''}">${r}</button>`).join('')}</div></div>
        <div class="nx-sal-keys" style="margin:-4px 0 10px;"><span><i style="background:var(--gold)"></i>Net worth</span><span><i style="background:var(--up)"></i>Own</span><span><i style="background:var(--down)"></i>Owe</span></div>
        <div class="chart-wrap" style="height:260px;"><canvas id="nx-nw-chart"></canvas></div>
      </div>`;
    if (nwForm) setTimeout(() => root.querySelector('.nx-nw-form input')?.focus(), 30);
    nxNwChart();
  }

  let _nxNwChart = null;
  function nxNwChart() {
    const cv = document.getElementById('nx-nw-chart');
    if (_nxNwChart) { _nxNwChart.destroy(); _nxNwChart = null; }
    if (!cv || !cv.offsetParent) return;
    const T = nwTotals(), cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let H = [...(state.nwHistory || [])].filter(h => h.month !== cur).sort((a, b) => a.month.localeCompare(b.month));
    H.push({ month: cur, value: T.net, assets: T.owned, liabilities: T.owed });
    if (nwRange !== 'All') H = H.slice(-(nwRange === '6M' ? 6 : 12));
    const split = H.every(h => h.assets != null);
    const label = h => { const { y, m } = mk(h.month); return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'short' }) + (H.length > 12 || nwRange === 'All' ? ' ' + String(y).slice(2) : ''); };
    const line = (lab, data, col, extra = {}) => ({ label: lab, data, borderColor: col, backgroundColor: col, fill: false, ...extra });
    _nxNwChart = new Chart(cv, {
      type: 'line',
      data: { labels: H.map(label), datasets: [
        line('Net worth', H.map(h => h.value), cssv('--gold'), { fill: true }),
        ...(split ? [line('Own', H.map(h => h.assets), cssv('--up'), { borderDash: [5, 4] }), line('Owe', H.map(h => h.liabilities), cssv('--down'), { borderDash: [5, 4] })] : []),
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}  ${eur(c.raw, 0)}` } } },
        scales: { x: { ticks: { color: cssv('--text3') } }, y: { ticks: { color: cssv('--text3'), callback: v => '€' + Math.round(v / 1000) + 'k' }, grid: {} } } },
    });
  }

  function onNwClick(e) {
    const t = e.target;
    const f = t.closest('[data-form]'); if (f) { nwForm = nwForm === f.dataset.form ? null : f.dataset.form; nxNetWorth(); return; }
    if (t.closest('[data-act="cancel"]')) { nwForm = null; nxNetWorth(); return; }
    if (t.closest('[data-act="portfolio"]')) { showTab('portfolio', document.getElementById('nav-portfolio-btn')); return; }
    const r = t.closest('[data-range] [data-r]'); if (r) { nwRange = r.dataset.r; nxNetWorth(); return; }
    const del = t.closest('[data-del]');
    if (del) {
      const [kind, id] = del.dataset.del.split(':');
      if (kind === 'asset') state.assets = state.assets.filter(a => a.id !== id); else state.liabilities = state.liabilities.filter(l => l.id !== id);
      save(); renderAll(); return;
    }
    const ed = t.closest('[data-edit]');
    if (ed && !ed.querySelector('input')) {
      const [kind, id] = ed.dataset.edit.split(':');
      const item = kind === 'asset' ? state.assets.find(a => a.id === id) : state.liabilities.find(l => l.id === id);
      const cur = kind === 'rate' ? (item.rate || '') : item.value;
      const inp = Object.assign(document.createElement('input'), { type: 'number', min: 0, step: '0.01', value: cur, className: 'nx-nw-edit', placeholder: kind === 'rate' ? '% a year' : '0.00' });
      inp.dataset.edit = ed.dataset.edit;
      ed.replaceWith(inp); inp.focus(); inp.select();
    }
  }
  function commitEdit(inp) {
    const [kind, id] = inp.dataset.edit.split(':');
    if (!inp.dataset.cancel && inp.value !== '') {
      const v = Math.max(0, parseFloat(inp.value) || 0);
      if (kind === 'asset') { const a = state.assets.find(x => x.id === id); if (a) { a.value = v; a.updatedAt = localIso(); } }
      if (kind === 'debt') { const l = state.liabilities.find(x => x.id === id); if (l) l.value = v; }
      if (kind === 'rate') { const l = state.liabilities.find(x => x.id === id); if (l) l.rate = v; }
      save(); renderAll();
    } else nxNetWorth();
  }
  function onNwSubmit(e) {
    e.preventDefault();
    const f = e.target, v = n => (f.elements[n]?.value || '').trim(), num = n => parseFloat(v(n)), err = s => { f.querySelector('.nx-auth-err').textContent = s; };
    if (!v('name')) return err('Give it a name.');
    if (!(num('value') >= 0) || v('value') === '') return err('Add the amount.');
    if (f.id === 'nx-nw-asset') state.assets.push({ id: uid(), name: v('name'), value: num('value'), type: v('type'), updatedAt: localIso() });
    else {
      const kind = v('kind'), l = { id: uid(), name: v('name'), value: num('value'), type: kind };
      if (LOAN_KINDS.includes(kind)) Object.assign(l, { isCredit: true, originalValue: num('orig') || num('value'), instalment: num('inst') || 0, rate: num('rate') || 0, linkedKeyword: v('kw') });
      state.liabilities.push(l);
    }
    nwForm = null; save(); renderAll();
  }

  // ══════════════ RISK — four more measures ══════════════
  // computeRisk as in risk.js, plus the portfolio and benchmark value series the
  // new measures need (to port: return `series` from the app's computeRisk).
  let _nxRisk = null;
  function computeRiskWithSeries(holdings, hist, benchTicker, perYear) {
    const iso = ts => new Date(ts * 1000).toISOString().slice(0, 10);
    const series = {};
    const add = (key, d) => { if (!d?.timestamps?.length) return; const pts = d.timestamps.map((tt, i) => [iso(tt), d.closes[i]]).filter(q => q[1] != null); if (pts.length) series[key] = pts; };
    const withData = holdings.filter(h => h.shares > 0 && hist[h.ticker]);
    withData.forEach(h => add(h.ticker, hist[h.ticker]));
    add('EURUSD=X', hist['EURUSD=X']);
    if (benchTicker) add('__bench', hist[benchTicker]);
    const stockKeys = withData.filter(h => !_isCryptoTicker(h.ticker) && series[h.ticker]).map(h => h.ticker);
    const { dates, cols } = riskAlign(series, stockKeys.length ? stockKeys : withData.map(h => h.ticker));
    if (dates.length < 25) return null;
    const firstIdx = k => cols[k] ? cols[k].findIndex(x => x != null) : -1;
    const included = withData.filter(h => { const f = firstIdx(h.ticker); return f >= 0 && f <= dates.length * 0.1; });
    const excluded = holdings.filter(h => h.shares > 0 && !included.includes(h));
    if (!included.length) return null;
    const start = Math.max(...included.map(h => firstIdx(h.ticker)), cols.__bench ? Math.max(0, firstIdx('__bench')) : 0);
    const fxAt = i => cols['EURUSD=X']?.[i] || null;
    const valueCols = included.map(h => cols[h.ticker].slice(start).map((c, j) => h.shares * histCloseToEur(c, hist[h.ticker].currency, fxAt(start + j))));
    const V = valueCols[0].map((_, i) => valueCols.reduce((s, col) => s + col[i], 0));
    const d = dates.slice(start);
    if (V.length < 25) return null;
    const rp = _returns(V), ann = Math.sqrt(perYear), varP = _cov(rp, rp);
    let bench = null, rb = null, bv = null;
    if (cols.__bench && firstIdx('__bench') >= 0) {
      bv = cols.__bench.slice(start).map((c, j) => histCloseToEur(c, hist[benchTicker].currency, fxAt(start + j)));
      if (bv.every(x => x > 0)) {
        rb = _returns(bv);
        const varB = _cov(rb, rb);
        bench = { beta: varB > 0 ? _cov(rp, rb) / varB : null, corr: varB > 0 && varP > 0 ? _cov(rp, rb) / Math.sqrt(varB * varP) : null, ret: bv[bv.length - 1] / bv[0] - 1, vol: Math.sqrt(varB) * ann };
      } else bv = null;
    }
    const total = V[V.length - 1];
    const rows = included.map((h, k) => {
      const ri = _returns(valueCols[k]);
      return { ticker: h.ticker, weight: valueCols[k][valueCols[k].length - 1] / total, vol: _stdev(ri) * ann,
               beta: rb && _cov(rb, rb) > 0 ? _cov(ri, rb) / _cov(rb, rb) : null, rc: varP > 0 ? (valueCols[k][valueCols[k].length - 1] / total) * _cov(ri, rp) / varP : 0 };
    });
    const rcSum = rows.reduce((s, r) => s + r.rc, 0) || 1;
    rows.forEach(r => { r.rc /= rcSum; });
    rows.sort((a, b) => b.rc - a.rc);
    const worstIdx = rp.indexOf(Math.min(...rp));
    const out = { vol: Math.sqrt(varP) * ann, dd: riskMaxDrawdown(V, d), worst: { ret: rp[worstIdx], date: d[worstIdx + 1] }, ret: V[V.length - 1] / V[0] - 1,
                  bench, rows, excluded: excluded.map(h => h.ticker), from: d[0], to: d[d.length - 1], points: rp.length, series: { d, V, bv, rp, rb } };
    _nxRisk = out;
    return out;
  }

  // Geometric mean return over the periods where the benchmark went one way
  const gmean = xs => xs.length ? Math.pow(xs.reduce((p, x) => p * (1 + x), 1), 1 / xs.length) - 1 : null;
  function riskCapture(rp, rb) {
    const up = rb.map((x, i) => x > 0 ? i : -1).filter(i => i >= 0), dn = rb.map((x, i) => x < 0 ? i : -1).filter(i => i >= 0);
    const ratio = idx => { const b = gmean(idx.map(i => rb[i])), p = gmean(idx.map(i => rp[i])); return b ? p / b : null; };
    return { up: ratio(up), down: ratio(dn), nUp: up.length, nDown: dn.length };
  }
  // Worst fall, and how long it took to climb back to the old peak (if it has)
  function riskRecovery(V, d) {
    let peak = 0, worst = 0, pk = 0, tr = 0;
    for (let i = 1; i < V.length; i++) {
      if (V[i] > V[peak]) peak = i;
      const dd = V[i] / V[peak] - 1;
      if (dd < worst) { worst = dd; pk = peak; tr = i; }
    }
    let rec = -1;
    for (let i = tr + 1; i < V.length; i++) if (V[i] >= V[pk]) { rec = i; break; }
    const days = (a, b) => Math.round((new Date(d[b]) - new Date(d[a])) / 864e5);
    return { dd: worst, peak: d[pk], trough: d[tr], recovered: rec >= 0 ? d[rec] : null, fallDays: days(pk, tr), recDays: rec >= 0 ? days(tr, rec) : null,
             below: V[V.length - 1] / Math.max(...V) - 1, underwater: V.map((_, i) => V[i] / Math.max(...V.slice(0, i + 1)) - 1) };
  }
  const dur = days => days < 14 ? `${days} day${days === 1 ? '' : 's'}` : days < 70 ? `${Math.round(days / 7)} weeks` : days < 730 ? `${Math.round(days / 30.4)} months` : `${(days / 365).toFixed(1)} years`;

  let _nxDdChart = null;
  function nxRiskExtras() {
    const body = document.getElementById('risk-body'), r = _nxRisk;
    if (!body || !body.offsetParent) return;
    let box = document.getElementById('nx-risk-extra');
    if (!box) { box = Object.assign(document.createElement('div'), { id: 'nx-risk-extra', className: 'chart-grid-2' }); body.querySelector('.stats-grid').after(box); }
    if (!r) { box.innerHTML = ''; return; }
    const benchName = riskBenchmark().name;
    const port = ap(), value = (port.holdings || []).reduce((s, h) => s + (h.currentPrice || h.buyPrice || 0) * (h.shares || 0), 0);
    const rec = riskRecovery(r.series.V, r.series.d);
    const cap = r.series.rb ? riskCapture(r.series.rp, r.series.rb) : null;
    const beta = r.bench?.beta;
    const pctTxt = v => (v * 100).toFixed(1).replace('-', '−') + '%';
    const capRow = (label, v, good, sub) => `<div class="nx-cap-row"><div class="nx-cap-top"><span>${label}</span><b class="${good === true ? 'up-text' : good === false ? 'down-text' : ''}">${String(Math.round(v * 100)).replace('-', '−')}%</b></div>
        <div class="nx-cap-track"><span class="nx-cap-fill" style="width:${Math.max(0, Math.min(100, v / 2 * 100)).toFixed(1)}%;background:${good === true ? 'var(--up)' : good === false ? 'var(--down)' : 'var(--gold)'};"></span><i class="nx-cap-mark" title="100% = moves exactly like the benchmark"></i></div><small>${sub}</small></div>`;
    const stress = beta != null ? [0.1, 0.2, 0.3].map(f => {
      const est = Math.max(-1, -f * beta);
      return `<div class="nx-stress-row"><span>${benchName} −${f * 100}%</span><span class="nx-stress-bar"><span style="width:${Math.min(100, Math.abs(est) / 0.45 * 100).toFixed(1)}%"></span></span><b>${pctTxt(est)}</b><span class="nx-stress-eur">−${eurPort(Math.abs(est) * value)}</span></div>`;
    }).join('') : '<div class="muted" style="font-size:12px;">Needs the benchmark’s prices.</div>';
    box.innerHTML = `
      <div class="card">
        <div class="card-title">When the market moves<span class="info-tip">i<span class="tip-body">Capture compares your average gain on days ${escH(benchName)} rose, and your average loss on days it fell, with its own. 100% means you move exactly like it.</span></span></div>
        ${cap && cap.up != null && cap.down != null ? capRow(`On days ${escH(benchName)} rose`, cap.up, cap.up >= 1 ? true : null,
            cap.up < 0 ? 'On those days you fell slightly, on average.' : `You rose ${Math.round(cap.up * 100)}% as much as it did${cap.up >= 1 ? ', more than the market' : ''}.`) +
          capRow(`On days ${escH(benchName)} fell`, cap.down, cap.down <= 1,
            cap.down < 0 ? 'On those days you rose slightly, on average.' : `You fell ${Math.round(cap.down * 100)}% as much as it did${cap.down < 1 ? ', a cushion' : ', harder than the market'}.`) : '<div class="muted" style="font-size:12px;">Needs the benchmark’s prices.</div>'}
        <div class="nx-stress"><div class="nx-stress-title">If ${escH(benchName)} fell…<span class="info-tip">i<span class="tip-body">An estimate from your beta over this period (${beta != null ? beta.toFixed(2) : '–'}). Real falls rarely follow beta exactly: sectors and currencies move on their own.</span></span></div>${stress}</div>
      </div>
      <div class="card">
        <div class="card-title">Falls and recoveries<span class="info-tip">i<span class="tip-body">How far below its previous high the portfolio was on each day, and how long its worst fall took to recover.</span></span></div>
        <div class="nx-rec">
          <div><span>Worst fall</span><b class="down-text">${pctTxt(rec.dd)}</b><small>${_riskDate(rec.peak)} → ${_riskDate(rec.trough)} · over ${dur(rec.fallDays)}</small></div>
          <div><span>Time to recover</span><b>${rec.recDays != null ? dur(rec.recDays) : 'Not yet'}</b><small>${rec.recovered ? `back at the old high on ${_riskDate(rec.recovered)}` : `still ${(Math.abs(rec.below) * 100).toFixed(1)}% below the high`}</small></div>
        </div>
        <div class="chart-wrap" style="height:170px;"><canvas id="nx-dd-chart"></canvas></div>
      </div>`;
    if (_nxDdChart) { _nxDdChart.destroy(); _nxDdChart = null; }
    const cv = document.getElementById('nx-dd-chart');
    const fmtD = s => new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    _nxDdChart = new Chart(cv, {
      type: 'line',
      data: { labels: r.series.d.map(fmtD), datasets: [{ label: 'Below previous high', data: rec.underwater.map(x => +(x * 100).toFixed(2)), borderColor: cssv('--down'), backgroundColor: cssv('--down'), fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw.toFixed(1)}% below the high` } } },
        scales: { x: { ticks: { color: cssv('--text3'), maxTicksLimit: 6 } }, y: { max: 0, ticks: { color: cssv('--text3'), callback: v => v + '%' }, grid: {} } } },
    });
  }

  // ══════════════ HOLDING SIDE PANEL ══════════════
  // Slides in from the right so the holdings table stays in view. Order: price and
  // 52-week range → your position → chart with your buys → facts that fit the
  // type (fund details for ETFs, valuation for stocks) → dividends only if paid →
  // about. Only the body scrolls, inside the panel's corners.
  // To port: main.js fetch-company-info needs Yahoo's fundProfile/summaryDetail
  // modules for TER, fund size and distribution policy.
  let _nxHdChart = null, _nxHdTicker = null, _nxHdRange = '1Y', _nxOrigOpen = null;
  const bigN = n => n == null ? null : n >= 1e12 ? (n / 1e12).toFixed(2) + 'T' : n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n).toLocaleString('de-DE');
  const ccySym = c => ({ EUR: '€', USD: '$', GBP: '£', GBp: 'p', CHF: 'Fr ' }[c] ?? (c ? c + ' ' : ''));
  const fmtDay = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const IC_WINDOW = '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9h17"/>';

  function closeHolding() { document.getElementById('nx-hd')?.classList.remove('open'); if (_nxHdChart) { _nxHdChart.destroy(); _nxHdChart = null; } _nxHdTicker = null; }
  async function nxOpenHolding(ticker) {
    _nxHdTicker = ticker; _nxHdRange = '1Y';
    let el = document.getElementById('nx-hd');
    if (!el) {
      el = Object.assign(document.createElement('div'), { id: 'nx-hd' });
      el.innerHTML = '<div class="nx-hd-back"></div><aside class="nx-hd-panel" role="dialog"></aside>';
      document.body.appendChild(el);
      el.querySelector('.nx-hd-back').addEventListener('click', closeHolding);
      el.addEventListener('click', e => {
        const a = e.target.closest('[data-act]')?.dataset.act;
        if (a === 'close') closeHolding();
        if (a === 'more') e.target.closest('.nx-hd-about').classList.toggle('open');
        if (a === 'closepos') { const tk = _nxHdTicker; closeHolding(); window.nxClosePosition?.(tk); }
        const r = e.target.closest('[data-hdr]');
        if (r) { _nxHdRange = r.dataset.hdr; el.querySelectorAll('[data-hdr]').forEach(b => b.classList.toggle('on', b === r)); nxHdChart(); }
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('open')) closeHolding(); });
    }
    const panel = el.querySelector('.nx-hd-panel');
    panel.innerHTML = `<div class="nx-hd-loading"><span class="cmod-spinner"></span>Loading ${escH(ticker)}…</div>`;
    void el.offsetWidth; el.classList.add('open');   // reflow first so the slide-in transition runs

    const port = ap(), h = (port.holdings || []).find(x => x.ticker === ticker) || {};
    let info = _modalCache.get(ticker)?.data || null;
    if (!info) { try { info = await window.electronAPI.fetchCompanyInfo(ticker); if (info) _modalCache.set(ticker, { data: info, ts: Date.now() }); } catch (e) {} }
    if (_nxHdTicker !== ticker) return;
    info = info || { ticker, longName: ticker, currency: h.priceCurrency || 'EUR', currentPrice: h.currentPriceNative ?? h.currentPrice };

    const isEtf = info.quoteType === 'ETF' || h.assetClass === 'ETF/Fund';
    const cur = info.currency || h.priceCurrency || 'EUR', sym = ccySym(cur);
    const px = info.currentPrice ?? h.currentPriceNative ?? h.currentPrice, dc = h.dayChangePct;
    const lo = info.fiftyTwoWeekLow, hi = info.fiftyTwoWeekHigh, rp = lo != null && hi > lo && px != null ? Math.min(1, Math.max(0, (px - lo) / (hi - lo))) : null;
    const shares = +h.shares || 0, avg = +h.buyPrice || 0, cost = shares * avg, pxEur = h.currentPrice || nativeToEur(px, cur) || avg;
    const val = shares * pxEur, gain = val - cost, gainPct = cost ? gain / cost * 100 : 0;
    const portVal = (port.holdings || []).reduce((s, x) => s + (x.currentPrice || x.buyPrice || 0) * (x.shares || 0), 0);
    const divRecv = (state.dividendLog || []).filter(d => d.ticker === ticker && d.portfolioId === port.id).reduce((s, d) => s + (+d.amountEur || 0), 0);
    const signed = (v, f) => (v >= 0 ? '+' : '−') + f(Math.abs(v));
    const logo = `<img class="nx-hd-logo" src="https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker.split('.')[0])}.png" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'nx-hd-logo nx-hd-logo-fb',textContent:'${escH(ticker[0])}'}))">`;
    const facts = (isEtf ? [
      ['Yearly cost (TER)', info.expenseRatio != null ? (info.expenseRatio * 100).toFixed(2) + '%' : null],
      ['Fund size', info.totalAssets ? '€' + bigN(info.totalAssets) : null],
      ['Dividends', info.distribution], ['Tracks', info.category],
      ['Companies held', info.holdingsCount ? info.holdingsCount.toLocaleString('de-DE') : null],
      ['Provider', info.fundFamily], ['Registered in', info.domicile],
    ] : [
      ['Market cap', info.marketCapFmt || bigN(info.marketCap)], ['P/E', info.trailingPE != null ? info.trailingPE.toFixed(1) : null],
      ['Beta', info.beta != null ? info.beta.toFixed(2) : null], ['Sector', info.sector],
      ['Next results', fmtDay(info.nextEarningsDate)],
      ['Analysts', info.recommendation ? `${String(info.recommendation).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())} · target ${sym}${(+info.targetPrice).toFixed(2)}${info.numberOfAnalysts ? ` · ${info.numberOfAnalysts} analysts` : ''}` : null],
    ]).filter(f => f[1]);
    const dps = +info.dps || 0, accumulating = isEtf && /accum/i.test(info.distribution || '');
    const divHtml = accumulating
      ? `<div class="nx-hd-note">${icon('refresh', 15)}<span><b>Accumulating fund.</b> Dividends are reinvested inside the fund, so nothing is paid out. They show up in the price.</span></div>`
      : dps > 0 ? `<section class="nx-hd-card"><h3>Dividends</h3><div class="nx-hd-facts">
          ${[['Yield', info.dividendYield ? (info.dividendYield * 100).toFixed(2) + '%' : null], ['Per share, a year', `${sym}${dps.toFixed(2)}`],
             ['Next payment', fmtDay(info.nextPayDate)], ['Your yearly income', shares ? eur((nativeToEur(dps, cur) || 0) * shares) : null],
             ['Received so far', divRecv ? eur(divRecv) : null]].filter(f => f[1]).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div></section>` : '';

    panel.innerHTML = `
      <header class="nx-hd-head">${logo}
        <div class="nx-hd-names"><div class="nx-hd-title">${escH(info.longName || ticker)}</div>
          <div class="nx-hd-sub">${[ticker, info.exchange, cur].filter(Boolean).map(escH).join(' · ')}</div></div>
        <button class="nx-hd-btn" data-act="close" title="Close">${icon('close', 16)}</button>
      </header>
      <div class="nx-hd-body">
        <div class="nx-hd-chips"><span class="nx-hd-chip">${isEtf ? 'ETF' : 'Stock'}</span>${info.sector && !isEtf ? `<span class="nx-hd-chip">${escH(info.sector)}</span>` : ''}</div>
        <div class="nx-hd-price"><b>${sym}${px != null ? (+px).toFixed(2) : '–'}</b>
          ${dc != null ? `<span class="nx-delta ${dc >= 0 ? 'up' : 'down'}">${dc >= 0 ? '+' : '−'}${Math.abs(dc).toFixed(2)}% today</span>` : ''}</div>
        ${rp != null ? `<div class="nx-hd-52"><div class="nx-hd-52-track"><i style="left:${(rp * 100).toFixed(1)}%"></i></div>
          <div class="nx-hd-52-lab"><span>${sym}${lo.toFixed(2)}</span><span>52-week range</span><span>${sym}${hi.toFixed(2)}</span></div></div>` : ''}
        ${shares > 0 ? `<section class="nx-hd-card nx-hd-mine"><h3>Your position<button type="button" class="nx-inc-act nx-hd-closepos" data-act="closepos">Close position</button></h3><div class="nx-hd-pos">
          <div><span>Value</span><b>${eur(val)}</b></div>
          <div><span>Gain</span><b class="${gain >= 0 ? 'up-text' : 'down-text'}">${signed(gain, eur)}</b><small class="${gain >= 0 ? 'up-text' : 'down-text'}">${signed(gainPct, v => v.toFixed(2) + '%')}</small></div>
          <div><span>Of the portfolio</span><b>${portVal ? (val / portVal * 100).toFixed(1) : '0'}%</b></div>
          <div><span>Shares</span><b>${fmtShares(shares)}</b></div>
          <div><span>Average cost</span><b>${eur(avg)}</b></div>
          <div><span>Dividends received</span><b>${divRecv ? eur(divRecv) : accumulating ? 'Reinvested' : '–'}</b></div>
        </div></section>` : ''}
        <section class="nx-hd-card">
          <div class="nx-hd-chart-head"><h3>Price</h3>
            <div class="nx-seg">${Object.keys(_CMOD_RANGE_CFG).map(r => `<button type="button" data-hdr="${r}" class="${r === _nxHdRange ? 'on' : ''}">${r}</button>`).join('')}</div></div>
          <div class="nx-hd-chart"><canvas id="nx-hd-chart"></canvas><div class="nx-hd-chart-msg" id="nx-hd-chart-msg">Loading chart…</div></div>
          ${shares > 0 ? `<div class="nx-sal-keys nx-hd-keys"><span data-k="buys"><i class="nx-hd-dot"></i>Your buys</span><span data-k="avg"><i class="nx-hd-dash"></i>Your average cost</span><span data-k="none" class="nx-hd-nobuys">No buys in this period</span></div>` : ''}
        </section>
        ${facts.length ? `<section class="nx-hd-card"><h3>${isEtf ? 'About the fund' : 'Key figures'}</h3><div class="nx-hd-facts">${facts.map(([k, v]) => `<div><span>${k}</span><b>${escH(v)}</b></div>`).join('')}</div></section>` : ''}
        ${divHtml}
        ${info.description ? `<section class="nx-hd-card nx-hd-about"><h3>About</h3><p>${escH(info.description)}</p><button type="button" class="nx-me-link" data-act="more">Read more</button></section>` : ''}
      </div>`;
    nxHdChart();
  }

  async function nxHdChart() {
    const ticker = _nxHdTicker, range = _nxHdRange, cfg = _CMOD_RANGE_CFG[range];
    let hist = null;
    try { hist = await window.electronAPI.fetchHistory({ tickers: [ticker], ...cfg }); } catch (e) {}
    const cv = document.getElementById('nx-hd-chart'), msg = document.getElementById('nx-hd-chart-msg');
    if (ticker !== _nxHdTicker || range !== _nxHdRange || !cv) return;
    const s = hist?.[ticker];
    if (_nxHdChart) { _nxHdChart.destroy(); _nxHdChart = null; }
    if (!s?.timestamps?.length) { msg.style.display = 'flex'; msg.textContent = 'No price history available.'; return; }
    msg.style.display = 'none';
    const pts = s.timestamps.map((ts, i) => ({ ts, c: s.closes[i] })).filter(p => p.c != null);
    const lab = ts => { const d = new Date(ts * 1000);
      return range === '1D' ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : range === '1W' ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
        : range === '1Y' || range === '5Y' ? d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
    // Your buys on the dates you made them, and your average cost — in the chart's currency
    const port = ap(), h = (port.holdings || []).find(x => x.ticker === ticker) || {};
    const perEur = h.currentPrice && h.currentPriceNative ? h.currentPriceNative / h.currentPrice : 1;
    const buys = new Array(pts.length).fill(null), step = pts.length > 1 ? pts[1].ts - pts[0].ts : 86400;
    for (const t of (port.transactions || []).filter(t => t.ticker === ticker && /buy/i.test(t.type || 'buy'))) {
      const ts = new Date(t.date + 'T12:00:00').getTime() / 1000;
      if (ts < pts[0].ts - step || ts > pts[pts.length - 1].ts + step) continue;
      let k = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].ts - ts) < Math.abs(pts[k].ts - ts)) k = i;
      buys[k] = +(t.priceOriginal ?? t.price * perEur).toFixed(2);
    }
    const avgNative = h.shares > 0 && h.buyPrice ? +(h.buyPrice * perEur).toFixed(2) : null;
    const hasBuys = buys.some(v => v != null), keys = document.querySelector('#nx-hd .nx-hd-keys');
    if (keys) { keys.querySelector('[data-k="buys"]').style.display = hasBuys ? '' : 'none'; keys.querySelector('[data-k="none"]').style.display = hasBuys ? 'none' : ''; }
    const up = pts[pts.length - 1].c >= pts[0].c, col = cssv(up ? '--up' : '--down'), accent = cssv('--gold');
    _nxHdChart = new Chart(cv, {
      type: 'line',
      data: { labels: pts.map(p => lab(p.ts)), datasets: [
        { label: 'Price', data: pts.map(p => p.c), borderColor: col, backgroundColor: col, fill: true },
        ...(avgNative ? [{ label: 'Your average cost', data: pts.map(() => avgNative), borderColor: accent, borderDash: [6, 5], borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 0, fill: false, nxKeep: true }] : []),
        ...(buys.some(v => v != null) ? [{ label: 'You bought', data: buys, showLine: false, pointRadius: 6, pointHoverRadius: 8, pointBackgroundColor: cssv('--bg2'), pointBorderColor: accent, pointBorderWidth: 2.5, borderColor: accent, nxKeep: true }] : []),
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { filter: i => i.raw != null, callbacks: { label: c => ` ${c.dataset.label}  ${ccySym(s.currency)}${(+c.raw).toFixed(2)}` } } },
        scales: { x: { ticks: { color: cssv('--text3'), maxTicksLimit: 6, maxRotation: 0 } }, y: { position: 'right', ticks: { color: cssv('--text3'), maxTicksLimit: 5 }, grid: {} } } },
    });
  }

  // Shared with js/nexora/views.js (the redesigned Goals, Transactions, Dividends, Cash and allocation views)
  window.NX_UI = { MI, I, icon, tile, escH, flagIc, CCY, cssv, decorate, nxNeg };

  window.addEventListener('load', () => {
    installLoanLogic();
    window.secondToLastBusinessDay = (year, month) => nthLastBusinessDay(year, month, _bizN);
    if (MODERN) { _nxOrigOpen = window.openCompanyModal; window.openCompanyModal = nxOpenHolding; }
    window.openAiSettings = () => window.nxOpenMe('ai');
    if (MODERN) {
      window.renderNetWorth = (orig => function () { orig.apply(this, arguments); try { nxNetWorth(); } catch (e) { console.error(e); } })(window.renderNetWorth);
      // charts can only be drawn once their tab is visible
      window.showTab = (orig => function (name) { const out = orig.apply(this, arguments); if (name === 'networth') setTimeout(() => { try { nxNwChart(); } catch (e) { console.error(e); } }, 30); return out; })(window.showTab);
      window.computeRisk = computeRiskWithSeries;
      window.buildRiskView = (orig => async function () { await orig.apply(this, arguments); try { nxRiskExtras(); } catch (e) { console.error(e); } })(window.buildRiskView);
      if (typeof SUB_BUILDERS !== 'undefined' && SUB_BUILDERS.portfolio) SUB_BUILDERS.portfolio.risk = window.buildRiskView;
      // The app's lock screen gives way to the profile-aware one
      window.lockApp = (orig => function () {
        orig.apply(this, arguments);
        _dek = null;                       // locked = the data key is gone from memory
        if (!document.getElementById('nx-auth')?.classList.contains('open')) { authMsg = ''; nxAuthShow(currentAccount() ? 'locked' : 'login'); }
      })(window.lockApp);
      window.renderSalary = (orig => function () { orig.apply(this, arguments); try { nxSalary(); } catch (e) { console.error(e); } })(window.renderSalary);
      window.renderFire = (orig => function () { orig.apply(this, arguments); try { nxFire(); } catch (e) { console.error(e); } })(window.renderFire);
      window.buildSalaryCharts = function () { try { nxSalaryChart(); } catch (e) { console.error(e); } };
      // close the income form only when the app actually saved (it clears the field on success)
      window.logSalary = (orig => function () { orig.apply(this, arguments); if (!document.getElementById('e-sal-amount').value) incForm = null; nxIncomeCard(); })(window.logSalary);
      window.logExtra = (orig => function () { orig.apply(this, arguments); if (!document.getElementById('e-extra-desc').value) incForm = null; nxIncomeCard(); })(window.logExtra);
      const origBudget = window.renderBudget;
      window.renderBudget = function () { origBudget.apply(this, arguments); try { nxBudgetOverview(); nxIncomeCard(); } catch (e) { console.error(e); } };
      const origTabs = window.renderPortfolioTabs;
      window.renderPortfolioTabs = function () { origTabs.apply(this, arguments); syncCcyRow(); };
      const origOverview = window.renderOverview;
      window.renderOverview = function () { origOverview.apply(this, arguments); try { renderDashExtras(); renderSeasonNotes(); } catch (e) { console.error(e); } };
      restylePortfolioMenus();
      applyProfile();
      buildDash();
      window.addEventListener('resize', () => dashLayout());
    }
    swapPalettes();
    if (MODERN) degoldStyles();
    decorate();
    new MutationObserver(muts => { if (muts.some(m => m.addedNodes.length)) decorate(); })
      .observe(document.body, { childList: true, subtree: true });
    // Start: the profile list, and Marduk's data if it's still waiting to be upgraded
    (async () => {
      FRESH_STATE = JSON.stringify(state);          // a new profile starts from the app's empty state
      try { APP_VERSION = (await api?.getVersion()) || ''; } catch (e) {}
      await loadAccounts();
      try { _legacy = (await api?.legacyStatus()) || _legacy; } catch (e) {}
      nxAuthShow(_accountsUnreadable ? 'unreadable' : accounts().length ? (currentAccount() ? 'locked' : 'login') : _legacy.data ? 'upgrade' : 'welcome');
    })();
  });
})();
