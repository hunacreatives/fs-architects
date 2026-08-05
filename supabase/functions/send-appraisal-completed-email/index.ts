import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fired server-side (via pg_net, from a DB trigger) the moment an appraisal's
// status flips to 'completed' — i.e. HR signs off. Emails the employee (and
// the owner, for the record) the final score, the full 8-factor breakdown,
// HR's comments, and the recommendation/decision if one was made.
// Styled to match the existing appraisal emails so transactional emails read
// as one system.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') ?? 'suraltafretz@gmail.com';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'hr@fsarchitects.ph';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const PERFORMANCE_URL = `${HUB_BASE_URL}/hub/employee/performance`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const FACTOR_LABELS: Record<string, string> = {
  job_knowledge: 'Job Knowledge',
  productivity: 'Productivity and Professional Output',
  quality_of_work: 'Quality of Work',
  interpersonal_relations: 'Interpersonal Relations',
  policy_compliance: 'Policy Compliance',
  leadership_ability: 'Leadership Ability',
  growth_development: 'Growth and Development',
  work_behavior_values: 'Work Behavior and Values',
};

const PERFORMANCE_LEVEL_BANDS = [
  { min: 5, label: 'Excellent Performance' },
  { min: 4, label: 'Above Average Performance' },
  { min: 3, label: 'Average/Acceptable Performance' },
  { min: 2, label: 'Below Average Performance' },
  { min: 0, label: 'Poor Performance' },
];

function bandLabel(pl: number | null): string {
  if (pl == null) return '—';
  return PERFORMANCE_LEVEL_BANDS.find(b => pl >= b.min)?.label ?? '—';
}

function factorScore(levels: (number | null)[] | undefined): number | null {
  const vals = (levels ?? []).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

async function sendEmail(to: string[], subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `FS Architects <${FROM_EMAIL}>`, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error: ${JSON.stringify(await res.json())}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { appraisal_id } = await req.json();
    if (!appraisal_id) {
      return new Response(JSON.stringify({ error: 'Missing appraisal_id' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: appraisal, error } = await supabase
      .from('hub_appraisals')
      .select('*, employee:hub_users!employee_id(full_name, email, department, employee_id), rater:hub_users!rater_id(full_name), hr_reviewer:hub_users!hr_reviewer_id(full_name)')
      .eq('id', appraisal_id)
      .single();

    if (error || !appraisal) throw new Error(`Appraisal not found: ${error?.message}`);

    const employee = appraisal.employee as { full_name: string; email: string; department: string | null; employee_id: string | null } | null;
    const rater = appraisal.rater as { full_name: string } | null;
    const hrReviewer = appraisal.hr_reviewer as { full_name: string } | null;

    const pl = appraisal.performance_level != null ? Number(appraisal.performance_level) : null;

    const factorRows = Object.entries(FACTOR_LABELS).map(([key, label]) => {
      const score = factorScore(appraisal.ratings?.[key]?.levels);
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
          <p style="margin:0;font-size:13px;color:#374151;">${label}</p>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;font-weight:600;color:${score != null && score < 3 ? '#ef4444' : '#111827'};">
          ${score != null ? score.toFixed(2) + ' / 5' : '—'}
        </td>
      </tr>`;
    }).join('');

    const decisionLabel = appraisal.decision === 'regularization' ? 'For Regularization'
      : appraisal.decision === 'end_of_contract' ? 'For End of Contract' : null;
    const belowSatLabel = appraisal.below_satisfactory_action === 'monitoring' ? 'Subject for Monitoring'
      : appraisal.below_satisfactory_action === 'pip' ? 'Performance Improvement Plan' : null;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
  <style>
    .logo-dark { display: none; }
    @media (prefers-color-scheme: dark) { .logo-light { display: none !important; } .logo-dark { display: block !important; } }
    [data-ogsc] .logo-light { display: none !important; }
    [data-ogsc] .logo-dark { display: block !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <div style="background:#111827;padding:28px 32px;">
      <img class="logo-light" src="https://fsarchitects.ph/images/fs-architects-logo-white.png" alt="FS Architects" height="48" style="display:block;margin-bottom:16px;" />
      <img class="logo-dark" src="https://fsarchitects.ph/images/fs-architects-logo-horizontal.png" alt="FS Architects" height="48" style="display:none;margin-bottom:16px;" />
      <p style="color:#fff;font-size:22px;font-weight:800;margin:0 0 6px;letter-spacing:-0.3px;">Appraisal Completed</p>
      <p style="color:#6b7280;font-size:12px;margin:0;line-height:1.6;">
        ${appraisal.month_appraised}<br>
        <span style="color:#9ca3af;">Period: ${appraisal.period_covered}</span>
      </p>
    </div>

    <div style="background:#ecfdf5;padding:12px 36px;border-bottom:1px solid #a7f3d0;">
      <table style="border-collapse:collapse;"><tr>
        <td style="vertical-align:middle;padding-right:10px;"><span style="display:inline-block;width:8px;height:8px;background:#059669;border-radius:50%;"></span></td>
        <td style="vertical-align:middle;"><p style="margin:0;font-size:13px;color:#065f46;font-weight:600;">This performance appraisal has been reviewed by HR and is now final.</p></td>
      </tr></table>
    </div>

    <div style="padding:28px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Employee</p>
      <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">${employee?.full_name ?? ''}${employee?.employee_id ? `<span style="font-size:12px;font-weight:500;color:#9ca3af;margin-left:10px;font-family:monospace;">${employee.employee_id}</span>` : ''}</p>
      <p style="font-size:13px;color:#6b7280;margin:0 0 2px;">${employee?.department || 'FS Architects'}</p>
      <p style="font-size:13px;color:#6b7280;margin:0;">Rated by ${rater?.full_name ?? 'immediate head'} · Reviewed by ${hrReviewer?.full_name ?? 'HR'}</p>
    </div>

    <div style="padding:24px 36px;background:#fafafa;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">Final Result</p>
      <table style="border-collapse:collapse;"><tr>
        <td style="vertical-align:top;padding-right:32px;">
          <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">Final Rating</p>
          <p style="font-size:22px;font-weight:800;color:#111827;margin:0;">${appraisal.final_rating_pct != null ? Number(appraisal.final_rating_pct).toFixed(1) + '%' : '—'}</p>
        </td>
        <td style="vertical-align:top;padding-right:32px;">
          <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">Performance Level</p>
          <p style="font-size:22px;font-weight:800;color:#111827;margin:0;">${pl != null ? pl.toFixed(1) : '—'} <span style="font-size:12px;color:#9ca3af;font-weight:500;">/ 5</span></p>
        </td>
        <td style="vertical-align:top;">
          <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">Total Score</p>
          <p style="font-size:22px;font-weight:800;color:#111827;margin:0;">${appraisal.total_score != null ? Number(appraisal.total_score).toFixed(2) : '—'} <span style="font-size:12px;color:#9ca3af;font-weight:500;">/ 40</span></p>
        </td>
      </tr></table>
      <p style="font-size:13px;color:#374151;font-weight:600;margin:14px 0 0;">${bandLabel(pl)}</p>
    </div>

    <div style="padding:28px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">Factor Breakdown</p>
      <table style="width:100%;border-collapse:collapse;">${factorRows}</table>
    </div>

    ${(decisionLabel || belowSatLabel) ? `
    <div style="padding:20px 36px;border-bottom:1px solid #f3f4f6;">
      ${decisionLabel ? `<p style="font-size:13px;color:#111827;font-weight:600;margin:0 0 6px;">${decisionLabel}</p>` : ''}
      ${belowSatLabel ? `<p style="font-size:13px;color:#b91c1c;font-weight:600;margin:0;">${belowSatLabel}</p>` : ''}
    </div>` : ''}

    ${appraisal.comments_recommendations ? `
    <div style="padding:24px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;">Comments and Recommendations</p>
      <p style="font-size:13px;color:#374151;margin:0;line-height:1.6;">${appraisal.comments_recommendations}</p>
    </div>` : ''}

    ${appraisal.hr_comments ? `
    <div style="padding:24px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;">HR Comments</p>
      <p style="font-size:13px;color:#374151;margin:0;line-height:1.6;">${appraisal.hr_comments}</p>
    </div>` : ''}

    <div style="padding:32px 36px;text-align:center;">
      <a href="${PERFORMANCE_URL}" style="background:#111827;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">View Full Appraisal</a>
      <p style="font-size:11px;color:#9ca3af;margin:16px 0 0;">If the button doesn't work, copy this link: ${PERFORMANCE_URL}</p>
    </div>

    <div style="padding:20px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 6px;line-height:1.6;">
        This appraisal is now part of the official performance record. If you have questions, reach out to HR directly on Slack.
      </p>
      <p style="font-size:11px;color:#d1d5db;margin:0;">© ${new Date().getFullYear()} FS Architects · <a href="mailto:${FROM_EMAIL}" style="color:#d1d5db;text-decoration:none;">${FROM_EMAIL}</a></p>
    </div>

  </div>
</body>
</html>`;

    const recipients = [OWNER_EMAIL];
    if (employee?.email) recipients.push(employee.email);

    await sendEmail(recipients, `Performance Appraisal Completed — ${employee?.full_name ?? 'Employee'} · ${appraisal.month_appraised}`, html);

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
