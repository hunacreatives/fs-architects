import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const HUB_URL = '/hub/employee/projects';

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
    const {
      task_id,
      project_id,
      task_title,
      project_name,
      updated_by_id,
      updated_by_name,
      change_description,
      notification_type,
    } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: task } = await supabase
      .from('hub_project_tasks')
      .select('assigned_to, assignee_ids')
      .eq('id', task_id)
      .single();

    const assigneeIds: string[] = [
      ...(task?.assigned_to ? [task.assigned_to] : []),
      ...((task?.assignee_ids as string[]) ?? []),
    ];

    // Owners see everything across every project. Admins only see projects
    // they're actually on the team for — otherwise every admin gets pinged
    // for every comment on every project regardless of involvement.
    const { data: owners } = await supabase
      .from('hub_users')
      .select('id, slack_id')
      .eq('role', 'owner');

    const { data: projectTeam } = await supabase
      .from('hub_project_contractors')
      .select('contractor_id')
      .eq('project_id', project_id);
    const teamIds = (projectTeam ?? []).map((r: any) => r.contractor_id);

    const { data: teamAdmins } = teamIds.length > 0
      ? await supabase.from('hub_users').select('id, slack_id').in('id', teamIds).eq('role', 'admin')
      : { data: [] as { id: string; slack_id: string | null }[] };

    const ownerIds: string[] = (owners ?? []).map((a: any) => a.id);
    const adminIds: string[] = (teamAdmins ?? []).map((a: any) => a.id);

    const toNotifyIds = [...new Set([...assigneeIds, ...ownerIds, ...adminIds])].filter(
      (id) => id !== updated_by_id
    );

    if (toNotifyIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no one to notify' }), { headers: cors });
    }

    const { data: users } = await supabase
      .from('hub_users')
      .select('id, slack_id')
      .in('id', toNotifyIds);

    const deepLink = `${HUB_URL}?workspace=${project_id}&task=${task_id}`;
    const notifTitle = 'Task updated';
    const notifBody = change_description ?? `${updated_by_name} updated "${task_title}"`;
    const notifType = notification_type ?? 'task_updated';

    await supabase.from('hub_notifications').insert(
      toNotifyIds.map((uid) => ({
        user_id: uid,
        type: notifType,
        title: notifTitle,
        body: notifBody,
        link: deepLink,
        read: false,
      }))
    );

    for (const user of users ?? []) {
      if (user.slack_id && SLACK_BOT_TOKEN) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: user.slack_id,
            text: `✏️ ${notifBody}${project_name ? `\n*Project:* ${project_name}` : ''}`,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: `✏️ ${notifBody}${project_name ? `\n*Project:* ${project_name}` : ''}` } },
              { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Task →' }, url: deepLink, style: 'primary' }] },
            ],
          }),
        }).catch(() => {});
      }

      await sendPush(user.id, notifTitle, notifBody, deepLink);
    }

    return new Response(JSON.stringify({ ok: true, notified: toNotifyIds.length }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
