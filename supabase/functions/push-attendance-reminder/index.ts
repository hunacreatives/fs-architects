const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SLACK_CHANNEL = 'C0BBA4Q18Q0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const TEXT = `👋 *Hey FS Architects team!*

Quick reminder + welcome message on how attendance tracking works here in Slack:

🟢 *Clocking On/Off*
Just send *\`on\`* when you start your shift, and *\`off\`* when you end it — right here in this channel. That's it, no app needed.

⏱️ *Logging 8 hours*
Your paid workday is *8 hours*, with *1 hour unpaid lunch* built in. So aim for about *9 hours between your "on" and "off"* message to cover a full day properly.

📌 *A few policy notes:*
• Make sure to send *on* and *off* every single day — if it's missing, your hours won't be tracked, even if you worked.
• Overtime only counts if it's *requested and approved* beforehand through the Hub (Requests → Overtime) — please don't assume extra hours will be paid automatically.
• If you spot a mistake in your logged hours, flag it to HR/admin as soon as possible so it can be corrected before payroll runs.

Thanks, everyone — let's keep this clean and accurate so payroll runs smoothly for all of us! 🙌`;

async function slackPost(path: string, body: unknown) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    console.error(`Slack API failed: ${path}`, { status: res.status, response: json });
    const detail = json.needed ? ` (needed: ${json.needed}, provided: ${json.provided ?? 'none'})` : '';
    throw new Error(`Slack API failed: ${path} - ${json.error ?? res.status}${detail}`);
  }
  return json;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    await slackPost('chat.postMessage', {
      channel: SLACK_CHANNEL,
      text: `<!everyone>\n\n${TEXT}`,
      unfurl_links: false,
    });
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    console.error('push-attendance-reminder error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
