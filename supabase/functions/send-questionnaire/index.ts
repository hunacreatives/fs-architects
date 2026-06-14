const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'onboarding@fsarchitects.ph';
const BASE_URL = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.fsarchitects.ph';
const SUPABASE_URL_VAR = Deno.env.get('SUPABASE_URL')!;
const LOGO_URL = Deno.env.get('LOGO_URL') ?? `${SUPABASE_URL_VAR}/storage/v1/object/public/brand/fs-architects-logo.jpg`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { to, client_name, service_type, token, intro_message, question_count } = await req.json();

    if (!to || !client_name || !token) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 200, headers: cors });
    }

    const formUrl = `${BASE_URL}/q/${token}`;
    const logoUrl = LOGO_URL;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

        <tr><td style="background:#111827;padding:24px 36px;">
          <img src="${logoUrl}" alt="FS Architects" height="24" style="display:block;" />
        </td></tr>

        <tr><td style="padding:32px 36px 24px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;">Hi ${client_name} 👋</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
            ${intro_message ? intro_message : `Thank you for reaching out to FS Architects! To help us give you the best proposal for your <strong>${service_type}</strong> project, we'd love to learn more about your needs.`}
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            We've put together a short questionnaire (${question_count || 'a few'} questions) — it takes about 5 minutes to fill out.
          </p>
          <a href="${formUrl}" style="display:inline-block;background:#FF6B35;color:#ffffff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;">
            Fill out your questionnaire →
          </a>
        </td></tr>

        <tr><td style="padding:0 36px 32px;">
          <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">Or copy this link into your browser:</p>
            <p style="margin:4px 0 0;font-size:11px;color:#6b7280;word-break:break-all;">${formUrl}</p>
          </div>
        </td></tr>

        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 36px;text-align:center;">
          <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;">This email is not monitored. Do not reply directly — for concerns, email <a href="mailto:contact@fsarchitects.ph" style="color:#9ca3af;">contact@fsarchitects.ph</a></p>
          <p style="margin:0;font-size:11px;color:#d1d5db;">© ${new Date().getFullYear()} FS Architects · contact@fsarchitects.ph</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: `Your ${service_type} questionnaire from FS Architects`,
        html,
      }),
    });

    const body = await res.json();
    if (!res.ok) return new Response(JSON.stringify({ error: body?.message ?? 'Failed to send' }), { status: 200, headers: cors });
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
