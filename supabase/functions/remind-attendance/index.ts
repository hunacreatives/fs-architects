import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ATTENDANCE_CHANNEL_ID = Deno.env.get('SLACK_ATTENDANCE_CHANNEL_ID') ?? 'C0BBA4Q18Q0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function slackPost(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}


function parseMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Minutes since a given shift time, handling midnight wrap
function minutesSince(nowMin: number, shiftMin: number): number {
  const diff = nowMin - shiftMin;
  // If diff is very negative (e.g. it's 00:20 and shift was at 23:00), wrap by adding 1440
  return diff < -120 ? diff + 1440 : diff;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const url = new URL(req.url);
    const testMode = url.searchParams.get('test') === 'true';

    // Current PHT time (UTC+8)
    const now = new Date();
    const phNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const phHour = phNow.getUTCHours();
    const phMinute = phNow.getUTCMinutes();
    const phCurrentMin = phHour * 60 + phMinute;

    const todayStr = phNow.toISOString().split('T')[0];
    const yesterdayStr = new Date(phNow.getTime() - 86400000).toISOString().split('T')[0];

    // Day of week in PHT (0=Sun … 6=Sat)
    const dayAbbr = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][phNow.getUTCDay()];

    // Fetch active contractors with shift info
    const { data: contractors } = await supabase
      .from('hub_users')
      .select('id, full_name, email, slack_id, shift_start, shift_end, work_days')
      .eq('status', 'active')
      .not('shift_start', 'is', null);

    if (!contractors?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: cors });
    }

    // Fetch recent daily hours (today + yesterday) for all contractors
    const ids = contractors.map((c: any) => c.id);
    const { data: recentHours } = await supabase
      .from('hub_daily_hours')
      .select('user_id, date, first_on, last_off')
      .in('user_id', ids)
      .in('date', [todayStr, yesterdayStr]);

    const hoursMap: Record<string, Record<string, any>> = {};
    for (const h of recentHours || []) {
      if (!hoursMap[h.user_id]) hoursMap[h.user_id] = {};
      hoursMap[h.user_id][h.date] = h;
    }

    const reminders: { slackId: string; name: string; message: string }[] = [];

    for (const c of contractors) {
      if (!c.email || !c.shift_start) continue;

      // Skip if today is not a scheduled work day (only if work_days is set)
      const workDays: string[] = c.work_days || [];
      if (workDays.length > 0 && !workDays.includes(dayAbbr)) continue;

      const shiftStartMin = parseMinutes(c.shift_start);
      const shiftEndMin = c.shift_end ? parseMinutes(c.shift_end) : null;
      const isOvernight = shiftStartMin >= 20 * 60; // shift starts at/after 8 PM

      // Determine which calendar date this shift belongs to
      // Overnight at/after 8 PM: if we're still in the evening (phHour >= start hour), shift date = today
      // If we're past midnight (phHour < 12), shift date = yesterday
      const shiftDate = isOvernight
        ? (phHour >= Math.floor(shiftStartMin / 60) ? todayStr : yesterdayStr)
        : todayStr;

      const hoursRow = hoursMap[c.id]?.[shiftDate];
      const firstName = c.full_name.split(' ')[0];

      // Require a stored slack_id to send DMs
      if (!c.slack_id) continue;

      // ── Log-on reminder ───────────────────────────────────────────────────
      // Send once, 15–30 min after shift_start, if no punch-in recorded
      const minSinceStart = minutesSince(phCurrentMin, shiftStartMin);
      if ((testMode || (minSinceStart >= 15 && minSinceStart < 30)) && !hoursRow?.first_on) {
        const timeLabel = c.shift_start.slice(0, 5);
        reminders.push({
          slackId: c.slack_id,
          name: firstName,
          message: `Hey ${firstName}! Your shift started at *${timeLabel}* and you haven't logged in yet. Please type \`on\` in <#${ATTENDANCE_CHANNEL_ID}> to log in. 🕐`,
        });
      }

      // ── Log-off reminder ──────────────────────────────────────────────────
      // Send once, 30–45 min after shift_end, if punched in but not out
      if (shiftEndMin !== null) {
        const minSinceEnd = minutesSince(phCurrentMin, shiftEndMin);
        if ((testMode || (minSinceEnd >= 30 && minSinceEnd < 45)) && hoursRow?.first_on && !hoursRow?.last_off) {
          const timeLabel = c.shift_end!.slice(0, 5);
          reminders.push({
            slackId: c.slack_id,
            name: firstName,
            message: `Hey ${firstName}! Your shift ended at *${timeLabel}* — don't forget to type \`off\` in <#${ATTENDANCE_CHANNEL_ID}> to log out. 👋`,
          });
        }
      }
    }

    console.log(`[remind-attendance] ${reminders.length} reminder(s) to send`);

    // Send DMs
    let sent = 0;
    const errors: string[] = [];
    for (const r of reminders) {
      // Open DM channel first, then post
      const dm = await slackPost('conversations.open', { users: r.slackId });
      if (!dm.ok) {
        const msg = `conversations.open failed for ${r.name} (${r.slackId}): ${dm.error}`;
        console.log(`[remind-attendance] ${msg}`);
        errors.push(msg);
        continue;
      }
      const result = await slackPost('chat.postMessage', { channel: dm.channel.id, text: r.message });
      if (result.ok) {
        sent++;
        console.log(`[remind-attendance] Sent to ${r.name}`);
      } else {
        const msg = `chat.postMessage failed for ${r.name}: ${result.error}`;
        console.log(`[remind-attendance] ${msg}`);
        errors.push(msg);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, total: reminders.length, errors }), { headers: cors });
  } catch (err) {
    console.error('[remind-attendance] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
