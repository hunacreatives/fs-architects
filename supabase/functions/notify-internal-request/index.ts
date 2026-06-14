const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const NOTIFY_USERS = ['U091BL9PQ77', 'U0838LWSY4E']; // Abigail, Francis
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

async function pushToHubAdmins(title: string, body: string, url: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;

  const usersRes = await fetch(`${SUPABASE_URL}/rest/v1/hub_users?select=id&status=eq.active&role=in.(owner,admin,hr)`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }).catch(() => null);

  const users = usersRes?.ok ? await usersRes.json().catch(() => []) : [];
  await Promise.all(
    (users ?? []).map((user: { id: string }) =>
      fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, title, body, url }),
      }).catch(() => {})
    )
  );
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
      doc_request:      { emoji: '📄', label: 'Document Request',         url: 'https://fsarchitects.ph/hub/admin/docrequests',  btnLabel: 'View Doc Requests →' },
      credential_request: { emoji: '🔑', label: 'Credential Access Request', url: 'https://fsarchitects.ph/hub/admin/credentials', btnLabel: 'View Credential Requests →' },
      contract_signed:  { emoji: '✍️',  label: 'Contract Signed',          url: 'https://fsarchitects.ph/hub/admin/documents',        btnLabel: 'View Documents →' },
      time_off:         { emoji: '🌴', label: 'Time Off Request',          url: 'https://fsarchitects.ph/hub/admin/timeoff',          btnLabel: 'View Time Off →' },
      overtime:         { emoji: '⏰', label: 'Overtime Request',          url: 'https://fsarchitects.ph/hub/admin/overtime',         btnLabel: 'View Overtime →' },
      payment_verified: { emoji: '✅', label: 'Payment Verified',          url: 'https://fsarchitects.ph/hub/admin/invoice-log',      btnLabel: 'View Invoice Log →' },
    };
    const { emoji, label, url, btnLabel } = typeMap[type] ?? { emoji: '📋', label: type, url: 'https://fsarchitects.ph/hub/admin', btnLabel: 'View Hub →' };

    const text = `${emoji} *${label}* from *${contractor_name}*${detail ? `\n> ${detail}` : ''}${notes ? `\n> _${notes}_` : ''}`;
    const pushTitle = `${label}`;
    const pushBody = detail
      ? `${contractor_name}: ${detail}`
      : `${contractor_name} sent a ${label.toLowerCase()}.`;

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

    await pushToHubAdmins(pushTitle, pushBody, url);

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
