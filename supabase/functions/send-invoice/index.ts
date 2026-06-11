import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'Huna Creatives Billing <billing@hunacreatives.com>';
const DEFAULT_BASE_URL = (
  Deno.env.get('PUBLIC_SITE_URL') ||
  Deno.env.get('SITE_URL') ||
  'https://www.hunacreatives.com'
).replace(/\/$/, '');
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
      subject,
      client_name,
      project_name,
      service,
      contract_price,
      start_date,
      deadline,
      payments,
      show_payments,
      line_items,
      notes,
      bill_to_name,
      bill_to_address,
      reference,
      payment_terms,
      message,
      invoice_number,
      project_id,
      app_base_url,
      amount_requested,
    } = await req.json();

    const lineItems: { description: string; amount: string }[] = line_items?.length
      ? line_items
      : [{ description: service ?? project_name, amount: String(contract_price) }];
    const lineItemsTotal = lineItems.reduce((s: number, i: any) => s + (parseFloat(i.amount) || 0), 0);
    const showPayments = show_payments !== false;

    if (!to || !client_name || !project_name) {
      return new Response(JSON.stringify({ error: 'to, client_name, and project_name are required' }), { status: 200, headers: cors });
    }

    const totalPaid: number = (payments ?? []).reduce((s: number, p: any) => s + p.amount, 0);
    const balance = lineItemsTotal - totalPaid;
    // amount_requested overrides the balance shown on invoice and payment link
    const amountDue: number = amount_requested != null ? Number(amount_requested) : Math.max(balance, 0);
    const isPaid = amountDue <= 0;
    const logoUrl = 'https://www.hunacreatives.com/images/fc04818c74ad69bdfb22b93a6a0c6a72.png';
    const invoiceDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const billedTo = bill_to_name || client_name;
    const { data: paymentLink, error: paymentLinkError } = await supabase
      .from('hub_invoice_payment_links')
      .insert({
        project_id: project_id ?? null,
        invoice_number: String(invoice_number),
        client_name,
        project_name,
        to_email: to,
        amount_due: amountDue,
        due_date: deadline ?? null,
        line_items: lineItems,
        payment_terms: payment_terms ?? null,
        reference: reference ?? null,
      })
      .select('token')
      .single();

    if (paymentLinkError || !paymentLink?.token) {
      return new Response(JSON.stringify({ error: paymentLinkError?.message ?? 'Failed to create payment link' }), { status: 200, headers: cors });
    }

    const normalizedAppBase =
      typeof app_base_url === 'string' && app_base_url.trim().length > 0
        ? app_base_url.replace(/\/$/, '')
        : DEFAULT_BASE_URL;
    const payUrl = `${normalizedAppBase}/pay/${paymentLink.token}`;

    const paymentsRows = (payments ?? []).map((p: any) => `
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">
          ${new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </td>
        <td style="padding:10px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">
          ${p.notes ? p.notes : 'Payment received'}
        </td>
        <td style="padding:10px 16px;font-size:13px;color:#059669;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">
          ${fmt(p.amount)}
        </td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:28px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <img src="${logoUrl}" alt="Huna Creatives" height="34" style="display:block;" />
                  </td>
                  <td style="text-align:right;">
                    <p style="margin:0;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Invoice</p>
                    <p style="margin:4px 0 0;color:#ffffff;font-size:16px;font-weight:700;">#${String(invoice_number).padStart(4, '0')}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Meta row -->
          <tr>
            <td style="padding:28px 40px 0;border-bottom:1px solid #f3f4f6;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px;padding-bottom:12px;border-bottom:1px solid #f3f4f6;">
                <div>
                  <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">From</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:#111827;">Huna Creatives</p>
                  <div style="margin-top:6px;font-size:12px;color:#6b7280;line-height:1.7;">billing@hunacreatives.com<br/>www.hunacreatives.com</div>
                </div>
                <div style="text-align:right;">
                  <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Bill To</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:#111827;">${billedTo}</p>
                  <div style="margin-top:6px;font-size:12px;color:#6b7280;line-height:1.7;">${to ? `${to}${bill_to_address ? '<br/>' : ''}` : ''}${bill_to_address ? bill_to_address.replace(/\n/g, '<br/>') : ''}</div>
                </div>
              </div>
              <div style="margin-top:14px;padding:14px 16px;background:#f9fafb;border-radius:10px;margin-bottom:20px;">
                <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#111827;">${project_name}</p>
                ${service ? `<p style="margin:0;font-size:12px;color:#6b7280;">${service}</p>` : ''}
                ${start_date ? `<p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Started ${new Date(start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>` : ''}
              </div>
            </td>
          </tr>

          <!-- Contract price -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Description</th>
                    <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItems.map((i: any) => `<tr>
                    <td style="padding:14px 16px;font-size:13px;color:#111827;font-weight:500;">${i.description}</td>
                    <td style="padding:14px 16px;font-size:14px;font-weight:700;color:#111827;text-align:right;">${fmt(parseFloat(i.amount) || 0)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Payments received -->
          ${showPayments && paymentsRows ? `
          <tr>
            <td style="padding:20px 40px 0;">
              <p style="margin:0 0 10px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Payments Received</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:8px 16px;font-size:11px;color:#6b7280;font-weight:600;text-align:left;">Date</th>
                    <th style="padding:8px 16px;font-size:11px;color:#6b7280;font-weight:600;text-align:left;">Note</th>
                    <th style="padding:8px 16px;font-size:11px;color:#6b7280;font-weight:600;text-align:right;">Amount</th>
                  </tr>
                </thead>
                <tbody>${paymentsRows}</tbody>
              </table>
            </td>
          </tr>` : ''}

          <!-- Balance summary -->
          <tr>
            <td style="padding:20px 40px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#6b7280;">Subtotal</td>
                  <td style="padding:6px 0;font-size:13px;color:#6b7280;text-align:right;">${fmt(lineItemsTotal)}</td>
                </tr>
                ${showPayments ? `<tr>
                  <td style="padding:6px 0;font-size:13px;color:#6b7280;">Total paid</td>
                  <td style="padding:6px 0;font-size:13px;color:#059669;font-weight:600;text-align:right;">− ${fmt(totalPaid)}</td>
                </tr>` : ''}
                <tr>
                  <td colspan="2" style="padding:2px 0;"><div style="border-top:2px solid #e5e7eb;margin:4px 0;"></div></td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:15px;font-weight:700;color:#111827;">Balance due</td>
                  <td style="padding:8px 0;font-size:18px;font-weight:800;color:${isPaid ? '#059669' : '#FF6B35'};text-align:right;">${isPaid ? 'Paid in full' : fmt(amountDue)}</td>
                </tr>
              </table>
            </td>
          </tr>

          ${message ? `
          <tr>
            <td style="padding:0 40px 8px;">
              <div style="background:#fffbf5;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;">
                <p style="margin:0;font-size:13px;color:#92400e;">${message}</p>
              </div>
            </td>
          </tr>` : ''}

          ${notes ? `
          <tr>
            <td style="padding:0 40px 16px;">
              <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
                <p style="margin:0;font-size:12px;color:#6b7280;font-style:italic;">${notes}</p>
              </div>
            </td>
          </tr>` : ''}

          <!-- Payment options -->
          ${!isPaid ? `
          <tr>
            <td style="padding:0 40px 12px;">
              <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:18px 18px 16px;text-align:center;">
                <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111827;">Choose your payment channel online</p>
                <p style="margin:0 0 14px;font-size:12px;color:#6b7280;">Open your secure payment page to select GCash, BDO, or GoTyme, then upload proof of payment.</p>
                <a href="${payUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#111827;color:#ffffff;font-size:14px;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none;">
                  Pay Now →
                </a>
              </div>
            </td>
          </tr>` : ''}

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">Questions? Email us at <a href="mailto:contact@hunacreatives.com" style="color:#9ca3af;">contact@hunacreatives.com</a> · © ${new Date().getFullYear()} Huna Creatives</p>
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
        subject: subject ?? `Invoice #${String(invoice_number).padStart(4, '0')} — ${project_name}`,
        html,
      }),
    });

    const resBody = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: resBody?.message ?? 'Failed to send email' }), { status: 200, headers: cors });
    }

    await supabase.from('hub_invoice_log').insert({
      invoice_number: String(invoice_number),
      project_id: project_id ?? null,
      client_name,
      project_name,
      sent_to: to,
      sent_cc: cc ?? null,
      subject: subject ?? null,
      contract_price: lineItemsTotal,
      total_paid: totalPaid,
      balance: amountDue,
      line_items: lineItems,
      show_payments: showPayments,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
