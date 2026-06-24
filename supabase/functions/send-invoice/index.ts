import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { guardAdmin } from '../_shared/auth.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'billing@fsarchitects.ph';
const DEFAULT_BASE_URL = (
  Deno.env.get('PUBLIC_SITE_URL') ||
  Deno.env.get('SITE_URL') ||
  'https://www.fsarchitects.ph'
).replace(/\/$/, '');
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

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function normalizeRecipients(input: unknown) {
  if (Array.isArray(input)) {
    return input.map((value) => String(value || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(/[,\n;]+/).map((value) => value.trim()).filter(Boolean);
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const denied = await guardAdmin(req);
  if (denied) return denied;

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
      existing_invoice_log_id,
      preview_only,
      issue_date,
    } = await req.json();
    const toList = normalizeRecipients(to);
    const ccList = normalizeRecipients(cc);

    const lineItems: { description: string; amount: string }[] = line_items?.length
      ? line_items
      : [{ description: service ?? project_name, amount: String(contract_price) }];
    const lineItemsTotal = lineItems.reduce((s: number, i: any) => s + (parseFloat(i.amount) || 0), 0);
    const showPayments = show_payments !== false;

    if (toList.length === 0 || !client_name || !project_name) {
      return new Response(JSON.stringify({ error: 'to, client_name, and project_name are required' }), { status: 200, headers: cors });
    }

    const totalPaid: number = (payments ?? []).reduce((s: number, p: any) => s + p.amount, 0);
    const requestedAmount = amount_requested != null && String(amount_requested).trim() !== '' ? Number(amount_requested) : NaN;
    const amountDue: number = Number.isFinite(requestedAmount) ? requestedAmount : lineItemsTotal;
    const isPaid = amountDue <= 0;
    const logoUrl = LOGO_URL;
    const fmtDate = (d: string | null | undefined) => d
      ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '—';
    const issueDateFmt = fmtDate(issue_date || new Date().toISOString().slice(0, 10));
    const dueDateFmt = fmtDate(deadline);
    const billedTo = bill_to_name || client_name;
    if (existing_invoice_log_id) {
      await supabase
        .from('hub_invoice_payment_links')
        .update({ status: 'closed' })
        .eq('invoice_number', String(invoice_number))
        .eq('project_id', project_id ?? null)
        .eq('status', 'open');
    }

    const { data: paymentLink, error: paymentLinkError } = await supabase
      .from('hub_invoice_payment_links')
      .insert({
        project_id: project_id ?? null,
        invoice_number: String(invoice_number),
        client_name,
        project_name,
        to_email: toList.join(', '),
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

    // If this request is only for preview purposes, skip sending emails and return the token
    if (preview_only) {
      return new Response(JSON.stringify({ ok: true, token: paymentLink.token }), { headers: cors });
    }

    const paymentsRows = (payments ?? []).map((p: any) => `
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#374151;border-top:1px solid #f3f4f6;">
          ${new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </td>
        <td style="padding:10px 16px;font-size:13px;color:#374151;border-top:1px solid #f3f4f6;">
          ${p.notes ? p.notes : 'Payment received'}
        </td>
        <td style="padding:10px 16px;font-size:13px;color:#059669;font-weight:600;text-align:right;border-top:1px solid #f3f4f6;">
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
                  <td valign="middle">
                    <img src="${logoUrl}" alt="FS Architects" height="34" style="display:block;" />
                  </td>
                  <td align="right" valign="middle" style="text-align:right;">
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
                  <p style="margin:0;font-size:15px;font-weight:700;color:#111827;">FS Architects</p>
                  <div style="margin-top:6px;font-size:12px;color:#6b7280;line-height:1.7;">billing@fsarchitects.ph<br/>www.fsarchitects.ph</div>
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

          <!-- Dates row -->
          <tr>
            <td style="padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:50%;padding:0;">
                    <p style="margin:0 0 4px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Issue Date</p>
                    <p style="margin:0;font-size:13px;font-weight:700;color:#111827;">${issueDateFmt}</p>
                  </td>
                  <td style="width:50%;padding:0;text-align:right;">
                    <p style="margin:0 0 4px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Due Date</p>
                    <p style="margin:0;font-size:13px;font-weight:700;color:#111827;">${dueDateFmt}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Line items -->
          <tr>
            <td style="padding:16px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr>
                    <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-align:left;text-transform:uppercase;letter-spacing:0.05em;background:#f9fafb;">Description</th>
                    <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-align:right;text-transform:uppercase;letter-spacing:0.05em;background:#f9fafb;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItems.map((i: any) => `<tr>
                    <td style="padding:14px 16px;font-size:13px;color:#111827;font-weight:500;border-top:1px solid #f3f4f6;">${i.description}</td>
                    <td style="padding:14px 16px;font-size:14px;font-weight:700;color:#111827;text-align:right;border-top:1px solid #f3f4f6;">${fmt(parseFloat(i.amount) || 0)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Payments received -->
          ${showPayments && paymentsRows ? `
          <tr>
            <td style="padding:16px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr>
                    <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-align:left;text-transform:uppercase;letter-spacing:0.05em;background:#f9fafb;">Date</th>
                    <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-align:left;text-transform:uppercase;letter-spacing:0.05em;background:#f9fafb;">Note</th>
                    <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-align:right;text-transform:uppercase;letter-spacing:0.05em;background:#f9fafb;">Payment</th>
                  </tr>
                </thead>
                <tbody>${paymentsRows}</tbody>
              </table>
            </td>
          </tr>` : ''}

          <!-- Balance summary -->
          <tr>
            <td style="padding:20px 40px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:14px 18px;">
                <tr>
                  <td colspan="2" style="padding:0 0 8px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Invoice Summary</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#6b7280;">Subtotal</td>
                  <td style="padding:7px 0;font-size:13px;color:#6b7280;text-align:right;white-space:nowrap;">${fmt(lineItemsTotal)}</td>
                </tr>
                ${showPayments ? `<tr>
                  <td style="padding:7px 0;font-size:13px;color:#6b7280;">Total paid so far</td>
                  <td style="padding:7px 0;font-size:13px;color:#059669;font-weight:600;text-align:right;white-space:nowrap;">− ${fmt(totalPaid)}</td>
                </tr>` : ''}
                <tr>
                  <td colspan="2" style="padding:4px 0 0;"><div style="border-top:2px solid #e5e7eb;"></div></td>
                </tr>
                <tr>
                  <td style="padding:12px 0 0;font-size:15px;font-weight:700;color:#111827;">Amount due</td>
                  <td style="padding:12px 0 0;font-size:18px;font-weight:800;color:${isPaid ? '#059669' : '#FF6B35'};text-align:right;white-space:nowrap;">${isPaid ? 'Paid in full' : fmt(amountDue)}</td>
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
              <p style="margin:0;font-size:11px;color:#9ca3af;">Questions? Email us at <a href="mailto:contact@fsarchitects.ph" style="color:#9ca3af;">contact@fsarchitects.ph</a> · © ${new Date().getFullYear()} FS Architects</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: toList,
        ...(ccList.length > 0 ? { cc: ccList } : {}),
        bcc: ['contact@fsarchitects.ph'],
        subject: subject ?? `Invoice #${String(invoice_number).padStart(4, '0')} — ${project_name}`,
        html,
      }),
    });
    clearTimeout(timeout);

    const resBody = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: resBody?.message ?? 'Failed to send email' }), { status: 200, headers: cors });
    }

    const logPayload = {
      invoice_number: String(invoice_number),
      project_id: project_id ?? null,
      client_name,
      project_name,
      sent_to: toList.join(', '),
      sent_cc: ccList.length > 0 ? ccList.join(', ') : null,
      subject: subject ?? null,
      contract_price: lineItemsTotal,
      total_paid: totalPaid,
      balance: amountDue,
      line_items: lineItems,
      show_payments: showPayments,
      sent_at: new Date().toISOString(),
    };

    if (existing_invoice_log_id) {
      await supabase.from('hub_invoice_log').update(logPayload).eq('id', existing_invoice_log_id);
    } else {
      await supabase.from('hub_invoice_log').insert(logPayload);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
