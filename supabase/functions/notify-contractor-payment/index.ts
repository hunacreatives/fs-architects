import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'billing@fsarchitects.ph';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const HUB_URL = `${HUB_BASE_URL}/hub/employee/payouts`;

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

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const {
      to,
      contractor_id,
      contractor_name,
      project_name,
      period_label,
      client_name,
      amount,
      paid_at,
      notes,
      receipt_url,
      total_paid,
      total_cut,
      is_fully_paid,
    } = await req.json();

    if (!to || !contractor_name || !project_name || !amount) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: cors });
    }

    const SUPABASE_URL_LOCAL = Deno.env.get('SUPABASE_URL')!;
    const LOGO_URL = Deno.env.get('LOGO_URL') ?? `${SUPABASE_URL_LOCAL}/storage/v1/object/public/brand/fs-architects-logo.jpg`;
    const logoUrl = LOGO_URL;
    const dateStr = new Date(paid_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const paidPct = total_cut > 0 ? Math.min(Math.round((total_paid / total_cut) * 100), 100) : 0;
    const remaining = Math.max(total_cut - total_paid, 0);

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
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:24px 36px;">
              <img src="${logoUrl}" alt="FS Architects" height="32" style="display:block;" />
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="padding:32px 36px 24px;border-bottom:1px solid #f3f4f6;">
              <div style="width:48px;height:48px;background:#ecfdf5;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
                <span style="font-size:24px;">💸</span>
              </div>
              <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#111827;">Payment received</h1>
              <p style="margin:0;font-size:14px;color:#6b7280;">Hi ${contractor_name}, you've got a new payout from FS Architects.</p>
            </td>
          </tr>

          <!-- Payment detail -->
          <tr>
            <td style="padding:24px 36px;border-bottom:1px solid #f3f4f6;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom:16px;">
                    <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;font-weight:600;">Amount paid</p>
                    <p style="margin:0;font-size:32px;font-weight:800;color:#059669;">${fmt(amount)}</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${dateStr}</p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
                    <p style="margin:0 0 2px;font-size:13px;font-weight:600;color:#111827;">${project_name}</p>
                    <p style="margin:0;font-size:12px;color:#6b7280;">${client_name}</p>
                    ${notes ? `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af;font-style:italic;">${notes}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Running total -->
          <tr>
            <td style="padding:24px 36px ${receipt_url ? '0' : '28px'};">
              <p style="margin:0 0 10px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;font-weight:600;">Your payout progress</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:5px 0;font-size:13px;color:#6b7280;">Total fee</td>
                  <td style="padding:5px 0;font-size:13px;color:#6b7280;text-align:right;">${fmt(total_cut)}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;font-size:13px;color:#6b7280;">Received so far</td>
                  <td style="padding:5px 0;font-size:13px;font-weight:600;color:#059669;text-align:right;">${fmt(total_paid)}</td>
                </tr>
                ${!is_fully_paid ? `
                <tr>
                  <td style="padding:5px 0;font-size:13px;color:#6b7280;">Remaining</td>
                  <td style="padding:5px 0;font-size:13px;color:#1c2b3a;font-weight:600;text-align:right;">${fmt(remaining)}</td>
                </tr>` : ''}
              </table>
              <!-- Progress bar -->
              <div style="margin-top:10px;background:#f3f4f6;border-radius:99px;height:6px;overflow:hidden;">
                <div style="background:${is_fully_paid ? '#059669' : '#f59e0b'};height:6px;width:${paidPct}%;border-radius:99px;"></div>
              </div>
              <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">${paidPct}% of your total fee received${is_fully_paid ? ' · Paid in full 🎉' : ''}</p>
            </td>
          </tr>

          ${receipt_url ? `
          <!-- Receipt -->
          <tr>
            <td style="padding:16px 36px 28px;">
              <a href="${receipt_url}" target="_blank"
                style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#f3f4f6;border-radius:8px;font-size:12px;color:#374151;text-decoration:none;font-weight:500;">
                🧾 View receipt
              </a>
            </td>
          </tr>` : ''}

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 36px;text-align:center;">
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
        subject: `You've been paid ${fmt(amount)} — ${project_name}`,
        html,
      }),
    });

    const resBody = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: resBody?.message ?? 'Failed to send' }), { status: 200, headers: cors });
    }

    // Slack DM to contractor
    if (SLACK_BOT_TOKEN) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        let slackId: string | null = null;
        if (contractor_id) {
          const { data: u } = await supabase.from('hub_users').select('slack_id').eq('id', contractor_id).single();
          slackId = u?.slack_id ?? null;
        } else if (to) {
          const { data: u } = await supabase.from('hub_users').select('slack_id').eq('email', to.toLowerCase()).single();
          slackId = u?.slack_id ?? null;
        }
        if (slackId) {
          const amountFmt = '₱' + (amount as number).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const periodText = period_label ? ` · ${period_label}` : '';
          await slackDm(slackId, `💸 *Payment received*\n${amountFmt} has been sent for *${project_name}*${periodText}.\nPlease check your account. Reach out if anything looks off.\n<${HUB_URL}|Open Hub →>`);
        }
      } catch (_) { /* non-fatal */ }
    }

    if (contractor_id) {
      const amountFmt = '₱' + (amount as number).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const periodText = period_label ? ` · ${period_label}` : '';
      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: contractor_id, title: 'Payment received', body: `${amountFmt} has been sent for ${project_name}${periodText}.`, url: HUB_URL }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
