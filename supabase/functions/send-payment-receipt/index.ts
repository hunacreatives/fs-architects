import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'Huna Creatives Billing <billing@hunacreatives.com>';
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

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
      cc,
      client_name,
      project_name,
      amount,
      paid_at,
      notes,
      receipt_url,
      total_paid,
      contract_price,
      invoice_number,
      project_id,
    } = await req.json();

    if (!to || !client_name || !project_name || !amount) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 200, headers: cors });
    }

    const balance = contract_price - total_paid;
    const isPaid = balance <= 0;
    const logoUrl = 'https://www.hunacreatives.com/images/fc04818c74ad69bdfb22b93a6a0c6a72.png';
    const dateStr = new Date(paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const invNum = String(invoice_number ?? '').padStart(4, '0');

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
                  <td><img src="${logoUrl}" alt="Huna Creatives" height="26" style="display:block;" /></td>
                  <td style="text-align:right;">
                    <p style="margin:0;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Payment Received</p>
                    ${invNum ? `<p style="margin:4px 0 0;color:#6b7280;font-size:12px;">Ref #${invNum}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Confirmation badge -->
          <tr>
            <td style="padding:32px 40px 0;text-align:center;">
              <div style="width:56px;height:56px;background:#f0fdf4;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
                <span style="font-size:24px;">✓</span>
              </div>
              <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#111827;">Payment confirmed</h1>
              <p style="margin:0;font-size:14px;color:#6b7280;">Hi ${client_name}, we've received your payment for <strong>${project_name}</strong>.</p>
            </td>
          </tr>

          <!-- Payment details -->
          <tr>
            <td style="padding:24px 40px 0;">
              <div style="background:#f0fdf4;border-radius:12px;padding:20px;border:1px solid #bbf7d0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#166534;">Amount received</td>
                    <td style="padding:6px 0;font-size:22px;font-weight:800;color:#059669;text-align:right;">${fmt(amount)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#166534;">Date</td>
                    <td style="padding:4px 0;font-size:13px;font-weight:600;color:#166534;text-align:right;">${dateStr}</td>
                  </tr>
                  ${notes ? `<tr>
                    <td style="padding:4px 0;font-size:13px;color:#166534;">Note</td>
                    <td style="padding:4px 0;font-size:13px;color:#166534;text-align:right;">${notes}</td>
                  </tr>` : ''}
                </table>
              </div>
            </td>
          </tr>

          <!-- Running total (subtle) -->
          <tr>
            <td style="padding:12px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0;font-size:12px;color:#9ca3af;">Total paid to date</td>
                  <td style="padding:4px 0;font-size:12px;color:#6b7280;text-align:right;">${fmt(total_paid)}</td>
                </tr>
                ${isPaid ? `<tr>
                  <td colspan="2" style="padding:6px 0;text-align:center;">
                    <span style="font-size:12px;color:#059669;font-weight:600;">✓ Fully paid — thank you!</span>
                  </td>
                </tr>` : `<tr>
                  <td style="padding:4px 0;font-size:12px;color:#9ca3af;">Remaining balance</td>
                  <td style="padding:4px 0;font-size:12px;color:#9ca3af;text-align:right;">${fmt(balance)}</td>
                </tr>`}
              </table>
            </td>
          </tr>

          <!-- Receipt image -->
          ${receipt_url ? `
          <tr>
            <td style="padding:20px 40px 0;">
              <p style="margin:0 0 10px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Proof of Receipt</p>
              <a href="${receipt_url}" target="_blank" style="display:block;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
                <img src="${receipt_url}" alt="Receipt" style="width:100%;display:block;max-height:300px;object-fit:contain;background:#f9fafb;" />
              </a>
              <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;text-align:center;">Click image to view full size</p>
            </td>
          </tr>` : ''}

          <!-- Footer -->
          <tr>
            <td style="padding:28px 40px;text-align:center;border-top:1px solid #f3f4f6;margin-top:24px;">
              <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">Thank you for your payment.</p>
              <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;">This email is not monitored. Do not reply directly — for concerns, email <a href="mailto:contact@hunacreatives.com" style="color:#9ca3af;">contact@hunacreatives.com</a></p>
              <p style="margin:0;font-size:11px;color:#d1d5db;">© ${new Date().getFullYear()} Huna Creatives · billing@hunacreatives.com</p>
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
        ...(cc ? { cc: [cc] } : {}),
        subject: `Payment Received — ${project_name}`,
        html,
      }),
    });

    const resBody = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: resBody?.message ?? 'Failed to send' }), { status: 200, headers: cors });
    }

    await supabase.from('hub_payment_receipt_log').insert({
      project_id: project_id ?? null,
      client_name,
      project_name,
      payment_amount: amount,
      paid_at,
      sent_to: to,
      total_paid,
      balance,
      receipt_url: receipt_url ?? null,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
