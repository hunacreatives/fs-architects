import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fired server-side by a database trigger the moment an appraisal's status
// flips to 'awaiting_employee' — i.e. the instant Fretz sends it. Emails the
// employee so they don't have to notice the in-app notification to find out.

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
      .select('*, employee:hub_users!employee_id(full_name, email), rater:hub_users!rater_id(full_name)')
      .eq('id', appraisal_id)
      .single();

    if (error || !appraisal) throw new Error(`Appraisal not found: ${error?.message}`);

    const employee = appraisal.employee as { full_name: string; email: string } | null;
    const rater = appraisal.rater as { full_name: string } | null;
    if (!employee?.email) throw new Error('Employee has no email on file');

    const oneOnOne = fmtDateTime(appraisal.one_on_one_at);

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827;">
        <h2 style="color:#1c2b3a;">You have a new Performance Appraisal</h2>
        <p>Hi ${employee.full_name ?? ''},</p>
        <p>${rater?.full_name ?? 'Your immediate head'} has completed your performance appraisal for <strong>${appraisal.month_appraised}</strong> (period: ${appraisal.period_covered}) and it's ready for you to review.</p>

        ${oneOnOne ? `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:20px 0;">
          <p style="margin:0;font-weight:700;color:#1c2b3a;">1-on-1 Discussion Scheduled</p>
          <p style="margin:4px 0 0;">${oneOnOne}</p>
          <p style="margin:8px 0 0;font-size:13px;color:#475569;">Please read your appraisal and submit any comments before this discussion.</p>
        </div>` : ''}

        <p style="text-align:center;margin:28px 0;">
          <a href="${PERFORMANCE_URL}" style="background:#1c2b3a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;display:inline-block;">View My Appraisal</a>
        </p>

        <p style="font-size:13px;color:#6b7280;">If the button doesn't work, copy this link into your browser: ${PERFORMANCE_URL}</p>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
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
