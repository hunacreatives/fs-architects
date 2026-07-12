// Printable rendering of an appraisal, laid out to match the official
// "FS ARCHITECTS APPRAISAL FORM_rev1" paper document so a hard copy can be
// signed and filed. Opens a new window and triggers the print dialog.

import { Appraisal, APPRAISAL_FACTORS, PERFORMANCE_LEVEL_BANDS, factorScore, computeScores } from './appraisalForm';

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const box = (checked: boolean) => `(&nbsp;${checked ? '✓' : '&nbsp;&nbsp;'}&nbsp;)`;

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long' , day: 'numeric', year: 'numeric' }) : '';

export function printAppraisal(a: Appraisal) {
  const { totalScore, finalPct, performanceLevel, band } = computeScores(a.ratings);

  const factorsRows = APPRAISAL_FACTORS.map(f => {
    const r = a.ratings[f.key];
    const score = factorScore(r);
    const criteriaRows = f.criteria.map((c, i) => `
      <tr>
        <td class="crit">${esc(c)}</td>
        <td class="lvl">${r?.levels?.[i] ?? ''}</td>
        ${i === 0 ? `<td class="remarks" rowspan="${f.criteria.length}">${esc(r?.remarks)}</td>` : ''}
      </tr>`).join('');
    return `
      <tr class="factor-head">
        <td>${esc(f.label)}</td>
        <td class="lvl">${score != null ? score.toFixed(2).replace(/\.?0+$/, '') : ''}</td>
        <td></td>
      </tr>
      ${criteriaRows}`;
  }).join('');

  const rubricRows = PERFORMANCE_LEVEL_BANDS.map(b => `
    <tr>
      <td class="lvl-num">${b.level}</td>
      <td><strong>${esc(b.label)}<br/>${esc(b.range)}</strong><br/><br/>${esc(b.description)}</td>
    </tr>`).join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>FS Architects Appraisal — ${esc(a.employee?.full_name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; margin: 32px; }
  h1 { font-size: 13px; text-align: center; margin: 0 0 16px; }
  h2 { font-size: 11px; margin: 18px 0 6px; text-transform: uppercase; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #000; padding: 5px 7px; vertical-align: top; text-align: left; }
  .hdr td { width: 50%; }
  .hdr .label { font-weight: bold; }
  .lvl-num { width: 60px; text-align: center; font-weight: bold; font-size: 14px; vertical-align: middle; }
  .factor-head td { font-weight: bold; background: #f2f2f2; }
  .crit { padding-left: 14px; }
  .lvl { width: 55px; text-align: center; vertical-align: middle; }
  .remarks { width: 30%; }
  .noborder td { border: none; padding: 3px 0; }
  .score-line { margin: 16px 0; font-weight: bold; }
  .score-box { display: inline-block; border: 1px solid #000; min-width: 90px; padding: 6px 10px; text-align: center; }
  .pl-circle { display: inline-block; border: 2px solid #000; border-radius: 50%; min-width: 46px; padding: 10px 8px; text-align: center; margin-left: 24px; font-weight: bold; }
  .lines { border-bottom: 1px solid #000; min-height: 16px; margin-bottom: 6px; white-space: pre-wrap; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 28px; }
  .sig { width: 45%; }
  .sig .line { border-top: 1px solid #000; margin-top: 34px; padding-top: 3px; text-align: center; }
  .sig .name { text-align: center; font-weight: bold; margin-top: 6px; }
  .checks p { margin: 6px 0; }
  .page-break { page-break-before: always; }
  @media print { body { margin: 12mm; } }
</style></head>
<body>
  <h1>FS ARCHITECTS APPRAISAL FORM</h1>

  <table class="hdr">
    <tr><td><span class="label">NAME OF EMPLOYEE:</span> ${esc(a.employee?.full_name)}</td>
        <td><span class="label">PERIOD COVERED:</span> ${esc(a.period_covered)}</td></tr>
    <tr><td><span class="label">JOB TITLE:</span> ${esc(a.job_title)}</td>
        <td><span class="label">MONTH APPRAISED:</span> ${esc(a.month_appraised)}</td></tr>
  </table>

  <h2>Instruction</h2>
  <p>This performance evaluation is intended to assess the employee's overall performance, highlighting key strengths
  and areas for development. Consider how effectively the employee managed and delivered each project assigned
  when assigning the appropriate rating.</p>

  <h2>Performance Levels</h2>
  <table>${rubricRows}</table>

  <div class="page-break"></div>
  <h2>Performance Factors</h2>
  <table>
    <tr><th>PERFORMANCE FACTORS</th><th class="lvl">LEVEL</th><th class="remarks">REMARKS</th></tr>
    ${factorsRows}
  </table>

  <p class="score-line">
    Total Score: ${totalScore != null ? totalScore.toFixed(2) : '________'} &nbsp;×&nbsp; 2.5 &nbsp;=&nbsp;
    <span class="score-box">${finalPct != null ? finalPct.toFixed(1) + '%' : ''}</span>
    <span style="margin-left:8px">Final Rating %</span>
    <span class="pl-circle">${performanceLevel != null ? performanceLevel.toFixed(1) : ''}</span>
    <span style="margin-left:8px">PL${band ? ' — ' + esc(band.label) : ''}</span>
  </p>

  <h2>Comments and Recommendations</h2>
  <div class="lines">${esc(a.comments_recommendations)}</div>

  <div class="checks">
    <p>${box(a.decision === 'regularization')} <strong>For Regularization</strong>
       &nbsp;&nbsp;&nbsp;&nbsp; ${box(a.decision === 'end_of_contract')} <strong>For End of Contract</strong></p>
  </div>

  <p>I hereby testify that my Performance Evaluation was discussed thoroughly by my immediate head and I have read the
  comments and ratings.</p>

  <h2>Employee's Comments / Concerns</h2>
  <div class="lines">${esc(a.employee_comments)}</div>
  ${a.employee_acknowledged_at ? `<p>Acknowledged in Sentro Hub on ${fmtDate(a.employee_acknowledged_at)}.</p>` : ''}

  <div class="sig-row">
    <div class="sig">
      <p><strong>RATER:</strong></p>
      <div class="name">${esc(a.rater?.full_name)}</div>
      <div class="line">Immediate Head / Date</div>
    </div>
    <div class="sig">
      <p><strong>RATEE:</strong></p>
      <div class="name">${esc(a.employee?.full_name)}</div>
      <div class="line">Employee / Date</div>
    </div>
  </div>

  <div class="checks" style="margin-top:24px">
    <p><em><strong>Performance Factors with below satisfactory — kindly indicate a checkmark for a chosen action.</strong></em></p>
    <p>${box(a.below_satisfactory_action === 'monitoring')} The employee will be subject for monitoring.</p>
    <p>${box(a.below_satisfactory_action === 'pip')} The employee will be subject to a Performance Improvement Plan.</p>
  </div>

  <div class="sig-row">
    <div class="sig">
      <p><strong>REVIEWED BY:</strong></p>
      <div class="name">${esc(a.hr_reviewer?.full_name)}</div>
      <div class="line">HR Admin / Date${a.hr_reviewed_at ? ' — ' + fmtDate(a.hr_reviewed_at) : ''}</div>
    </div>
  </div>

  <h2>Reviewer's Comments</h2>
  <div class="lines">${esc(a.hr_comments)}</div>

  <script>window.onload = () => window.print();</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
