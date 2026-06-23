const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SLACK_CHANNEL = Deno.env.get('SLACK_ANNOUNCEMENTS_CHANNEL_ID') ?? 'C0BB58W8R1U';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const HUB_URL = `${HUB_BASE_URL}/hub/login`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function getPHTParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: get('weekday'),
  };
}

function lastWorkingDayOfMonth(year: number, month1: number): number {
  const lastDay = new Date(Date.UTC(year, month1, 0));
  const dow = lastDay.getUTCDay();
  if (dow === 6) lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  if (dow === 0) lastDay.setUTCDate(lastDay.getUTCDate() - 2);
  return lastDay.getUTCDate();
}

function isTodayCutoff(): boolean {
  const { year, month, day } = getPHTParts();
  return day === 15 || day === lastWorkingDayOfMonth(year, month);
}

function getCutoffLabel(): string {
  const { day } = getPHTParts();
  return day === 15
    ? 'Today is the 15th payroll cutoff'
    : 'Today is the last working day of the month';
}

function getPHTDateString(): string {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

async function slackPost(path: string, body: unknown) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    console.error(`Slack API failed: ${path}`, { status: res.status, response: json });
    throw new Error(`Slack API failed: ${path} - ${json.error ?? res.status}`);
  }
  return json;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    if (!force && !isTodayCutoff()) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'Not a cutoff day' }), { headers: cors });
    }

    const dateLabel = getPHTDateString();
    const cutoffLabel = getCutoffLabel();

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📋 Payroll Cutoff Today', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<!channel>\n\n*${cutoffLabel}* — ${dateLabel}.\n\nMake sure your attendance is up to date and submit your payslip before you log off today. Anything missing after cutoff moves to next period.`,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `<${HUB_URL}|Open Sentro Hub →>` },
      },
      { type: 'divider' },
    ];

    await slackPost('chat.postMessage', {
      channel: SLACK_CHANNEL,
      text: `📋 Payroll cutoff today (${dateLabel}) — please submit your payslip before end of shift.`,
      blocks,
    });

    return new Response(JSON.stringify({ ok: true, date: dateLabel }), { headers: cors });
  } catch (err) {
    console.error('slack-payroll-reminder error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
