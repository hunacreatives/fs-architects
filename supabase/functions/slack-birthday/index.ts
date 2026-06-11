import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_CHANNEL = 'C0830PCJB4P';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Custom copy per team member — keyed by email
const CUSTOM_COPY: Record<string, { headline: string; body: string }> = {
  'angelalouiseando@gmail.com': {
    headline: 'Happy Birthday, Angela! 🎉',
    body: "Today we celebrate the creative force behind some of our best work. Angela, your eye for detail and boundless energy make every project better. Wishing you a day as bright as your ideas — you deserve every bit of it. Here's to you! 🧡",
  },
  'claudettemaytahil@gmail.com': {
    headline: 'Happy Birthday, Claudette! 🎂',
    body: "Claudette, you're the reason our clients feel so well taken care of. Your patience, professionalism, and warmth are what make Huna Creatives special behind the scenes. Today is all about you — relax, celebrate, and know that the whole team is rooting for you. 🎉",
  },
  'janreesepj@gmail.com': {
    headline: 'Happy Birthday, Reese! 🎊',
    body: "Reese, your work ethic and creativity never go unnoticed. You bring fresh ideas and a quiet dedication that lifts the whole team. We hope today is filled with good food, great company, and zero deadlines. Happy birthday — you've earned it! 🙌",
  },
  'duterteabigaile@gmail.com': {
    headline: 'Happy Birthday, Abigail! 🎈',
    body: "Abby, the team genuinely could not function without you. You keep everything running smoothly, you're always the first to show up for the team, and you do it all with a smile. Today it's your turn to be celebrated — wishing you all the joy you give to everyone else. 🧡",
  },
};

const FALLBACK_COPY = (name: string) => ({
  headline: `Happy Birthday, ${name}! 🎉`,
  body: `Today we celebrate you, ${name}! Thank you for everything you bring to the Huna Creatives team — your hard work, your energy, and your dedication make a real difference. Wishing you an amazing birthday surrounded by people you love. 🧡`,
});

// Rotate through a few birthday banner GIFs
const BIRTHDAY_IMAGES = [
  'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcHVleTFyNm0xNmJyNW5sdGszZHBwbzZybDlkZG1xeXhva2VrenZtbiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/g5R9dok94mrIvplmZd/giphy.gif',
  'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTkxdXJ3YzIxZTdlc3QwYjFhMzVqdnl4aGd5bmV4ZGhhcTcxZ3RnZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/artj92V8o75VPL7AeQ/giphy.gif',
  'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbnQxcm9mYW9ucGR2ZTJhcm5pbzU3MjRtZTFnZWIydGsxenFucjRqbSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26tPghhGGmhsNcAGY/giphy.gif',
];

async function checkAndPost() {
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
    return;
  }

  for (const person of celebrants) {
    const copy = CUSTOM_COPY[person.email] ?? FALLBACK_COPY(person.first_name || person.full_name.split(' ')[0]);
    const image = BIRTHDAY_IMAGES[Math.floor(Math.random() * BIRTHDAY_IMAGES.length)];

    const blocks = [
      {
        type: 'image',
        image_url: image,
        alt_text: `Happy Birthday ${person.full_name}`,
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${copy.headline}*\n\n${copy.body}`,
        },
        ...(person.avatar_url ? {
          accessory: {
            type: 'image',
            image_url: person.avatar_url,
            alt_text: person.full_name,
          },
        } : {}),
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '— From the whole Huna Creatives team 🧡',
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
        text: copy.headline,
        blocks,
      }),
    });

    const result = await res.json();
    if (!result.ok) {
      console.error(`Slack error for ${person.full_name}:`, result.error);
    } else {
      console.log(`Posted for ${person.full_name}:`, result.ts);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // @ts-ignore
  EdgeRuntime.waitUntil(checkAndPost());
  return new Response(JSON.stringify({ ok: true }), { headers: cors });
});
