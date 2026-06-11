const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const NOTIFY_USERS = ['U091BL9PQ77', 'U0838LWSY4E']; // Abigail, Francis

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { type, contractor_name, detail, notes } = await req.json();
    // type: 'doc_request' | 'credential_request'

    if (!type || !contractor_name) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 200, headers: cors });
    }

    const typeMap: Record<string, { emoji: string; label: string; url: string; btnLabel: string }> = {
      doc_request:      { emoji: '📄', label: 'Document Request',         url: 'https://hunacreatives.com/hub/admin/docrequests',  btnLabel: 'View Doc Requests →' },
      credential_request: { emoji: '🔑', label: 'Credential Access Request', url: 'https://hunacreatives.com/hub/admin/credentials', btnLabel: 'View Credential Requests →' },
      contract_signed:  { emoji: '✍️',  label: 'Contract Signed',          url: 'https://hunacreatives.com/hub/admin/documents',        btnLabel: 'View Documents →' },
      time_off:         { emoji: '🌴', label: 'Time Off Request',          url: 'https://hunacreatives.com/hub/admin/timeoff',          btnLabel: 'View Time Off →' },
      overtime:         { emoji: '⏰', label: 'Overtime Request',          url: 'https://hunacreatives.com/hub/admin/overtime',         btnLabel: 'View Overtime →' },
      payment_verified: { emoji: '✅', label: 'Payment Verified',          url: 'https://hunacreatives.com/hub/admin/invoice-log',      btnLabel: 'View Invoice Log →' },
    };
    const { emoji, label, url, btnLabel } = typeMap[type] ?? { emoji: '📋', label: type, url: 'https://hunacreatives.com/hub/admin', btnLabel: 'View Hub →' };

    const text = `${emoji} *${label}* from *${contractor_name}*${detail ? `\n> ${detail}` : ''}${notes ? `\n> _${notes}_` : ''}`;

    await Promise.all(NOTIFY_USERS.map(async (userId) => {
      const opened = await slackPost('conversations.open', { users: userId });
      const channel = opened.ok ? opened.channel?.id : userId;
      await slackPost('chat.postMessage', {
        channel,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text } },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: btnLabel, emoji: true },
                url,
                style: 'primary',
              },
            ],
          },
        ],
      });
    }));

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
