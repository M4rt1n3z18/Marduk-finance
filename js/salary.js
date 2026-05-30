// ══════════════ SALARY ══════════════

async function importPayslip() {
  if (!window.electronAPI?.parsePayslip) { alert('PDF import requires the desktop app.'); return; }
  try {
    const raw = await window.electronAPI.parsePayslip();
    const confirmed = await showPayslipModal(raw);
    if (confirmed) await processParsedPayslip(confirmed);
  } catch (err) {
    alert('Could not read payslip:\n' + (err?.message || err));
  }
}

// Show the payslip confirmation modal pre-filled with parsed data.
// Returns the (possibly edited) data object, or null if cancelled.
function showPayslipModal(data) {
  return new Promise(resolve => {
    const modal = document.getElementById('payslip-modal');
    const MONTH_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    // Parse period
    const [pYear, pMonth] = (data?.period || '').split('-').map(Number);
    const monthNum = pMonth || (new Date().getMonth() + 1);
    const year     = pYear  || new Date().getFullYear();

    // Pre-fill fields
    document.getElementById('ps-month').value    = monthNum;
    document.getElementById('ps-year').value     = year;
    document.getElementById('ps-gross').value    = data?.grossSalary    || '';
    document.getElementById('ps-net').value      = data?.netSalary      || '';
    document.getElementById('ps-base').value     = data?.baseSalary     || '';
    document.getElementById('ps-meal').value     = data?.mealAllowance  || '';
    document.getElementById('ps-tax').value      = data?.irsDeduction   || '';
    document.getElementById('ps-ss').value       = data?.ssDeduction    || '';
    document.getElementById('ps-holiday').value  = data?.holidaySubsidy || '';
    document.getElementById('ps-xmas').value     = data?.christmasSubsidy || '';
    document.getElementById('ps-employer').value = data?.employer       || '';
    document.getElementById('ps-function').value = data?.functionTitle  || '';

    const num = id => parseFloat(document.getElementById(id).value) || 0;

    const cleanup = () => { modal.style.display = 'none'; };

    document.getElementById('ps-cancel-btn').onclick = () => { cleanup(); resolve(null); };
    document.getElementById('ps-confirm-btn').onclick = () => {
      const m  = parseInt(document.getElementById('ps-month').value);
      const y  = parseInt(document.getElementById('ps-year').value);
      const period      = `${y}-${String(m).padStart(2,'0')}`;
      const periodLabel = `${MONTH_EN[m-1]} ${y}`;
      cleanup();
      resolve({
        ...data,
        period, periodLabel,
        grossSalary:      num('ps-gross'),
        netSalary:        num('ps-net'),
        baseSalary:       num('ps-base') || null,
        mealAllowance:    num('ps-meal'),
        irsDeduction:     num('ps-tax'),
        ssDeduction:      num('ps-ss'),
        holidaySubsidy:   num('ps-holiday'),
        christmasSubsidy: num('ps-xmas'),
        employer:         document.getElementById('ps-employer').value.trim() || null,
        functionTitle:    document.getElementById('ps-function').value.trim() || null,
      });
    };

    modal.style.display = 'flex';
  });
}

async function processParsedPayslip(data) {
  if (!data) return;
  if (!data.period || data.period.includes('NaN')) {
    alert('Could not determine the payslip period. Please check the Month and Year fields.');
    return;
  }
  if (!state.payslips) state.payslips = [];
  const existing = state.payslips.find(p => p.period === data.period);
  if (existing) {
    if (!confirm(`A payslip for ${data.periodLabel} already exists. Replace it?`)) return;
    state.payslips = state.payslips.filter(p => p.period !== data.period);
  }
  data.id = uid();
  state.payslips.push(data);
  state.payslips.sort((a, b) => a.period.localeCompare(b.period));
  const budgetInfo = autoLogPayslipSalary(data);
  if (budgetInfo) {
    selectedBudgetMonth = budgetInfo.key;
    showToast(`✓ ${data.periodLabel} payslip imported · Budget salary for ${budgetInfo.label} set to ${eur(data.netSalary)}`);
  }
  save();
  renderSalary();
  buildSalaryCharts();
  renderBudget();
  renderExpenses();
}

// Mirrors logSalary() logic: salary paid end of period month → income for NEXT month's budget.
// Returns { key, label } of the budget month that was updated.
function autoLogPayslipSalary(payslip) {
  if (!payslip.netSalary) return null;
  const [pYear, pMonth] = payslip.period.split('-').map(Number);
  // pMonth is 1-based; new Date(pYear, pMonth, 1) = 1st of next month (JS months 0-based)
  const nextMonthDate  = new Date(pYear, pMonth, 1);
  const budgetMonthKey = getExpenseMonthKey(nextMonthDate.getFullYear(), nextMonthDate.getMonth());
  const budgetLabel    = nextMonthDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  // Estimated received date = last day of the period month
  const lastDay        = new Date(pYear, pMonth, 0).toISOString().slice(0, 10);
  if (!state.salaries) state.salaries = [];
  const idx   = state.salaries.findIndex(s => s.month === budgetMonthKey);
  const entry = { month: budgetMonthKey, amount: payslip.netSalary, date: lastDay, receivedDate: lastDay };
  if (idx >= 0) state.salaries[idx] = entry;
  else          state.salaries.push(entry);
  return { key: budgetMonthKey, label: budgetLabel };
}

function initSalaryDropZone() {
  const zone = document.getElementById('salary-drop-zone');
  if (!zone) return;

  const hasFiles = dt => dt && dt.types && [...dt.types].some(t => t.toLowerCase() === 'files');

  // ── Global: stop Electron/Chrome from navigating to the dropped file URL ──
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop',     e => e.preventDefault());

  // ── Tab-level: visual feedback + actual processing ──────────────────────
  const tab = document.getElementById('tab-salary');
  let dragCounter = 0;

  tab.addEventListener('dragenter', e => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault(); dragCounter++;
    zone.classList.add('drag-over');
  });
  tab.addEventListener('dragleave', e => {
    // Only clear when truly leaving the tab (not just moving between children)
    if (!tab.contains(e.relatedTarget)) { dragCounter = 0; zone.classList.remove('drag-over'); }
  });
  tab.addEventListener('dragover', e => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  });
  tab.addEventListener('drop', async e => {
    e.preventDefault(); dragCounter = 0; zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) { alert('Please drop a PDF file.'); return; }
    const filePath = file.path;   // Electron adds .path to File objects
    if (!filePath) { alert('Could not read file path. Please use the Import button instead.'); return; }
    try {
      const raw = await window.electronAPI?.parsePayslipFromPath(filePath);
      const confirmed = await showPayslipModal(raw);
      if (confirmed) await processParsedPayslip(confirmed);
    } catch (err) {
      alert('Could not read payslip:\n' + (err?.message || err));
    }
  });
}

function delPayslip(id) {
  if (!confirm('Remove this payslip?')) return;
  state.payslips = (state.payslips || []).filter(p => p.id !== id);
  save(); renderSalary(); buildSalaryCharts();
}

function renderSalary() {
  const payslips = [...(state.payslips || [])].sort((a, b) => a.period.localeCompare(b.period));
  const latest   = payslips[payslips.length - 1];
  const prev     = payslips[payslips.length - 2];

  const sameLastYear = latest ? payslips.find(p => {
    const [ly, lm] = latest.period.split('-').map(Number);
    const [py, pm] = p.period.split('-').map(Number);
    return py === ly - 1 && pm === lm;
  }) : null;

  const summaryEl  = document.getElementById('salary-summary');
  const chartsRow  = document.getElementById('salary-charts-row');
  const taxCard    = document.getElementById('salary-tax-card');

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!latest) {
    summaryEl.innerHTML = `
      <div class="card" style="text-align:center;padding:52px 24px;margin-bottom:20px;">
        <div style="font-size:42px;margin-bottom:16px;opacity:.5;">📄</div>
        <div class="card-title" style="font-size:13px;margin-bottom:8px;">No payslips yet</div>
        <div style="color:var(--text2);font-size:13px;max-width:380px;margin:0 auto;">
          Click <strong style="color:var(--text);">↑ Import Payslip</strong> above to upload a PDF payslip
          and start tracking your salary evolution over time.
        </div>
      </div>`;
    chartsRow.style.display = 'none';
    taxCard.style.display   = 'none';
    document.getElementById('salary-list').innerHTML = '<div class="empty">No payslips imported yet.</div>';
    return;
  }

  chartsRow.style.display = '';
  taxCard.style.display   = '';

  // ── Derived values ──────────────────────────────────────────────────────
  const netDelta       = prev ? latest.netSalary - prev.netSalary : null;
  const netDeltaPct    = prev && prev.netSalary ? netDelta / prev.netSalary * 100 : null;
  const netDeltaYoy    = sameLastYear ? latest.netSalary - sameLastYear.netSalary : null;
  const netDeltaYoyPct = sameLastYear && sameLastYear.netSalary ? netDeltaYoy / sameLastYear.netSalary * 100 : null;
  const taxRate        = latest.grossSalary ? (latest.ssDeduction + latest.irsDeduction) / latest.grossSalary * 100 : 0;

  const currentYear  = latest.period.split('-')[0];
  const ytdPayslips  = payslips.filter(p => p.period.startsWith(currentYear));
  const ytdNet       = ytdPayslips.reduce((s, p) => s + (p.netSalary  || 0), 0);
  const ytdGross     = ytdPayslips.reduce((s, p) => s + (p.grossSalary|| 0), 0);
  const ytdSS        = ytdPayslips.reduce((s, p) => s + (p.ssDeduction|| 0), 0);
  const ytdIRS       = ytdPayslips.reduce((s, p) => s + (p.irsDeduction||0), 0);

  // ── Delta card helper ────────────────────────────────────────────────────
  const deltaCard = (label, val, pctVal) => {
    const isPos = val >= 0;
    const arrow = isPos ? '▲' : '▼';
    const col   = isPos ? 'var(--up)' : 'var(--down)';
    return `<div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-val" style="font-size:20px;color:${col};">${(isPos?'+':'')}${eur(val)}</div>
      <div class="stat-sub ${isPos?'up':'down'}">${arrow} ${Math.abs(pctVal).toFixed(1)}%</div>
    </div>`;
  };
  const naCard = (label, note) => `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-val" style="font-size:20px;color:var(--text3);">—</div>
    <div class="stat-sub">${note}</div>
  </div>`;

  // ── Perks strip ──────────────────────────────────────────────────────────
  const perks = [];
  if (latest.mealAllowance   > 0) perks.push(`<span class="badge etf">Meal Card</span>&nbsp;<strong>${eur(latest.mealAllowance)}/mo</strong>`);
  if (latest.hoursExemption  > 0) perks.push(`<span class="badge crypto">Hours Exemption</span>&nbsp;<strong>${eur(latest.hoursExemption)}</strong>`);
  if (latest.holidaySubsidy  > 0) perks.push(`<span class="badge stock">Holiday Sub ⅟₁₂</span>&nbsp;<strong>${eur(latest.holidaySubsidy)}</strong>`);
  if (latest.christmasSubsidy> 0) perks.push(`<span class="badge stock">Xmas Sub ⅟₁₂</span>&nbsp;<strong>${eur(latest.christmasSubsidy)}</strong>`);
  const perksHtml = perks.length ? `
    <div class="card" style="margin-bottom:16px;display:flex;gap:20px;flex-wrap:wrap;align-items:center;padding:12px 20px;">
      <div style="font-size:10px;letter-spacing:2px;color:var(--text2);font-family:'Cinzel',serif;text-transform:uppercase;margin-right:4px;">Perks</div>
      ${perks.map(p => `<div style="display:flex;align-items:center;gap:6px;">${p}</div>`).join('')}
    </div>` : '';

  // ── Summary HTML ─────────────────────────────────────────────────────────
  summaryEl.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(6,1fr);margin-bottom:16px;">
      <div class="stat-card">
        <div class="stat-label">Gross · ${latest.periodLabel}</div>
        <div class="stat-val">${eur(latest.grossSalary)}</div>
        <div class="stat-sub">${latest.employer ? latest.employer.split(' ').slice(0,3).join(' ') : (latest.functionTitle||'')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Net Take-Home</div>
        <div class="stat-val">${eur(latest.netSalary)}</div>
        <div class="stat-sub">after taxes &amp; SS</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Base Salary</div>
        <div class="stat-val">${eur(latest.baseSalary || latest.grossSalary)}</div>
        <div class="stat-sub">${latest.functionTitle || 'contract base'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">SS Contribution</div>
        <div class="stat-val" style="color:var(--down);">${eur(latest.ssDeduction)}</div>
        <div class="stat-sub">${latest.grossSalary ? (latest.ssDeduction/latest.grossSalary*100).toFixed(1) : '0'}% of gross</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">IRS Retained</div>
        <div class="stat-val" style="color:var(--down);">${eur(latest.irsDeduction)}</div>
        <div class="stat-sub">${latest.grossSalary ? (latest.irsDeduction/latest.grossSalary*100).toFixed(1) : '0'}% of gross</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Effective Tax Rate</div>
        <div class="stat-val">${taxRate.toFixed(1)}%</div>
        <div class="stat-sub">IRS + SS combined</div>
      </div>
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
      ${netDelta !== null ? deltaCard('Net vs Last Month', netDelta, netDeltaPct) : naCard('Net vs Last Month', 'first payslip')}
      ${netDeltaYoy !== null ? deltaCard('Net vs Same Month LY', netDeltaYoy, netDeltaYoyPct) : naCard('Net vs Same Month LY', 'no data yet')}
      <div class="stat-card">
        <div class="stat-label">YTD Net (${currentYear})</div>
        <div class="stat-val" style="font-size:20px;">${eur(ytdNet)}</div>
        <div class="stat-sub">gross ${eur(ytdGross)} · ${ytdPayslips.length} payslip${ytdPayslips.length!==1?'s':''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">YTD Taxes (${currentYear})</div>
        <div class="stat-val" style="font-size:20px;color:var(--down);">${eur(ytdSS + ytdIRS)}</div>
        <div class="stat-sub">SS ${eur(ytdSS)} · IRS ${eur(ytdIRS)}</div>
      </div>
    </div>

    ${perksHtml}
  `;

  // ── Payslips history table ────────────────────────────────────────────────
  document.getElementById('salary-list').innerHTML = payslips.length === 0
    ? '<div class="empty">No payslips imported yet.</div>'
    : `<table class="data-table">
        <thead><tr>
          <th>Period</th><th>Gross</th><th>Net</th><th>Base</th>
          <th>SS</th><th>IRS</th><th>Tax Rate</th><th>Meal Card</th><th></th>
        </tr></thead>
        <tbody>
          ${[...payslips].reverse().map(p => {
            const tr = p.grossSalary ? (p.ssDeduction + p.irsDeduction) / p.grossSalary * 100 : 0;
            return `<tr>
              <td><strong>${p.periodLabel}</strong>${p.department ? `<br><span class="muted" style="font-size:11px;">${p.department}</span>` : ''}</td>
              <td>${eur(p.grossSalary)}</td>
              <td><strong>${eur(p.netSalary)}</strong></td>
              <td>${eur(p.baseSalary || 0)}</td>
              <td class="down-text">${eur(p.ssDeduction)}</td>
              <td class="down-text">${eur(p.irsDeduction)}</td>
              <td>${tr.toFixed(1)}%</td>
              <td>${eur(p.mealAllowance || 0)}</td>
              <td><button class="del-btn" onclick="delPayslip('${p.id}')">✕</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
}

function buildSalaryCharts() {
  const payslips = [...(state.payslips || [])].sort((a, b) => a.period.localeCompare(b.period));
  if (!payslips.length) return;

  const labels = payslips.map(p => p.periodLabel);
  const GOLD   = '#c9a84c';
  const GREEN  = '#4caf82';
  const RED    = '#e05c5c';
  const AMBER  = '#e8a838';
  const BLUE   = '#4c8aaf';
  const ORANGE = '#e05c20';
  const LIME   = '#5fa84f';

  // ── Chart 1: Gross vs Net Evolution ──────────────────────────────────────
  destroyChart('salary-evo');
  const evoEl = document.getElementById('chart-salary-evo');
  if (evoEl && evoEl.offsetParent) {
    charts['salary-evo'] = new Chart(evoEl.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Gross',
            data: payslips.map(p => p.grossSalary),
            borderColor: GOLD, backgroundColor: GOLD + '25',
            fill: true, tension: 0.3, pointRadius: 5, pointBackgroundColor: GOLD, borderWidth: 2
          },
          {
            label: 'Net',
            data: payslips.map(p => p.netSalary),
            borderColor: GREEN, backgroundColor: GREEN + '25',
            fill: true, tension: 0.3, pointRadius: 5, pointBackgroundColor: GREEN, borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8 } },
        plugins: {
          legend: { labels: { color: textColor(), font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + eur(ctx.parsed.y) } }
        },
        scales: {
          x: { ticks: { color: textColor(), font: { size: 10 }, maxRotation: 30 }, grid: { color: gridColor() } },
          y: { ticks: { color: textColor(), font: { size: 11 }, callback: v => eur(v, 0) }, grid: { color: gridColor() }, beginAtZero: false }
        }
      }
    });
  }

  // ── Chart 2: Monthly stacked breakdown + net line ─────────────────────────
  destroyChart('salary-bkd');
  const bkdEl = document.getElementById('chart-salary-bkd');
  if (bkdEl && bkdEl.offsetParent) {
    charts['salary-bkd'] = new Chart(bkdEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Base Comp',    type: 'bar',  data: payslips.map(p => p.baseComp        || 0), backgroundColor: GOLD   + 'cc', stack: 'earn' },
          { label: 'Hr Exemption', type: 'bar',  data: payslips.map(p => p.hoursExemption  || 0), backgroundColor: LIME   + 'cc', stack: 'earn' },
          { label: 'Holiday ⅟₁₂',  type: 'bar',  data: payslips.map(p => p.holidaySubsidy  || 0), backgroundColor: AMBER  + 'cc', stack: 'earn' },
          { label: 'Xmas ⅟₁₂',     type: 'bar',  data: payslips.map(p => p.christmasSubsidy|| 0), backgroundColor: ORANGE + 'cc', stack: 'earn' },
          { label: 'Meal Card',    type: 'bar',  data: payslips.map(p => p.mealAllowance   || 0), backgroundColor: BLUE   + 'cc', stack: 'earn' },
          {
            label: 'Net',
            type: 'line',
            data: payslips.map(p => p.netSalary),
            borderColor: GREEN, backgroundColor: 'transparent',
            pointRadius: 5, pointBackgroundColor: GREEN, tension: 0.3, borderWidth: 2, order: 0
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8 } },
        plugins: {
          legend: { labels: { color: textColor(), font: { size: 10 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + eur(ctx.parsed.y) } }
        },
        scales: {
          x: { stacked: true, ticks: { color: textColor(), font: { size: 10 }, maxRotation: 30 }, grid: { color: gridColor() } },
          y: { stacked: true, ticks: { color: textColor(), font: { size: 11 }, callback: v => eur(v, 0) }, grid: { color: gridColor() } }
        }
      }
    });
  }

  // ── Chart 3: Tax burden % over time ──────────────────────────────────────
  destroyChart('salary-tax');
  const taxEl = document.getElementById('chart-salary-tax');
  if (taxEl && taxEl.offsetParent) {
    charts['salary-tax'] = new Chart(taxEl.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'SS %',
            data: payslips.map(p => p.grossSalary ? +(p.ssDeduction / p.grossSalary * 100).toFixed(2) : 0),
            borderColor: AMBER, tension: 0.3, pointRadius: 4, pointBackgroundColor: AMBER, borderWidth: 2, fill: false
          },
          {
            label: 'IRS %',
            data: payslips.map(p => p.grossSalary ? +(p.irsDeduction / p.grossSalary * 100).toFixed(2) : 0),
            borderColor: RED, tension: 0.3, pointRadius: 4, pointBackgroundColor: RED, borderWidth: 2, fill: false
          },
          {
            label: 'Total %',
            data: payslips.map(p => p.grossSalary ? +((p.ssDeduction + p.irsDeduction) / p.grossSalary * 100).toFixed(2) : 0),
            borderColor: textColor(), tension: 0.3, pointRadius: 4, borderDash: [5, 3], borderWidth: 2, fill: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: textColor(), font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + '%' } }
        },
        scales: {
          x: { ticks: { color: textColor(), font: { size: 10 }, maxRotation: 30 }, grid: { color: gridColor() } },
          y: {
            ticks: { color: textColor(), font: { size: 11 }, callback: v => v + '%' },
            grid: { color: gridColor() },
            beginAtZero: true, suggestedMax: 25
          }
        }
      }
    });
  }
}

