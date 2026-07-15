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

const ORDINAL = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const FALLBACK_COPY = (name: string, years: number) => ({
  headline: `${ORDINAL(years)} Work Anniversary, ${name}! 🎉`,
  body: `${years} year${years > 1 ? 's' : ''} at FS Architects — thank you for your hard work, dedication, and everything you bring to the team. Here's to many more! 🧡`,
});

async function checkAndPost() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const now = new Date(Date.now() + 8 * 60 * 60 * 1000); // PHT
  const todayMM = String(now.getUTCMonth() + 1).padStart(2, '0');
  const todayDD = String(now.getUTCDate()).padStart(2, '0');
  const todayYear = now.getUTCFullYear();

  const { data: users, error } = await supabase
    .from('hub_users')
    .select('id, full_name, email, avatar_url, start_date')
    .eq('status', 'active')
    .not('start_date', 'is', null);

  if (error) { console.error('fetch error:', error); return; }

  const celebrants = (users || []).filter((u: any) => {
    if (!u.start_date) return false;
    const [startYear, mm, dd] = u.start_date.split('-');
    if (mm !== todayMM || dd !== todayDD) return false;
    return parseInt(startYear) < todayYear; // not their first day
  });

  if (celebrants.length === 0) {
    console.log('No anniversaries today.');
    return;
  }

  for (const person of celebrants) {
    const startYear = parseInt(person.start_date.split('-')[0]);
    const years = todayYear - startYear;
    const firstName = person.full_name.split(' ')[0];

    const copy = FALLBACK_COPY(firstName, years);

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🎂 *${copy.headline}*\n\n${copy.body}`,
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
        elements: [{ type: 'mrkdwn', text: `— From the whole FS Architects team 🧡` }],
      },
    ];

    console.log(`Posting ${years}-year anniversary for ${person.full_name}`);

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: SLACK_CHANNEL, text: copy.headline, blocks }),
    });

    const result = await res.json();
    if (!result.ok) {
      console.error(`Slack error for ${person.full_name}:`, result.error);
    } else {
      console.log(`Posted for ${person.full_name}: ${years} year(s)`);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // @ts-ignore
  EdgeRuntime.waitUntil(checkAndPost());
  return new Response(JSON.stringify({ ok: true }), { headers: cors });
});
