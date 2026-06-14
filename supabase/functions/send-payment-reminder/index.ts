const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'billing@fsarchitects.ph';
const SUPABASE_URL_VAR = Deno.env.get('SUPABASE_URL')!;
const LOGO_URL = Deno.env.get('LOGO_URL') ?? `${SUPABASE_URL_VAR}/storage/v1/object/public/brand/fs-architects-logo.jpg`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const {
      to,
      client_name,
      project_name,
      amount_due,
      due_date,
      notes,
      total_paid,
      contract_price,
    } = await req.json();

    if (!to || !client_name || !project_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 200, headers: cors });
    }

    const logoUrl = LOGO_URL;
    const dueDateStr = due_date
      ? new Date(due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;
    const totalPaidSoFar = total_paid ?? 0;
    const contractTotal = contract_price ?? 0;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:28px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td><img src="${logoUrl}" alt="FS Architects" height="26" style="display:block;" /></td>
                  <td style="text-align:right;">
                    <p style="margin:0;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Payment Reminder</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;">Hi ${client_name},</h1>
              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
                Just a friendly reminder that a payment is coming up for your project <strong style="color:#111827;">${project_name}</strong>.
              </p>
            </td>
          </tr>

          <!-- Amount box -->
          <tr>
            <td style="padding:20px 40px 0;">
              <div style="background:#fffbf5;border:1px solid #fed7aa;border-radius:12px;padding:20px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:13px;color:#92400e;">Amount due</td>
                    <td style="font-size:24px;font-weight:800;color:#FF6B35;text-align:right;">${amount_due ? fmt(amount_due) : 'See invoice'}</td>
                  </tr>
                  ${dueDateStr ? `<tr>
                    <td style="padding-top:6px;font-size:13px;color:#92400e;">Due date</td>
                    <td style="padding-top:6px;font-size:13px;font-weight:600;color:#92400e;text-align:right;">${dueDateStr}</td>
                  </tr>` : ''}
                </table>
              </div>
            </td>
          </tr>

          ${notes ? `
          <!-- Notes -->
          <tr>
            <td style="padding:16px 40px 0;">
              <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
                <p style="margin:0;font-size:13px;color:#374151;">${notes}</p>
              </div>
            </td>
          </tr>` : ''}

          ${contractTotal > 0 ? `
          <!-- Progress -->
          <tr>
            <td style="padding:16px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#9ca3af;">Paid to date</td>
                  <td style="font-size:12px;color:#6b7280;text-align:right;">${fmt(totalPaidSoFar)} of ${fmt(contractTotal)}</td>
                </tr>
              </table>
              <div style="margin-top:6px;height:4px;background:#e5e7eb;border-radius:999px;overflow:hidden;">
                <div style="height:4px;background:#059669;border-radius:999px;width:${Math.min(Math.round((totalPaidSoFar / contractTotal) * 100), 100)}%;"></div>
              </div>
            </td>
          </tr>` : ''}

          <!-- Payment options -->
          <tr>
            <td style="padding:24px 40px 0;">
              <p style="margin:0 0 14px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Pay via</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td colspan="3" style="text-align:center;padding:12px 0;">
                    <!-- FS Architects payment QR codes go here -->
                    <p style="margin:0;font-size:13px;color:#6b7280;">Please contact us for payment details.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;text-align:center;margin-top:24px;">
              <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;">This email is not monitored. Do not reply directly — for concerns, email <a href="mailto:contact@fsarchitects.ph" style="color:#9ca3af;">contact@fsarchitects.ph</a></p>
              <p style="margin:0;font-size:11px;color:#d1d5db;">© ${new Date().getFullYear()} FS Architects · billing@fsarchitects.ph</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: `Payment Reminder — ${project_name}`,
        html,
      }),
    });

    const resBody = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: resBody?.message ?? 'Failed to send' }), { status: 200, headers: cors });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
