import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fired server-side (via pg_net, from acknowledge_appraisal) the moment an
// employee acknowledges their performance appraisal. Emails both Fretz and
// the employee a summary plus the 1-on-1 discussion date he scheduled when
// he sent the review, so the conversation actually happens on that date.
// Styled to match the existing payslip email (send-payslip) so transactional
// emails read as one system.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') ?? 'suraltafretz@gmail.com';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'hr@fsarchitects.ph';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';

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
      .select('*, employee:hub_users!employee_id(full_name, email, department, employee_id), rater:hub_users!rater_id(full_name)')
      .eq('id', appraisal_id)
      .single();

    if (error || !appraisal) throw new Error(`Appraisal not found: ${error?.message}`);

    const employee = appraisal.employee as { full_name: string; email: string; department: string | null; employee_id: string | null } | null;
    const rater = appraisal.rater as { full_name: string } | null;

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
      <p style="color:#fff;font-size:22px;font-weight:800;margin:0 0 6px;letter-spacing:-0.3px;">Appraisal Acknowledged</p>
      <p style="color:#6b7280;font-size:12px;margin:0;line-height:1.6;">
        ${appraisal.month_appraised}<br>
        <span style="color:#9ca3af;">Period: ${appraisal.period_covered}</span>
      </p>
    </div>

    <div style="background:#eff6ff;padding:12px 36px;border-bottom:1px solid #bfdbfe;">
      <table style="border-collapse:collapse;"><tr>
        <td style="vertical-align:middle;padding-right:10px;"><span style="display:inline-block;width:8px;height:8px;background:#2563eb;border-radius:50%;"></span></td>
        <td style="vertical-align:middle;"><p style="margin:0;font-size:13px;color:#1e3a8a;font-weight:600;">${employee?.full_name ?? 'The employee'} has read their appraisal and submitted their comments.</p></td>
      </tr></table>
    </div>

    <div style="padding:28px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Employee</p>
      <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">${employee?.full_name ?? ''}${employee?.employee_id ? `<span style="font-size:12px;font-weight:500;color:#9ca3af;margin-left:10px;font-family:monospace;">${employee.employee_id}</span>` : ''}</p>
      <p style="font-size:13px;color:#6b7280;margin:0 0 2px;">${employee?.department || 'FS Architects'}</p>
      <p style="font-size:13px;color:#6b7280;margin:0;">Rated by ${rater?.full_name ?? 'the immediate head'}</p>
    </div>

    <div style="padding:24px 36px;background:#fafafa;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">Performance Summary</p>
      <table style="border-collapse:collapse;"><tr>
        <td style="vertical-align:top;padding-right:32px;">
          <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">Final Rating</p>
          <p style="font-size:22px;font-weight:800;color:#111827;margin:0;">${appraisal.final_rating_pct != null ? Number(appraisal.final_rating_pct).toFixed(1) : '—'}</p>
          <p style="font-size:11px;color:#9ca3af;margin:2px 0 0;">percent</p>
        </td>
        <td style="vertical-align:top;">
          <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">Performance Level</p>
          <p style="font-size:22px;font-weight:800;color:#111827;margin:0;">${appraisal.performance_level != null ? Number(appraisal.performance_level).toFixed(1) : '—'}</p>
          <p style="font-size:11px;color:#9ca3af;margin:2px 0 0;">out of 5</p>
        </td>
      </tr></table>
    </div>

    <div style="padding:28px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">Factor Scores</p>
      <table style="width:100%;border-collapse:collapse;">${factorRows}</table>
    </div>

    ${appraisal.employee_comments ? `
    <div style="padding:24px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;">Employee's Comments</p>
      <p style="font-size:13px;color:#374151;margin:0;line-height:1.6;">${appraisal.employee_comments}</p>
    </div>` : ''}

    <div style="padding:20px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 6px;line-height:1.6;">
        Review the full appraisal and complete the HR sign-off at <a href="${HUB_BASE_URL}/hub/admin/performance" style="color:#6b7280;">${HUB_BASE_URL}/hub/admin/performance</a>.
      </p>
      <p style="font-size:11px;color:#d1d5db;margin:0;">© ${new Date().getFullYear()} FS Architects · <a href="mailto:${FROM_EMAIL}" style="color:#d1d5db;text-decoration:none;">${FROM_EMAIL}</a></p>
    </div>

  </div>
</body>
</html>`;

    const recipients = [OWNER_EMAIL];
    if (employee?.email) recipients.push(employee.email);

    await sendEmail(recipients, `Appraisal acknowledged: ${employee?.full_name ?? 'Employee'} — ${appraisal.month_appraised}`, html);

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
