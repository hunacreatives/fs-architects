import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fired server-side (via pg_net, from acknowledge_appraisal) the moment an
// employee acknowledges their performance appraisal. Emails both Fretz and
// the employee a summary plus the 1-on-1 discussion date he scheduled when
// he sent the review, so the conversation actually happens on that date.

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

function fmtDateTime(iso: string | null): string {
  if (!iso) return 'Not yet scheduled';
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

async function sendEmail(to: string[], subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
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
      .select('*, employee:hub_users!employee_id(full_name, email), rater:hub_users!rater_id(full_name)')
      .eq('id', appraisal_id)
      .single();

    if (error || !appraisal) throw new Error(`Appraisal not found: ${error?.message}`);

    const employee = appraisal.employee as { full_name: string; email: string };
    const rater = appraisal.rater as { full_name: string } | null;

    const factorRows = Object.entries(FACTOR_LABELS).map(([key, label]) => {
      const score = factorScore(appraisal.ratings?.[key]?.levels);
      return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${label}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${score != null ? score.toFixed(2) : '—'}</td></tr>`;
    }).join('');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827;">
        <h2 style="color:#1c2b3a;">Performance Appraisal Acknowledged</h2>
        <p><strong>${employee?.full_name ?? 'Employee'}</strong> has read their appraisal for <strong>${appraisal.month_appraised}</strong> (period: ${appraisal.period_covered}) and submitted their comments.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 12px;background:#f9fafb;font-weight:600;">Final Rating</td><td style="padding:6px 12px;background:#f9fafb;text-align:right;font-weight:700;">${appraisal.final_rating_pct != null ? Number(appraisal.final_rating_pct).toFixed(1) + '%' : '—'}</td></tr>
          <tr><td style="padding:6px 12px;background:#f9fafb;font-weight:600;">Performance Level</td><td style="padding:6px 12px;background:#f9fafb;text-align:right;font-weight:700;">${appraisal.performance_level != null ? Number(appraisal.performance_level).toFixed(1) : '—'}</td></tr>
          ${factorRows}
        </table>

        ${appraisal.employee_comments ? `<p><strong>Employee's comments:</strong><br/>${appraisal.employee_comments}</p>` : ''}

        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:20px 0;">
          <p style="margin:0;font-weight:700;color:#1c2b3a;">1-on-1 Discussion Scheduled</p>
          <p style="margin:4px 0 0;">${fmtDateTime(appraisal.one_on_one_at)}</p>
        </div>

        <p>Rated by ${rater?.full_name ?? 'the immediate head'}. Review the full appraisal and complete the HR sign-off at <a href="${HUB_BASE_URL}/hub/admin/performance">${HUB_BASE_URL}/hub/admin/performance</a>.</p>
      </div>
    `;

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
