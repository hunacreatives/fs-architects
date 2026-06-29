import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') ?? 'suraltafretz@gmail.com';
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? 'fyu.fsarchitects@gmail.com';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'payroll@fsarchitects.ph';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const PAYROLL_URL = `${HUB_BASE_URL}/hub/admin/payroll`;

async function sendPush(user_id: string, title: string, body: string, url?: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, title, body, url }),
    });
  } catch (err) {
    console.error('sendPush failed:', err);
  }
}

async function slackDm(userId: string, text: string) {
  const opened = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: userId }),
  });
  const openedJson = await opened.json();
  const channel = openedJson.ok ? openedJson.channel?.id : userId;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  });
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function sendNotification(batch_id: string, type: 'fund_request' | 'fund_approved') {
  console.log('sendNotification started for batch:', batch_id, 'type:', type);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: batch, error } = await supabase
    .from('hub_payroll_batches')
    .select('*')
    .eq('id', batch_id)
    .single();

  if (error || !batch) { console.error('batch not found:', error); return; }

  const total = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(batch.total_amount);
  const payrollUrl = `${HUB_BASE_URL}/hub/login`;

  let to: string;
  let subject: string;
  let heading: string;
  let subheading: string;
  let bodyText: string;
  let ctaLabel: string;

  if (type === 'fund_request') {
    let requestedBy = 'HR Admin';
    if (batch.requested_by) {
      const { data: u } = await supabase.from('hub_users').select('full_name').eq('id', batch.requested_by).single();
      if (u?.full_name) requestedBy = u.full_name;
    }
    to = OWNER_EMAIL;
    subject = `Action Required: Fund Transfer ${batch.period_label} — ${total}`;
    heading = 'Fund Transfer Request';
    subheading = 'Your approval is needed';
    bodyText = `<strong>${requestedBy}</strong> has submitted a fund transfer request for payroll period <strong>${batch.period_label}</strong> and is awaiting your approval.`;
    ctaLabel = 'Review &amp; Approve →';
  } else {
    let approvedBy = 'Owner';
    if (batch.approved_by) {
      const { data: u } = await supabase.from('hub_users').select('full_name').eq('id', batch.approved_by).single();
      if (u?.full_name) approvedBy = u.full_name;
    }
    to = ADMIN_EMAIL;
    subject = `Funds approved — ${batch.period_label} | ${total}`;
    heading = 'Fund Transfer Approved';
    subheading = 'Proceed with contractor payments';
    bodyText = `<strong>${approvedBy}</strong> has approved the fund transfer for payroll period <strong>${batch.period_label}</strong>. You can now proceed to mark contractors as paid.`;
    ctaLabel = 'Go to Payroll →';
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <div style="background:#111827;padding:24px 32px;">
      <p style="color:#1c2b3a;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">FS Architects</p>
      <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;">${heading}</h1>
      <p style="color:#6b7280;font-size:13px;margin:6px 0 0;">${subheading}</p>
    </div>

    <div style="padding:28px 32px;">
      <p style="font-size:14px;color:#374151;margin:0 0 20px;">${bodyText}</p>

      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Pay Period</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827;">${batch.period_label}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Employees</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827;">${batch.contractor_count} employee${batch.contractor_count !== 1 ? 's' : ''}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Total Amount</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#1c2b3a;">${total}</p>
          </td>
        </tr>
      </table>

      <div style="margin-top:24px;text-align:center;">
        <a href="${payrollUrl}" style="display:inline-block;background:#111827;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">${ctaLabel}</a>
      </div>
    </div>

    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#d1d5db;margin:0;text-align:center;">© ${new Date().getFullYear()} FS Architects · payroll@fsarchitects.ph</p>
    </div>

  </div>
</body>
</html>`;

  console.log('Sending', type, 'notification to:', to);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `FS Architects <${FROM_EMAIL}>`, to, subject, html }),
  });

  const result = await res.json();
  if (!res.ok) {
    console.error('Resend error:', JSON.stringify(result));
  } else {
    console.log('Notification sent:', result.id);
  }

  // Slack DM to owner for fund_request
  if (type === 'fund_request' && SLACK_BOT_TOKEN) {
    try {
      const { data: owner } = await supabase.from('hub_users').select('id, slack_id').eq('role', 'owner').single();
      if (owner?.slack_id) {
        const totalFmt = '₱' + (batch.total_amount as number).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const contractorCount = batch.contractor_count;
        await slackDm(
          owner.slack_id,
          `💰 *Fund transfer request — ${batch.period_label}*\nHR has approved payroll for *${contractorCount} employee${contractorCount !== 1 ? 's' : ''}* totalling *${totalFmt}*. Please review and process the transfer.`,
        );
      }
      if (owner?.id) {
        await sendPush(owner.id, 'Fund transfer needed', `HR has approved payroll for ${batch.period_label} (${total}). Review and confirm the transfer.`, PAYROLL_URL);
      }
    } catch (_) { /* non-fatal */ }
  }

  if (type === 'fund_approved') {
    try {
      const { data: admins } = await supabase.from('hub_users').select('id, slack_id').in('role', ['admin', 'hr']).eq('status', 'active');
      const totalFmt = '₱' + (batch.total_amount as number).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      for (const admin of admins || []) {
        if (admin.slack_id) {
          await slackDm(admin.slack_id, `✅ *Fund transfer approved — ${batch.period_label}*\nThe owner has approved the ${totalFmt} transfer. Proceed with marking employees as paid.`).catch(() => {});
        }
        if (admin.id) {
          await sendPush(admin.id, 'Funds approved', `The owner approved the transfer for ${batch.period_label} (${totalFmt}). Proceed with payments.`, PAYROLL_URL);
        }
      }
    } catch (_) { /* non-fatal */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { batch_id, type } = await req.json();
    if (!batch_id) return new Response(JSON.stringify({ error: 'batch_id required' }), { status: 400, headers: cors });

    const notifType = type === 'fund_approved' ? 'fund_approved' : 'fund_request';
    // @ts-ignore
    EdgeRuntime.waitUntil((async () => {
      try {
        await sendNotification(String(batch_id), notifType);
      } catch (error) {
        console.error('notify-owner background task failed', { batch_id, type: notifType, error });
      }
    })());

    return new Response(JSON.stringify({ ok: true, queued: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
