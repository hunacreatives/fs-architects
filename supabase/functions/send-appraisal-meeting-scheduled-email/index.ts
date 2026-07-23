import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fired server-side by a database trigger whenever an appraisal's
// one_on_one_at is set or changed — including while it's still a draft.
// Only tells the employee a 1-on-1 performance discussion is scheduled; it
// deliberately does NOT reveal the appraisal itself (ratings, comments,
// scores) since Fretz hasn't confirmed the discussion happened yet.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'hr@fsarchitects.ph';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// Google Calendar's "quick add" link needs no OAuth/API key — just a URL
// with the event encoded in it. Defaults to a 1-hour block.
function toGCalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
function buildGoogleCalendarUrl(startIso: string, title: string, details: string): string {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toGCalStamp(start)}/${toGCalStamp(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { appraisal_id, is_reschedule, previous_one_on_one_at } = await req.json();
    if (!appraisal_id) {
      return new Response(JSON.stringify({ error: 'Missing appraisal_id' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: appraisal, error } = await supabase
      .from('hub_appraisals')
      .select('one_on_one_at, period_covered, employee_id, employee:hub_users!employee_id(full_name, email), rater:hub_users!rater_id(full_name)')
      .eq('id', appraisal_id)
      .single();

    if (error || !appraisal) throw new Error(`Appraisal not found: ${error?.message}`);
    if (!appraisal.one_on_one_at) throw new Error('Appraisal has no one_on_one_at set');

    const employee = appraisal.employee as { full_name: string; email: string } | null;
    const rater = appraisal.rater as { full_name: string } | null;
    const when = fmtDateTime(appraisal.one_on_one_at);
    const raterName = rater?.full_name ?? 'your immediate head';
    const reschedule = Boolean(is_reschedule);
    const previousWhen = reschedule && previous_one_on_one_at ? fmtDateTime(previous_one_on_one_at) : null;
    const headline = reschedule ? '1-on-1 Discussion Rescheduled' : '1-on-1 Discussion Scheduled';
    const bannerText = reschedule
      ? `${raterName} has moved your 1-on-1 to a new time.`
      : `${raterName} has scheduled a 1-on-1 with you.`;
    const timeLabel = reschedule ? 'New Time' : 'Scheduled For';
    const gcalUrl = buildGoogleCalendarUrl(
      appraisal.one_on_one_at,
      'Performance 1-on-1 Discussion — FS Architects',
      `1-on-1 performance discussion with ${raterName}.`,
    );

    if (employee?.email) {
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
      <p style="color:#fff;font-size:22px;font-weight:800;margin:0 0 6px;letter-spacing:-0.3px;">${headline}</p>
      <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">${appraisal.period_covered ? `${appraisal.period_covered} ` : ''}Performance Review Meeting</p>
    </div>

    <div style="background:#eff6ff;padding:12px 36px;border-bottom:1px solid #bfdbfe;">
      <table style="border-collapse:collapse;"><tr>
        <td style="vertical-align:middle;padding-right:10px;"><span style="display:inline-block;width:8px;height:8px;background:#2563eb;border-radius:50%;"></span></td>
        <td style="vertical-align:middle;"><p style="margin:0;font-size:13px;color:#1e3a8a;font-weight:600;">${bannerText}</p></td>
      </tr></table>
    </div>

    <div style="padding:28px 36px;">
      <p style="font-size:13px;color:#374151;margin:0 0 20px;line-height:1.6;">Hi ${employee.full_name ?? ''}, ${raterName} would like to meet with you to go over your recent performance.</p>
      ${previousWhen ? `<p style="font-size:12px;color:#9ca3af;margin:0 0 10px;line-height:1.6;text-decoration:line-through;">Previously: ${previousWhen}</p>` : ''}
      <div style="background:#111827;border-radius:10px;padding:16px 20px;">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">${timeLabel}</p>
        <p style="margin:6px 0 0;font-size:17px;font-weight:700;color:#ffffff;">${when}</p>
      </div>
      <p style="text-align:center;margin:20px 0 0;">
        <a href="${gcalUrl}" style="background:#ffffff;color:#111827;text-decoration:none;padding:11px 24px;border-radius:8px;font-weight:600;font-size:13px;display:inline-block;border:1px solid #d1d5db;">📅 Add to Google Calendar</a>
      </p>
    </div>

    <div style="padding:20px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 6px;line-height:1.6;">
        Your detailed performance appraisal will be shared with you after this discussion.
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
          subject: `${headline} — ${when}`,
          html,
        }),
      });
      if (!res.ok) console.error('Resend error:', JSON.stringify(await res.json()));
    }

    await supabase.from('hub_notifications').insert({
      user_id: appraisal.employee_id,
      type: 'appraisal_meeting',
      title: headline,
      body: reschedule
        ? `${raterName} moved your performance discussion to ${when}.`
        : `${raterName} has scheduled a performance discussion with you on ${when}.`,
      link: null,
      read: false,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
