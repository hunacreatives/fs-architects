import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fired server-side by a database trigger the moment an appraisal's status
// flips to 'awaiting_employee' — i.e. the instant Fretz sends it. Emails the
// employee so they don't have to notice the in-app notification to find out.
// Styled to match the existing payslip email (send-payslip) so transactional
// emails read as one system.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'hr@fsarchitects.ph';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const PERFORMANCE_URL = `${HUB_BASE_URL}/hub/employee/performance`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
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
    if (!employee?.email) throw new Error('Employee has no email on file');

    const oneOnOne = fmtDateTime(appraisal.one_on_one_at);

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
      <p style="color:#fff;font-size:22px;font-weight:800;margin:0 0 6px;letter-spacing:-0.3px;">Performance Appraisal</p>
      <p style="color:#6b7280;font-size:12px;margin:0;line-height:1.6;">
        ${appraisal.month_appraised}<br>
        <span style="color:#9ca3af;">Period: ${appraisal.period_covered}</span>
      </p>
    </div>

    <div style="background:#eff6ff;padding:12px 36px;border-bottom:1px solid #bfdbfe;">
      <table style="border-collapse:collapse;"><tr>
        <td style="vertical-align:middle;padding-right:10px;"><span style="display:inline-block;width:8px;height:8px;background:#2563eb;border-radius:50%;"></span></td>
        <td style="vertical-align:middle;"><p style="margin:0;font-size:13px;color:#1e3a8a;font-weight:600;">Your performance appraisal has been discussed with you and is ready to review and acknowledge.</p></td>
      </tr></table>
    </div>

    <div style="padding:28px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Prepared For</p>
      <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">${employee.full_name}${employee.employee_id ? `<span style="font-size:12px;font-weight:500;color:#9ca3af;margin-left:10px;font-family:monospace;">${employee.employee_id}</span>` : ''}</p>
      <p style="font-size:13px;color:#6b7280;margin:0 0 2px;">${employee.department || 'FS Architects'}</p>
      <p style="font-size:13px;color:#6b7280;margin:0;">Rated by ${rater?.full_name ?? 'your immediate head'}</p>
    </div>

    ${oneOnOne ? `
    <div style="padding:24px 36px;background:#fafafa;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">1-on-1 Discussion</p>
      <div style="background:#111827;border-radius:10px;padding:16px 20px;">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Discussed On</p>
        <p style="margin:6px 0 0;font-size:17px;font-weight:700;color:#ffffff;">${oneOnOne}</p>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin:12px 0 0;line-height:1.6;">Please read your appraisal and submit any comments, then acknowledge it in the hub.</p>
    </div>` : ''}

    <div style="padding:32px 36px;text-align:center;">
      <a href="${PERFORMANCE_URL}" style="background:#111827;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">View My Appraisal</a>
      <p style="font-size:11px;color:#9ca3af;margin:16px 0 0;">If the button doesn't work, copy this link: ${PERFORMANCE_URL}</p>
    </div>

    <div style="padding:20px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 6px;line-height:1.6;">
        This appraisal is part of your official performance record. If you have questions, reach out to HR directly on Slack.
      </p>
      <p style="font-size:11px;color:#d1d5db;margin:0;">© ${new Date().getFullYear()} FS Architects · <a href="mailto:${FROM_EMAIL}" style="color:#d1d5db;text-decoration:none;">${FROM_EMAIL}</a></p>
    </div>

  </div>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `FS Architects <${FROM_EMAIL}>`,
        to: [employee.email],
        subject: `New Performance Appraisal — ${appraisal.month_appraised}`,
        html,
      }),
    });
    if (!res.ok) throw new Error(`Resend error: ${JSON.stringify(await res.json())}`);

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
