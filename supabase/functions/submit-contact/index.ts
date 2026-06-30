import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const NOTIFY_EMAIL = 'info@fsarchitects.ph';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@fsarchitects.ph';

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
    const body = await req.json();
    const { name, email, subject, service, message } = body;

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: cors });
    }

    // Save to DB
    const { error: dbError } = await supabase.from('contact_submissions').insert({
      name,
      email,
      subject: subject ?? '',
      service: service ?? null,
      message,
    });

    if (dbError) {
      return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: cors });
    }

    // Send email notification via Resend
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;padding:32px;margin:0">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
          <div style="background:#1c2b3a;padding:20px 24px;">
            <img src="https://fsarchitects.ph/images/fs-architects-logo-white.png" alt="FS Architects" height="48" style="display:block;" />
          </div>
          <div style="padding:24px;color:#1a1a1a">
            <p style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#999;margin:0 0 20px">New Contact Form Submission</p>
            <h2 style="margin:0 0 20px;font-size:20px">${name}</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
              <tr><td style="padding:8px 0;color:#666;width:100px">From</td><td style="padding:8px 0">${email}</td></tr>
              ${service ? `<tr><td style="padding:8px 0;color:#666">Service</td><td style="padding:8px 0">${service}</td></tr>` : ''}
              ${subject ? `<tr><td style="padding:8px 0;color:#666">Subject</td><td style="padding:8px 0">${subject}</td></tr>` : ''}
            </table>
            <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;font-size:14px;line-height:1.6;white-space:pre-wrap">${message}</div>
          </div>
          <div style="padding:16px 24px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af">
            Submitted via <a href="https://fsarchitects.ph" style="color:#9ca3af;text-decoration:none">fsarchitects.ph</a> · © ${new Date().getFullYear()} FS Architects
          </div>
        </div>
      </div>
    `;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [NOTIFY_EMAIL],
        reply_to: email,
        subject: `New inquiry from ${name}${service ? ` — ${service}` : subject ? ` — ${subject}` : ''}`,
        html,
      }),
    });

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
