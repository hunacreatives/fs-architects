import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveSlackId } from '../_shared/slack.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'info@fsarchitects.ph';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function slackPost(path: string, body: object) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function run(doc_request_id: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: req, error } = await supabase
    .from('hub_doc_requests')
    .select('*, hub_users!contractor_id(full_name, email, slack_id)')
    .eq('id', doc_request_id)
    .single();

  if (error || !req) {
    console.error('[notify-doc-request-ready] not found:', error);
    return;
  }

  const employee = (req as any).hub_users;
  if (!employee?.email) {
    console.error('[notify-doc-request-ready] no email for contractor');
    return;
  }

  const firstName = employee.full_name?.split(' ')[0] ?? employee.full_name;
  const docType = req.doc_type ?? 'your requested document';
  const hubUrl = `${HUB_BASE_URL}/hub/employee/documents`;

  // --- Slack DM ---
  const resolvedSlackId = await resolveSlackId(SLACK_BOT_TOKEN, employee.slack_id, employee.email);
  if (resolvedSlackId) {
    const dmOpen = await slackPost('conversations.open', { users: resolvedSlackId });
    const channel = dmOpen.ok ? dmOpen.channel?.id : resolvedSlackId;
    await slackPost('chat.postMessage', {
      channel,
      text: `📋 Document Ready for Pickup — ${docType}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `📋 *Document Ready for Pickup*\n${docType} — FS Architects Office, Cebu City` } },
        { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Hub →' }, url: hubUrl, style: 'primary' }] },
      ],
    });
  }

  // --- Email ---
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#334049;padding:24px 32px;">
      <p style="color:#a8b9c9;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">FS Architects</p>
      <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;">Document Ready for Pickup</h1>
      <p style="color:#a8b9c9;font-size:13px;margin:6px 0 0;">Your requested document is available at the office</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:14px;color:#374151;margin:0 0 20px;">Hi <strong>${firstName}</strong>,</p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">
        Your document request has been processed and is now ready for pickup at the FS Architects office in Cebu City.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-size:16px;">✅</span>
          <p style="margin:0;font-size:11px;color:#16a34a;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Available for Pickup</p>
        </div>
        <p style="margin:0;font-size:15px;font-weight:700;color:#111827;">${docType}</p>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#374151;">Pickup Location</p>
        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
          FS Architects Office<br />Cebu City, Philippines<br />
          <a href="mailto:info@fsarchitects.ph" style="color:#334049;">info@fsarchitects.ph</a>
        </p>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin:0;">Please bring a valid ID when claiming your document.</p>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;margin:0;text-align:center;">© ${new Date().getFullYear()} FS Architects · info@fsarchitects.ph</p>
    </div>
  </div>
</body>
</html>`;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `FS Architects <${FROM_EMAIL}>`,
      to: employee.email,
      subject: `Your document is ready for pickup — ${docType}`,
      html,
    }),
  }).then(r => r.json());
  console.log('[notify-doc-request-ready] email:', JSON.stringify(emailRes));

  await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: req.contractor_id,
      title: 'Document ready for pickup',
      body: `Your ${docType} is ready at the FS Architects office.`,
      url: hubUrl,
    }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { doc_request_id } = await req.json();
    if (!doc_request_id) return new Response(JSON.stringify({ error: 'doc_request_id required' }), { status: 400, headers: cors });
    // @ts-ignore
    EdgeRuntime.waitUntil(run(String(doc_request_id)));
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
