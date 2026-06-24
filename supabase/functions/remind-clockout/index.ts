import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Forgot-to-clock-out reminder ─────────────────────────────────────────────
// Runs every 15 min. Reads the Slack attendance channel, finds anyone still
// clocked in (their last punch is `on`, no `off` after it) who has been on for
// 9h30m or more — i.e. 30 min past a full 9-hour day — and DMs them a reminder
// to type `off`. Skips anyone who filed an overtime request for that day (they
// are working late on purpose). Sends at most once per person per day.

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const CHANNEL_ID = Deno.env.get('SLACK_ATTENDANCE_CHANNEL_ID') ?? 'C0BBA4Q18Q0';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'payroll@fsarchitects.ph';

const REMIND_AFTER_HOURS = 9.5;   // 9h work + 30 min grace
const MAX_SESSION_HOURS = 16;     // ignore stale sessions older than this

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const pad = (n: number) => String(n).padStart(2, '0');

// Date (PHT) of a Slack unix-seconds timestamp.
function phtDate(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000 + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

async function slackGet(path: string) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  return res.json();
}

async function slackDm(slackId: string, text: string) {
  try {
    const opened = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: slackId }),
    });
    const openedJson = await opened.json();
    const channel = openedJson.ok ? openedJson.channel?.id : slackId;
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text }),
    });
  } catch (err) {
    console.error('slackDm failed', err);
  }
}

async function sendEmail(to: string, firstName: string) {
  if (!RESEND_API_KEY || !to) return;
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c2b3a;padding:24px 32px;">
      <p style="color:#9fb4c8;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">FS Architects</p>
      <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;">Don't forget to clock out</h1>
    </div>
    <div style="padding:28px 32px;font-size:14px;color:#374151;line-height:1.6;">
      Hi ${firstName},<br><br>
      Our records show you've been clocked in for over <strong>9 hours</strong> and haven't logged out yet. When you're done for the day, kindly type <strong>off</strong> in the attendance channel so your hours are recorded accurately.<br><br>
      If you've already clocked out since this was sent, please feel free to disregard this message. And if you're working overtime, just file an OT request — no action needed here.<br><br>
      Thank you!
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#d1d5db;margin:0;text-align:center;">© ${new Date().getFullYear()} FS Architects · ${FROM_EMAIL}</p>
    </div>
  </div>
</body></html>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `FS Architects <${FROM_EMAIL}>`, to, subject: "Reminder: you haven't clocked out", html }),
    });
    if (!res.ok) console.error('Resend error', await res.text());
  } catch (err) {
    console.error('sendEmail failed', err);
  }
}

async function run() {
  const nowSec = Date.now() / 1000;
  const oldest = String(nowSec - MAX_SESSION_HOURS * 3600);

  const slack = await slackGet(
    `conversations.history?channel=${CHANNEL_ID}&oldest=${oldest}&limit=500`,
  );
  if (!slack.ok) { console.error('slack history error', slack.error); return; }

  console.log(`Slack returned ${(slack.messages || []).length} messages (has_more=${slack.has_more})`);

  // Collect on/off punches per Slack user (oldest → newest).
  const messages = [...(slack.messages || [])].reverse();
  const punches: Record<string, { status: 'on' | 'off'; ts: number }[]> = {};
  for (const msg of messages) {
    const text = (msg.text || '').trim().toLowerCase();
    const isOn = text === 'on' || text === 'on/site' || text === 'on/wfh';
    const isOff = text === 'off';
    if ((isOn || isOff) && msg.user) {
      (punches[msg.user] ??= []).push({ status: isOn ? 'on' : 'off', ts: parseFloat(msg.ts) });
    }
  }

  console.log('punches found:', JSON.stringify(
    Object.fromEntries(Object.entries(punches).map(([id, list]) => [id, list[list.length - 1]]))
  ));

  // Map active Slack users → hub_users.
  const stillOn: { slackId: string; onTs: number }[] = [];
  for (const [slackId, list] of Object.entries(punches)) {
    const last = list[list.length - 1];
    if (last.status !== 'on') continue;            // already clocked off
    const elapsed = (nowSec - last.ts) / 3600;
    if (elapsed < REMIND_AFTER_HOURS) continue;    // not past 9h30m yet
    if (elapsed > MAX_SESSION_HOURS) continue;     // stale/forgotten session
    stillOn.push({ slackId, onTs: last.ts });
  }

  console.log('stillOn:', JSON.stringify(stillOn));
  if (!stillOn.length) return;

  const { data: users } = await supabase
    .from('hub_users')
    .select('id, full_name, email, slack_id, status')
    .eq('role', 'contractor')
    .in('slack_id', stillOn.map((s) => s.slackId));
  const bySlack = new Map((users ?? []).map((u: any) => [String(u.slack_id).trim(), u]));

  for (const s of stillOn) {
    try {
      const user = bySlack.get(s.slackId.trim());
      if (!user || user.status !== 'active') continue;
      const day = phtDate(s.onTs);

      // Skip if they filed OT for that day (working late on purpose).
      const { data: ot } = await supabase
        .from('hub_overtime_requests')
        .select('id')
        .eq('contractor_id', user.id)
        .eq('date', day)
        .in('status', ['pending', 'approved'])
        .limit(1);
      if (ot && ot.length) continue;

      // Once per person per day — unique(user_id, date) is the guard.
      const { error: insErr } = await supabase
        .from('hub_clockout_reminders')
        .insert({ user_id: user.id, date: day });
      if (insErr) {
        if ((insErr as any).code !== '23505') console.error('reminder insert failed', user.id, insErr);
        continue;
      }

      const first = user.full_name.split(' ')[0];
      console.log(`Clock-out reminder → ${user.full_name} (${day})`);
      await slackDm(
        s.slackId,
        `Hi ${first} :wave: — our records show you've been clocked in for over 9 hours and haven't logged out yet. When you're done for the day, kindly type *off* in the attendance channel so your hours record accurately. If you've already clocked out since reading this, please feel free to disregard. Working overtime? Just file an OT request — no action needed here. Thank you! :+1:`,
      );
      if (user.email) await sendEmail(user.email, first);
    } catch (err) {
      console.error('clock-out reminder failed for', s.slackId, err);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // @ts-ignore EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(run().catch((e) => console.error('remind-clockout failed', e)));
  return new Response(JSON.stringify({ ok: true, queued: true }), { headers: cors });
});
