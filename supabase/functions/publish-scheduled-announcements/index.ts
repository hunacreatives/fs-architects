import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const CHANNEL_MAP: Record<string, string> = {
  announcements: 'C0BB58W8R1U',
  attendance: 'C0BBA4Q18Q0',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const priorityEmoji: Record<string, string> = { urgent: '🚨', important: '⚠️', normal: '📢' };
const categoryEmoji: Record<string, string> = { payroll: '💰', meeting: '📅', holiday: '🎉', policy: '📋', general: '📌' };

async function postToSlack(channel: string, title: string, body: string, priority: string, category: string, posterName?: string) {
  const pEmoji = priorityEmoji[priority] ?? '📢';
  const cEmoji = categoryEmoji[category] ?? '📌';
  const postedBy = posterName ? `Posted by *${posterName}* via Sentro Hub` : 'Posted via Sentro Hub';
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel,
      text: `${pEmoji} ${title}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `${pEmoji} ${title}`, emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: `<!channel>\n\n${body}` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `${cEmoji} *${category.charAt(0).toUpperCase() + category.slice(1)}* · ${postedBy}` }] },
      ],
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Find announcements due to publish
  const { data: due } = await supabase
    .from('hub_announcements')
    .select('*, hub_users(full_name)')
    .eq('published', false)
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', new Date().toISOString());

  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ ok: true, published: 0 }), { headers: cors });
  }

  // Publish them
  const ids = due.map((a: any) => a.id);
  await supabase.from('hub_announcements').update({ published: true }).in('id', ids);

  // In-app notifications for active contractors — parity with immediate publish.
  const { data: contractors } = await supabase
    .from('hub_users')
    .select('id')
    .eq('status', 'active')
    .eq('role', 'contractor')
    .neq('is_developer', true);
  if (contractors && contractors.length > 0) {
    const rows: any[] = [];
    for (const a of due) {
      for (const u of contractors) {
        rows.push({
          user_id: u.id,
          type: 'announcement',
          title: a.priority === 'urgent' ? '🚨 ' + a.title : a.title,
          body: (a.body ?? '').slice(0, 100),
          link: '/hub/employee/announcements',
          read: false,
        });
      }
    }
    if (rows.length > 0) await supabase.from('hub_notifications').insert(rows);
  }

  // Post each to its chosen Slack channel
  for (const a of due) {
    const posterName = (a.hub_users as any)?.full_name;
    const channel = CHANNEL_MAP[a.slack_channel as string] ?? CHANNEL_MAP.announcements;
    await postToSlack(channel, a.title, a.body, a.priority, a.category, posterName);
  }

  return new Response(JSON.stringify({ ok: true, published: due.length }), { headers: cors });
});
