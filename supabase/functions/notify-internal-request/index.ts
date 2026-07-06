import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

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

// Writes the in-app hub_notifications row (bell + Audit Log archive) for every
// active owner/admin/hr user, then pushes to each via send-push. Previously
// this only sent a raw push notification with no DB row, so request
// submissions never showed up in the bell or Audit Log Notifications tab.
async function notifyHubAdmins(notifType: string, title: string, body: string, path: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const usersRes = await fetch(`${SUPABASE_URL}/rest/v1/hub_users?select=id&status=eq.active&role=in.(owner,admin,hr)`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  }).catch(() => null);
  const users: { id: string }[] = usersRes?.ok ? await usersRes.json().catch(() => []) : [];
  if (!users.length) return;

  await fetch(`${SUPABASE_URL}/rest/v1/hub_notifications`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(users.map((u) => ({ user_id: u.id, type: notifType, title, body, link: path, read: false }))),
  }).catch(() => {});

  await Promise.all(
    users.map((user) =>
      fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, title, body, url: path }),
      }).catch(() => {})
    )
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { type, contractor_name, detail, notes } = await req.json();

    if (!type || !contractor_name) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 200, headers: cors });
    }

    const typeMap: Record<string, { emoji: string; label: string; path: string }> = {
      doc_request:        { emoji: '📄', label: 'Document Request',          path: '/hub/admin/docrequests' },
      credential_request: { emoji: '🔑', label: 'Credential Access Request', path: '/hub/admin/credentials' },
      contract_signed:    { emoji: '✍️', label: 'Contract Signed',           path: '/hub/admin/documents' },
      time_off:           { emoji: '🌴', label: 'Time Off Request',          path: '/hub/admin/timeoff' },
      overtime:           { emoji: '⏰', label: 'Overtime Request',          path: '/hub/admin/overtime' },
      payment_verified:   { emoji: '✅', label: 'Payment Verified',          path: '/hub/admin/invoice-log' },
    };
    const { emoji, label, path } = typeMap[type] ?? { emoji: '📋', label: type, path: '/hub/admin' };

    const text = `${emoji} *${label}* from *${contractor_name}*${detail ? `\n${detail}` : ''}${notes ? `\n_${notes}_` : ''}`;
    const pushBody = detail ? `${contractor_name}: ${detail}` : `${contractor_name} sent a ${label.toLowerCase()}.`;

    // Lookup active owners, admins, and HR for Slack DMs
    if (SLACK_BOT_TOKEN) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: adminUsers } = await supabase
        .from('hub_users')
        .select('slack_id')
        .in('role', ['owner', 'admin', 'hr'])
        .eq('status', 'active');

      await Promise.all(
        (adminUsers ?? [])
          .filter((u: any) => u.slack_id)
          .map((u: any) => slackDm(u.slack_id, text).catch(() => {}))
      );
    }

    await notifyHubAdmins(type, label, pushBody, path);

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
