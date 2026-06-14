import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'payroll@fsarchitects.ph';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const HUB_URL = `${HUB_BASE_URL}/hub/login`;

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

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function fmt(val: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
}

async function sendNotification(payout_id: string, type: 'hr_approved' | 'dispute_resolved') {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: payout } = await supabase
    .from('hub_payouts')
    .select('*')
    .eq('id', payout_id)
    .single();

  if (!payout) return;

  const { data: contractor } = await supabase
    .from('hub_users')
    .select('full_name, email, department, slack_id')
    .eq('id', payout.contractor_id)
    .single();

  if (!contractor || !contractor.email) return;

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const periodStart = new Date(payout.cutoff_start);
  const periodEnd = new Date(payout.cutoff_end);
  const calendarEndDay = periodStart.getDate() >= 16
    ? new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 0).getDate()
    : periodEnd.getDate();
  const periodLabel = periodStart.getMonth() === periodEnd.getMonth()
    ? `${months[periodStart.getMonth()]} ${periodStart.getDate()}–${calendarEndDay}, ${periodStart.getFullYear()}`
    : `${months[periodStart.getMonth()]} ${periodStart.getDate()} – ${months[periodEnd.getMonth()]} ${calendarEndDay}, ${periodStart.getFullYear()}`;

  const slackPost = async (path: string, body: unknown) => {
    const res = await fetch(`https://slack.com/api/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      console.error(`Slack API failed: ${path}`, { status: res.status, response: json });
      throw new Error(`Slack API failed: ${path} - ${json.error ?? res.status}`);
    }
    return json;
  };

  if (type === 'hr_approved') {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#111827;padding:24px 32px;">
      <p style="color:#FF6B35;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">FS Architects</p>
      <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;">Payslip Approved</h1>
      <p style="color:#6b7280;font-size:13px;margin:6px 0 0;">Payment is on its way</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:14px;color:#374151;margin:0 0 20px;">Hi <strong>${contractor.full_name}</strong>, your payslip for <strong>${periodLabel}</strong> has been approved by HR. Payment will be sent within 2 business days.</p>
      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:10px;overflow:hidden;">
        <tr><td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Pay Period</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827;">${periodLabel}</p>
        </td></tr>
        <tr><td style="padding:14px 16px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Amount</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#FF6B35;">${fmt(payout.final_payout)}</p>
        </td></tr>
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="${HUB_URL}" style="display:inline-block;background:#111827;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">View in Sentro Hub →</a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#d1d5db;margin:0;text-align:center;">© ${new Date().getFullYear()} FS Architects · payroll@fsarchitects.ph</p>
    </div>
  </div>
</body>
</html>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `FS Architects <${FROM_EMAIL}>`,
        to: contractor.email,
        subject: `Your payslip is approved — ${periodLabel} | Payment incoming`,
        html,
      }),
    });

    if (SLACK_BOT_TOKEN && contractor.slack_id) {
      try {
        const dm = await slackPost('conversations.open', { users: contractor.slack_id });
        await slackPost('chat.postMessage', {
          channel: dm.channel.id,
          text: `✅ *Payslip approved!* Your payslip for *${periodLabel}* (${fmt(payout.final_payout)}) has been approved by HR. Payment will be sent within 2 business days.`,
        });
      } catch (slackErr) {
        console.error('Slack DM failed (hr_approved):', slackErr);
      }
    }
    await sendPush(payout.contractor_id, 'Payslip Approved', `Your payslip for ${periodLabel} (${fmt(payout.final_payout)}) has been approved. Payment incoming.`, HUB_URL);
  }

  if (type === 'dispute_resolved') {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#111827;padding:24px 32px;">
      <p style="color:#FF6B35;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">FS Architects</p>
      <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;">Dispute Resolved</h1>
      <p style="color:#6b7280;font-size:13px;margin:6px 0 0;">HR has reviewed your flag</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:14px;color:#374151;margin:0 0 20px;">Hi <strong>${contractor.full_name}</strong>, your payslip dispute for <strong>${periodLabel}</strong> has been reviewed and resolved by HR. If you have further concerns, reach out on Slack.</p>
      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:10px;overflow:hidden;">
        <tr><td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Pay Period</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827;">${periodLabel}</p>
        </td></tr>
        <tr><td style="padding:14px 16px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Amount</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#FF6B35;">${fmt(payout.final_payout)}</p>
        </td></tr>
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="${HUB_URL}" style="display:inline-block;background:#111827;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">View in Sentro Hub →</a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#d1d5db;margin:0;text-align:center;">© ${new Date().getFullYear()} FS Architects · payroll@fsarchitects.ph</p>
    </div>
  </div>
</body>
</html>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `FS Architects <${FROM_EMAIL}>`,
        to: contractor.email,
        subject: `Your payslip dispute has been resolved — ${periodLabel}`,
        html,
      }),
    });

    if (SLACK_BOT_TOKEN && contractor.slack_id) {
      try {
        const dm = await slackPost('conversations.open', { users: contractor.slack_id });
        await slackPost('chat.postMessage', {
          channel: dm.channel.id,
          text: `🔔 *Dispute resolved* — Your payslip flag for *${periodLabel}* has been reviewed and resolved by HR. Questions? Reach out on Slack.`,
        });
      } catch (slackErr) {
        console.error('Slack DM failed (dispute_resolved):', slackErr);
      }
    }
    await sendPush(payout.contractor_id, 'Dispute Resolved', `Your payslip dispute for ${periodLabel} has been reviewed and resolved by HR.`, HUB_URL);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { payout_id, type } = await req.json();
    if (!payout_id || !type) return new Response(JSON.stringify({ error: 'payout_id and type required' }), { status: 400, headers: cors });
    if (type !== 'hr_approved' && type !== 'dispute_resolved') {
      return new Response(JSON.stringify({ error: 'type must be hr_approved or dispute_resolved' }), { status: 400, headers: cors });
    }

    const payout_id_str = String(payout_id);
    // @ts-ignore
    EdgeRuntime.waitUntil((async () => {
      try {
        await sendNotification(payout_id_str, type);
      } catch (error) {
        console.error('notify-contractor background task failed', { payout_id: payout_id_str, type, error });
      }
    })());

    return new Response(JSON.stringify({ ok: true, queued: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
