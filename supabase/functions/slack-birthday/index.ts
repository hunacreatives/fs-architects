import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_CHANNEL = Deno.env.get('SLACK_ANNOUNCEMENTS_CHANNEL_ID') ?? 'C0BB58W8R1U';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const BIRTHDAY_GIFS = [
  'https://media.giphy.com/media/g5R9dok94mrIvplmZd/giphy.gif',
  'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
];

const FALLBACK_COPY = (name: string) => ({
  headline: `Happy Birthday, ${name}! 🎉`,
  body: `Today we celebrate you, ${name}! Thank you for everything you bring to the FS Architects team — your hard work, your energy, and your dedication make a real difference. Wishing you an amazing birthday surrounded by people you love. 🧡`,
});


async function checkAndPost(): Promise<any> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get today's month/day in PH time (UTC+8)
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const todayMM = String(now.getUTCMonth() + 1).padStart(2, '0');
  const todayDD = String(now.getUTCDate()).padStart(2, '0');

  console.log(`Checking birthdays for ${todayMM}-${todayDD}`);

  const { data: users, error } = await supabase
    .from('hub_users')
    .select('id, full_name, email, avatar_url, birthday')
    .eq('status', 'active')
    .not('birthday', 'is', null);

  if (error) { console.error('fetch error:', error); return; }

  const celebrants = (users || []).filter((u: any) => {
    if (!u.birthday) return false;
    const [, mm, dd] = u.birthday.split('-');
    return mm === todayMM && dd === todayDD;
  });

  if (celebrants.length === 0) {
    console.log('No birthdays today.');
    return { skipped: true };
  }

  for (const person of celebrants) {
    const copy = FALLBACK_COPY(person.first_name || person.full_name.split(' ')[0]);
    const gif = BIRTHDAY_GIFS[Math.floor(Math.random() * BIRTHDAY_GIFS.length)];
    const firstName = person.full_name.split(' ')[0];

    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<!channel> Let's greet ${firstName}! 🎂`,
        },
      },
      { type: 'divider' },
      ...(person.avatar_url ? [{
        type: 'image',
        image_url: person.avatar_url,
        alt_text: person.full_name,
        title: { type: 'plain_text', text: copy.headline, emoji: true },
      }] : [{
        type: 'header',
        text: { type: 'plain_text', text: copy.headline, emoji: true },
      }]),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: copy.body,
        },
      },
      { type: 'image', image_url: gif, alt_text: `Happy Birthday ${firstName}!` },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'image',
            image_url: 'https://fsarchitects.ph/apple-touch-icon.png',
            alt_text: 'FS Architects',
          },
          {
            type: 'mrkdwn',
            text: '*FS Architects* — From the whole team 🧡',
          },
        ],
      },
    ];

    console.log(`Posting birthday message for ${person.full_name}`);

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        text: `<!channel> ${copy.headline}`,
        blocks,
      }),
    });

    const result = await res.json();
    if (!result.ok) {
      console.error(`Slack error for ${person.full_name}:`, result.error);
    } else {
      console.log(`Posted for ${person.full_name}:`, result.ts);
    }
    return result;
  }
}

async function updateMessage(ts: string, blocks: any[], name: string) {
  const res = await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: SLACK_CHANNEL, ts, text: `Happy Birthday, ${name}! 🎈`, blocks }),
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const body = await req.json().catch(() => ({}));

  if (body.update_ts) {
    const firstName = String(body.first_name ?? 'there');
    const copy = FALLBACK_COPY(firstName);
    const gif = BIRTHDAY_GIFS[Math.floor(Math.random() * BIRTHDAY_GIFS.length)];
    const avatarUrl = body.avatar_url;

    const blocks: any[] = [
      { type: 'section', text: { type: 'mrkdwn', text: `<!channel> Let's greet ${firstName}! 🎂` } },
      { type: 'divider' },
      ...(avatarUrl ? [{ type: 'image', image_url: avatarUrl, alt_text: firstName, title: { type: 'plain_text', text: copy.headline, emoji: true } }] : [{ type: 'header', text: { type: 'plain_text', text: copy.headline, emoji: true } }]),
      { type: 'section', text: { type: 'mrkdwn', text: copy.body } },
      { type: 'image', image_url: gif, alt_text: `Happy Birthday ${firstName}!` },
      { type: 'divider' },
      { type: 'context', elements: [{ type: 'image', image_url: 'https://fsarchitects.ph/apple-touch-icon.png', alt_text: 'FS Architects' }, { type: 'mrkdwn', text: '*FS Architects* — From the whole team 🧡' }] },
    ];

    const result = await updateMessage(body.update_ts, blocks, firstName);
    return new Response(JSON.stringify({ ok: true, result }), { headers: cors });
  }

  const result = await checkAndPost();
  return new Response(JSON.stringify({ ok: true, result }), { headers: cors });
});
