import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'onboarding@hunacreatives.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function emailHtml(firstName: string, linkUrl: string, isReset: boolean) {
  const headline = isReset ? 'Reset your password' : 'You\'re invited to Huna Hub';
  const greeting = isReset
    ? `Hey ${firstName}, someone requested a password reset for your Huna Hub account. Click below to set a new password.`
    : `Here's a fresh invite link to access your Huna Hub account. Click below to set your password and get started.`;
  const buttonText = isReset ? 'Reset My Password →' : 'Set My Password →';

  const featureRows = [
    ['🕐', 'Attendance tracking via Slack'],
    ['💰', 'Your payslips and payouts'],
    ['📋', 'SOPs and team announcements'],
    ['📄', 'Contracts and documents'],
  ].map(([emoji, text]) => `
    <tr>
      <td style="width:28px;vertical-align:top;padding-bottom:8px;font-size:15px;">${emoji}</td>
      <td style="font-size:13px;color:#374151;padding-bottom:8px;">${text}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:#111827;padding:32px 40px;text-align:center;">
              <img src="https://www.hunacreatives.com/images/fc04818c74ad69bdfb22b93a6a0c6a72.png"
                   alt="Huna Creatives" height="32" style="display:block;margin:0 auto 16px;" />
              <p style="margin:0;color:#9ca3af;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">${headline}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Hey ${firstName}! 👋</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">${greeting}</p>
              ${!isReset ? `
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
                <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">What's inside Huna Hub</p>
                <table cellpadding="0" cellspacing="0" width="100%">${featureRows}</table>
              </div>` : ''}
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${linkUrl}"
                       style="display:inline-block;background:#FF6B35;color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
                      ${buttonText}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">
                This link expires in 24 hours. If you didn't expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;">This email is not monitored. Do not reply directly — for concerns, email <a href="mailto:contact@hunacreatives.com" style="color:#9ca3af;">contact@hunacreatives.com</a></p>
              <p style="margin:0;font-size:11px;color:#d1d5db;">© ${new Date().getFullYear()} Huna Creatives · onboarding@hunacreatives.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { contractor_id } = await req.json();
    if (!contractor_id) {
      return new Response(JSON.stringify({ error: 'contractor_id required' }), { status: 400, headers: cors });
    }

    const { data: contractor, error: fetchErr } = await supabase
      .from('hub_users')
      .select('email, full_name')
      .eq('id', contractor_id)
      .maybeSingle();

    if (fetchErr || !contractor) {
      return new Response(JSON.stringify({ error: 'Contractor not found' }), { status: 200, headers: cors });
    }

    const { email, full_name } = contractor;
    const firstName = full_name.split(' ')[0];

    // Try invite first (new user); fall back to recovery if auth user already exists
    let linkData, linkErr, isReset = false;

    ({ data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: email.toLowerCase(),
    }));

    if (linkErr || !linkData?.properties?.hashed_token) {
      isReset = true;
      ({ data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: email.toLowerCase(),
      }));
    }

    if (linkErr || !linkData?.properties?.hashed_token) {
      return new Response(JSON.stringify({ error: linkErr?.message ?? 'Failed to generate link' }), { status: 200, headers: cors });
    }

    const { hashed_token } = linkData.properties;
    const type = isReset ? 'recovery' : 'invite';
    const destination = isReset
      ? `https://www.hunacreatives.com/hub/reset-password?token_hash=${hashed_token}&type=${type}`
      : `https://www.hunacreatives.com/hub/signup?invite=1&token_hash=${hashed_token}&type=${type}`;

    const html = emailHtml(firstName, destination, isReset);
    const subject = isReset
      ? `${firstName}, reset your Huna Hub password`
      : `${firstName}, here's your Huna Hub invite link`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Huna Creatives Onboarding <${FROM_EMAIL}>`,
        to: [email.toLowerCase()],
        subject,
        html,
      }),
    });

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
