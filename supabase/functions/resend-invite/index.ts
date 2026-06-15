import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'onboarding@fsarchitects.ph';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const LOGO_URL = 'https://fsarchitects.ph/images/fs-architects-logo.jpg';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function emailHtml(firstName: string, linkUrl: string, isReset: boolean) {
  const headline = isReset ? 'Password Reset' : 'Your invite link';
  const greeting = isReset
    ? `Hey ${firstName}, here's your password reset link for Sentro Hub. Click below to set a new password.`
    : `Here's a fresh invite link to access Sentro Hub, ${firstName}. Click below to set your password and get started.`;
  const buttonText = isReset ? 'Reset My Password →' : 'Set My Password →';

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

          <!-- Header -->
          <tr>
            <td style="background:#334049;padding:24px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${LOGO_URL}" alt="FS Architects" width="72" height="72" style="display:block;width:72px;height:72px;border-radius:8px;object-fit:cover;" />
                  </td>
                  <td style="vertical-align:middle;padding-left:14px;">
                    <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;letter-spacing:0.04em;">FS ARCHITECTS</p>
                    <p style="margin:2px 0 0;font-size:10px;color:#a8b9c9;letter-spacing:0.12em;text-transform:uppercase;">Sentro Hub · ${headline}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Hey ${firstName}! 👋</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">${greeting}</p>

              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${linkUrl}"
                       style="display:inline-block;background:#1c2b3a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
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

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#d1d5db;">© ${new Date().getFullYear()} FS Architects · Sentro Hub</p>
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
      .select('email, full_name, onboarding_completed')
      .eq('id', contractor_id)
      .maybeSingle();

    if (fetchErr || !contractor) {
      return new Response(JSON.stringify({ error: 'Employee not found' }), { status: 200, headers: cors });
    }

    const { email, full_name, onboarding_completed } = contractor;
    const firstName = full_name.split(' ')[0];

    let linkData, linkErr, isReset = false;

    if (!onboarding_completed) {
      // Employee never finished setup — delete stale auth user and re-invite
      // Must save full hub_users row first since cascade will delete it
      const { data: fullRow } = await supabase
        .from('hub_users')
        .select('*')
        .eq('id', contractor_id)
        .maybeSingle();

      const { data: { users } } = await supabase.auth.admin.listUsers();
      const stale = users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
      if (stale) await supabase.auth.admin.deleteUser(stale.id);

      ({ data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: 'invite',
        email: email.toLowerCase(),
        options: { redirectTo: `${HUB_BASE_URL}/hub/signup?invite=1` },
      }));

      // Re-insert hub_users with new auth user ID
      if (linkData?.user && fullRow) {
        const { id: _oldId, ...rest } = fullRow;
        await supabase.from('hub_users').insert({ ...rest, id: linkData.user.id });
      }
    } else {
      // Employee already has an account — send a password reset
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
      ? `${HUB_BASE_URL}/hub/reset-password?token_hash=${encodeURIComponent(hashed_token)}&type=${type}`
      : `${HUB_BASE_URL}/hub/signup?invite=1&token_hash=${encodeURIComponent(hashed_token)}&type=${type}`;

    const html = emailHtml(firstName, destination, isReset);
    const subject = isReset
      ? `${firstName}, reset your Sentro Hub password`
      : `${firstName}, here's your Sentro Hub invite link`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `FS Architects <${FROM_EMAIL}>`,
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
