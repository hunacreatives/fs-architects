import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const HUB_URL = 'https://www.hunacreatives.com/hub/contractor/projects';

async function sendPush(user_id: string, title: string, body: string, url?: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, title, body, url }),
    });
  } catch {}
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { comment_id, task_id, author_id, body, project_id } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Extract @mentions (first name, case-insensitive)
    const mentions = [...body.matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase());
    if (!mentions.length) return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: cors });

    // Fetch all hub_users for this project to match mentions
    const { data: contractors } = await supabase
      .from('hub_project_contractors')
      .select('hub_users(id, full_name, slack_id, email)')
      .eq('project_id', project_id);

    const teamMembers = (contractors ?? [])
      .map((c: any) => Array.isArray(c.hub_users) ? c.hub_users[0] : c.hub_users)
      .filter(Boolean);

    // Fetch author name
    const { data: author } = await supabase
      .from('hub_users')
      .select('full_name')
      .eq('id', author_id)
      .single();

    const authorName = author?.full_name ?? 'Someone';

    // Fetch task title
    const { data: task } = await supabase
      .from('hub_project_tasks')
      .select('title')
      .eq('id', task_id)
      .single();

    const taskTitle = task?.title ?? 'a task';

    // Notify each mentioned user
    for (const mention of mentions) {
      const mentioned = teamMembers.find((m: any) =>
        m.full_name?.split(' ')[0]?.toLowerCase() === mention
      );
      if (!mentioned || mentioned.id === author_id) continue;

      // In-app notification
      await supabase.from('hub_notifications').insert({
        user_id: mentioned.id,
        type: 'task_mention',
        title: `${authorName} mentioned you`,
        body: `In "${taskTitle}": ${body.slice(0, 100)}`,
        link: HUB_URL,
        read: false,
      }).catch(() => {});

      // Slack DM if they have a slack_id
      if (mentioned.slack_id && SLACK_BOT_TOKEN) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: mentioned.slack_id,
            text: `💬 *${authorName}* mentioned you in a task comment on *"${taskTitle}"*:\n> ${body.slice(0, 200)}\n<${HUB_URL}|Open in Sentro Hub →>`,
          }),
        }).catch(() => {});
      }
      await sendPush(mentioned.id, `${authorName} mentioned you`, `In "${taskTitle}": ${body.slice(0, 100)}`, HUB_URL);
    }

    return new Response(JSON.stringify({ ok: true, mentions }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
