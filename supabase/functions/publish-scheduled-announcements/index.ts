import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const CHANNELS = ['C0830PCJB4P', 'C0830PCGQK1'];

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
  const postedBy = posterName ? `Posted by *${posterName}*` : 'Posted via Huna Hub';
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel,
      text: `${pEmoji} ${title}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `${pEmoji} ${title}`, emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: body } },
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

  // Post each to Slack
  for (const a of due) {
    const posterName = (a.hub_users as any)?.full_name;
    await Promise.all(CHANNELS.map(ch => postToSlack(ch, a.title, a.body, a.priority, a.category, posterName)));
  }

  return new Response(JSON.stringify({ ok: true, published: due.length }), { headers: cors });
});
