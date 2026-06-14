import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'hr@fsarchitects.ph';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const HUB_URL = `${HUB_BASE_URL}/hub/employee/documents`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function slackPost(path: string, body: object) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}


async function run(assignment_id: string) {
  console.log('[notify-contract-assigned] running for assignment:', assignment_id);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: assignment, error: aErr } = await supabase
    .from('hub_sign_assignments')
    .select('*, hub_sign_documents(title), hub_users!contractor_id(full_name, email, slack_id)')
    .eq('id', assignment_id)
    .single();

  if (aErr) console.error('[notify-contract-assigned] DB error:', aErr);
  if (!assignment) { console.error('[notify-contract-assigned] no assignment found'); return; }

  const contractor = (assignment as any).hub_users;
  const doc = (assignment as any).hub_sign_documents;

  console.log('[notify-contract-assigned] contractor:', contractor?.full_name, contractor?.email);

  if (!contractor?.email) { console.error('[notify-contract-assigned] no contractor email'); return; }

  const firstName = contractor.full_name?.split(' ')[0] ?? contractor.full_name;

  // --- Slack DM ---
  const slackUserId = contractor.slack_id ?? null;
  if (slackUserId) {
    const dmOpen = await slackPost('conversations.open', { users: slackUserId });
    const dmChannel = dmOpen.ok ? dmOpen.channel?.id : slackUserId;
    const dmResult = await slackPost('chat.postMessage', {
      channel: dmChannel,
      text: `Hi ${firstName}! You have a document waiting for your signature: *${doc?.title}*. Please sign it here: ${HUB_URL}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Hi ${firstName}! :wave: You have a document waiting for your signature.`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Document:*\n${doc?.title}` },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Sign Document →' },
              url: HUB_URL,
              style: 'primary',
            },
          ],
        },
      ],
    });
    console.log('[notify-contract-assigned] chat.postMessage result:', JSON.stringify(dmResult));
  }

  // --- Email ---
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#111827;padding:24px 32px;">
      <p style="color:#FF6B35;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">FS Architects</p>
      <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;">Document Awaiting Signature</h1>
      <p style="color:#6b7280;font-size:13px;margin:6px 0 0;">Action required — please sign at your earliest convenience</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:14px;color:#374151;margin:0 0 20px;">Hi <strong>${firstName}</strong>,</p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">
        A document has been sent to you for signature. Please review and sign it through your Sentro Hub.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Document</p>
        <p style="margin:6px 0 0;font-size:15px;font-weight:700;color:#111827;">${doc?.title}</p>
      </div>
      <div style="text-align:center;">
        <a href="${HUB_URL}" style="display:inline-block;background:#FF6B35;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">Sign Document →</a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;text-align:center;">This email is not monitored. Do not reply directly — for concerns, email <a href="mailto:contact@fsarchitects.ph" style="color:#9ca3af;">contact@fsarchitects.ph</a></p>
      <p style="font-size:11px;color:#d1d5db;margin:0;text-align:center;">© ${new Date().getFullYear()} FS Architects · hr@fsarchitects.ph</p>
    </div>
  </div>
</body>
</html>`;

  const emailResult = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `FS Architects <${FROM_EMAIL}>`,
      to: contractor.email,
      subject: `Action Required: ${doc?.title} — Please Sign`,
      html,
    }),
  }).then(r => r.json());
  console.log('[notify-contract-assigned] email result:', JSON.stringify(emailResult));

  await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: assignment.contractor_id, title: 'Document needs your signature', body: `"${doc?.title}" is waiting for your signature.`, url: HUB_URL }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { assignment_id } = await req.json();
    if (!assignment_id) return new Response(JSON.stringify({ error: 'assignment_id required' }), { status: 400, headers: cors });

    // @ts-ignore
    EdgeRuntime.waitUntil(run(String(assignment_id)));

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
