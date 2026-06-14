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
    const { task_id, task_title, project_id, project_name, assigned_to_id, assigned_to_ids, assigned_by_name } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const normalizedAssigneeIds = [...new Set(
      [
        ...(Array.isArray(assigned_to_ids) ? assigned_to_ids : []),
        assigned_to_id,
      ].filter(Boolean)
    )];

    if (normalizedAssigneeIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no assignees' }), { headers: cors });
    }

    // Fetch assignee details
    const { data: assignees } = await supabase
      .from('hub_users')
      .select('id, full_name, email, slack_id')
      .in('id', normalizedAssigneeIds);

    if (!assignees || assignees.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'assignee not found' }), { headers: cors });
    }

    const deepLink = `${HUB_URL}?workspace=${project_id}&task=${task_id}`;

    for (const assignee of assignees) {
      await supabase.from('hub_notifications').insert({
        user_id: assignee.id,
        type: 'task_assigned',
        title: 'New task assigned',
        body: `${assigned_by_name} assigned you "${task_title}" on ${project_name}`,
        link: deepLink,
        read: false,
      }).catch(() => {});

      if (assignee.slack_id && SLACK_BOT_TOKEN) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: assignee.slack_id,
            text: `🎯 *You've been assigned a task*\n*Task:* ${task_title}\n*Project:* ${project_name}\n*Assigned by:* ${assigned_by_name}\n<${deepLink}|Open in Sentro Hub →>`,
          }),
        }).catch(() => {});
      }

      await sendPush(assignee.id, 'New task assigned', `${assigned_by_name} assigned you "${task_title}" on ${project_name}`, deepLink);
    }

    return new Response(JSON.stringify({ ok: true, task_id, notified: assignees.length, project_id }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
