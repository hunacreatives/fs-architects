const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const CHANNELS = ['C0830PCJB4P', 'C0830PCGQK1', 'C0BBA4Q18Q0'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const priorityEmoji: Record<string, string> = {
  urgent: '🚨',
  important: '⚠️',
  normal: '📢',
};

const categoryEmoji: Record<string, string> = {
  payroll: '💰',
  meeting: '📅',
  holiday: '🎉',
  policy: '📋',
  general: '📌',
};

async function postToSlack(channel: string, title: string, body: string, priority: string, category: string, posterName?: string) {
  const pEmoji = priorityEmoji[priority] ?? '📢';
  const cEmoji = categoryEmoji[category] ?? '📌';
  const postedBy = posterName ? `Posted by *${posterName}*` : 'Posted via Sentro Hub';

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${pEmoji} ${title}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: body },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${cEmoji} *${category.charAt(0).toUpperCase() + category.slice(1)}* · ${postedBy}` },
      ],
    },
  ];

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, blocks, text: `${pEmoji} ${title}` }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { title, body, priority = 'normal', category = 'general', poster_name } = await req.json();
    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title and body required' }), { status: 400, headers: cors });
    }

    await Promise.all(CHANNELS.map(ch => postToSlack(ch, title, body, priority, category, poster_name)));

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
