import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'info@fsarchitects.ph';
const REPLY_TO = 'info@fsarchitects.ph';
const SUPABASE_URL_VAR = Deno.env.get('SUPABASE_URL')!;
const LOGO_URL = Deno.env.get('LOGO_URL') ?? `${SUPABASE_URL_VAR}/storage/v1/object/public/brand/fs-architects-logo.jpg`;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { submission_id, to_email, to_name, subject, body } = await req.json();

    if (!to_email || !subject || !body) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: cors });
    }

    const hasCalendly = body.includes('calendly.com');
    const cleanBody = body.replace(/https:\/\/calendly\.com\/[^\s<"']*/g, '').trim();

    const paragraphs = cleanBody
      .split('\n')
      .map(line => line.trim() === ''
        ? '<tr><td height="12"></td></tr>'
        : `<tr><td style="padding:0 0 16px;font-size:15px;line-height:1.75;color:#2a2a2a;font-family:Georgia,'Times New Roman',serif">${line}</td></tr>`)
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${subject}</title>
  <style>
    @media only screen and (max-width:600px){
      .email-wrapper{padding:0!important}
      .email-body{padding:32px 20px!important}
      .email-header{padding:24px 20px!important}
      .email-footer{padding:20px!important}
      .logo-img{height:36px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f2f2f0;-webkit-text-size-adjust:100%;mso-line-height-rule:exactly">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f2f2f0">
    <tr>
      <td align="center" class="email-wrapper" style="padding:40px 16px">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:560px;background:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">

          <!-- Header -->
          <tr>
            <td class="email-header" style="background:#334049;padding:28px 40px">
              <img src="${LOGO_URL}"
                   alt="FS Architects"
                   class="logo-img"
                   width="auto"
                   height="48"
                   style="display:block;height:48px;width:auto;border:0;outline:0;text-decoration:none">
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="email-body" style="padding:44px 40px 36px;background:#ffffff">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                ${paragraphs}
                ${hasCalendly ? `
                <tr><td height="12"></td></tr>
                <tr>
                  <td style="padding:8px 0 4px">
                    <a href="https://calendly.com/fsarchitects/30min"
                       style="display:inline-block;background:#334049;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:14px 32px;border-radius:3px;text-decoration:none">
                      Book a Call &rarr;
                    </a>
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="email-footer" style="background:#334049;padding:24px 40px">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#ffffff;letter-spacing:0.08em;text-transform:uppercase">
                    FS Architects
                  </td>
                  <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px">
                    <a href="mailto:info@fsarchitects.ph" style="color:#a8b9c9;text-decoration:none">info@fsarchitects.ph</a>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;color:#a8b9c9;padding-top:4px">
                    Cebu City, Philippines
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `FS Architects <${FROM_EMAIL}>`,
        to: [to_email],
        reply_to: FROM_EMAIL,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), { status: 500, headers: cors });
    }

    // Log the sent email
    await supabase.from('contact_replies').insert({
      submission_id: submission_id ?? null,
      to_email,
      to_name: to_name ?? null,
      subject,
      body,
    });

    // Mark submission as replied if one exists
    if (submission_id) {
      await supabase.from('contact_submissions').update({ status: 'replied' }).eq('id', submission_id);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
