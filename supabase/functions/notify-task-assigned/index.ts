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
    const { task_id, task_title, project_id, project_name, assigned_to_id, assigned_by_name } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch assignee details
    const { data: assignee } = await supabase
      .from('hub_users')
      .select('id, full_name, email, slack_id')
      .eq('id', assigned_to_id)
      .single();

    if (!assignee) {
      return new Response(JSON.stringify({ ok: true, skipped: 'assignee not found' }), { headers: cors });
    }

    // In-app notification
    await supabase.from('hub_notifications').insert({
      user_id: assigned_to_id,
      type: 'task_assigned',
      title: 'New task assigned',
      body: `${assigned_by_name} assigned you "${task_title}" on ${project_name}`,
      link: HUB_URL,
      read: false,
    }).catch(() => {});

    // Slack DM if they have a slack_id
    if (assignee.slack_id && SLACK_BOT_TOKEN) {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: assignee.slack_id,
          text: `🎯 *You've been assigned a task*\n*Task:* ${task_title}\n*Project:* ${project_name}\n*Assigned by:* ${assigned_by_name}\n<${HUB_URL}|Open in Sentro Hub →>`,
        }),
      }).catch(() => {});
    }

    await sendPush(assigned_to_id, 'New task assigned', `${assigned_by_name} assigned you "${task_title}" on ${project_name}`, HUB_URL);

    return new Response(JSON.stringify({ ok: true, task_id, assigned_to: assignee.full_name }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
