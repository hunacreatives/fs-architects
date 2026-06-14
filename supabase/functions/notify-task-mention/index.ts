const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN');
const HUB_URL = 'https://www.hunacreatives.com/hub/contractor/projects';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const db = {
  headers: {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  },
};

async function pgGet(table: string, params: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: db.headers });
  if (!res.ok) throw new Error(`pgGet ${table}: ${await res.text()}`);
  return res.json();
}

async function pgInsert(table: string, body: object): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: db.headers,
    body: JSON.stringify(body),
  });
}

async function sendPush(user_id: string, title: string, body: string, url?: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, title, body, url }),
    });
  } catch {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { task_id, author_id, author_name, body, project_id } = await req.json();

    if (!body || typeof body !== 'string') {
      return new Response(JSON.stringify({ ok: true, skipped: 'no body' }), { headers: CORS });
    }

    const mentions = [...body.matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase());
    if (!mentions.length) return new Response(JSON.stringify({ ok: true, skipped: 'no mentions' }), { headers: CORS });

    // Fetch project contractors
    const pcRows = await pgGet('hub_project_contractors', `select=contractor_id&project_id=eq.${project_id}`);
    const contractorIds: string[] = pcRows.map((r: any) => r.contractor_id);

    // Fetch contractors + admins
    const [contractors, admins] = await Promise.all([
      contractorIds.length > 0
        ? pgGet('hub_users', `select=id,full_name,slack_id&id=in.(${contractorIds.join(',')})`)
        : Promise.resolve([]),
      pgGet('hub_users', `select=id,full_name,slack_id&role=in.(admin,owner)`),
    ]);

    const seen = new Set<string>();
    const team = [...contractors, ...admins].filter((u: any) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    // Fetch task title
    const tasks = await pgGet('hub_project_tasks', `select=title&id=eq.${task_id}`);
    const taskTitle = tasks[0]?.title ?? 'a task';

    for (const mention of mentions) {
      const mentioned = team.find((m: any) =>
        (m.full_name ?? '').toLowerCase().split(' ').some((p: string) => p === mention)
      );
      if (!mentioned || mentioned.id === author_id) continue;

      const deepLink = `${HUB_URL}?workspace=${project_id}&task=${task_id}`;

      await pgInsert('hub_notifications', {
        user_id: mentioned.id,
        type: 'task_mention',
        title: `${author_name} mentioned you`,
        body: `In "${taskTitle}": ${body.slice(0, 100)}`,
        link: deepLink,
        read: false,
      });

      if (mentioned.slack_id && SLACK_BOT_TOKEN) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: mentioned.slack_id,
            text: `💬 *${author_name}* mentioned you in *"${taskTitle}"*:\n> ${body.slice(0, 200)}\n<${deepLink}|Open in Sentro Hub →>`,
          }),
        }).catch(() => {});
      }

      await sendPush(mentioned.id, `${author_name} mentioned you`, `In "${taskTitle}": ${body.slice(0, 100)}`, deepLink);
    }

    return new Response(JSON.stringify({ ok: true, mentions }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
