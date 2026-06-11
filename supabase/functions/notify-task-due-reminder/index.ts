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

function getPHTDate(offsetDays = 0): string {
  const d = new Date(Date.now() + (8 * 60 * 60 * 1000) + (offsetDays * 86400000));
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const today = getPHTDate(0);
    const tomorrow = getPHTDate(1);

    // Query tasks due today or tomorrow, not done, with an assignee
    const { data: tasks, error } = await supabase
      .from('hub_project_tasks')
      .select('id, title, due_date, assigned_to, project_id, hub_projects(project_name)')
      .in('due_date', [today, tomorrow])
      .not('status', 'eq', 'done')
      .not('assigned_to', 'is', null);

    if (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: cors });
    }

    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, notified: 0 }), { headers: cors });
    }

    let notified = 0;

    for (const task of tasks) {
      const projectRow = Array.isArray(task.hub_projects) ? task.hub_projects[0] : task.hub_projects;
      const projectName = (projectRow as any)?.project_name ?? 'your project';
      const isToday = task.due_date === today;
      const whenLabel = isToday ? 'today' : 'tomorrow';

      // Fetch assignee
      const { data: assignee } = await supabase
        .from('hub_users')
        .select('id, full_name, email, slack_id')
        .eq('id', task.assigned_to)
        .single();

      if (!assignee) continue;

      // In-app notification
      await supabase.from('hub_notifications').insert({
        user_id: task.assigned_to,
        type: 'task_due_reminder',
        title: `Task due ${whenLabel}`,
        body: `"${task.title}" is due ${whenLabel} — ${projectName}`,
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
            text: `⏰ *Task due ${whenLabel}*\n*"${task.title}"* — ${projectName}\n<${HUB_URL}|Open workspace →>`,
          }),
        }).catch(() => {});
      }

      await sendPush(task.assigned_to, `Task due ${whenLabel}`, `"${task.title}" is due ${whenLabel} — ${projectName}`, HUB_URL);
      notified++;
    }

    return new Response(JSON.stringify({ ok: true, notified, today, tomorrow }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
