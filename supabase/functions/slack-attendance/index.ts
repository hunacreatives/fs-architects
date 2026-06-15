// v3 — overtime comes from hub_overtime_requests (approved), not Slack parsing
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const CHANNEL_ID = Deno.env.get('SLACK_ATTENDANCE_CHANNEL_ID') ?? 'C0BBA4Q18Q0';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_HOURS_FIXED = 8; // billable cap for fixed-rate contractors

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function slackGet(path: string) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check for backfill date: query param (?date=2026-05-20) or request body ({ date })
    const url = new URL(req.url);
    let backfillDate = url.searchParams.get('date');
    let slackEventText = '';

    if (req.method === 'POST') {
      try {
        const body = await req.json();

        if (body?.type === 'url_verification') {
          return new Response(JSON.stringify({ challenge: body.challenge }), { headers: cors });
        }

        if (body?.type === 'event_callback') {
          slackEventText = (body?.event?.text || '').trim().toLowerCase();
          if (slackEventText !== 'on' && slackEventText !== 'off') {
            return new Response(JSON.stringify({ ok: true }), { headers: cors });
          }
        }

        if (body?.date) backfillDate = body.date;
      } catch { /* no body */ }
    }

    const phOffset = 8 * 60;
    const now = new Date();
    const phNow = new Date(now.getTime() + phOffset * 60 * 1000);
    const todayDate = backfillDate ?? phNow.toISOString().split('T')[0];

    let oldest: string;
    let latest: string | null = null;

    if (backfillDate) {
      // midnight PH to 36h later — covers overnight shifts (11 PM on) and their 7 AM off next day
      const dayStart = new Date(`${backfillDate}T00:00:00+08:00`);
      const dayEnd = new Date(dayStart.getTime() + 36 * 60 * 60 * 1000);
      oldest = String(dayStart.getTime() / 1000);
      latest = String(dayEnd.getTime() / 1000);
    } else {
      // Rolling 18h window for live mode
      const windowStart = new Date(now.getTime() - 18 * 60 * 60 * 1000);
      oldest = String(windowStart.getTime() / 1000);
    }

    // Fetch messages — only care about on/off punches now
    const slack = await slackGet(
      `conversations.history?channel=${CHANNEL_ID}&oldest=${oldest}${latest ? `&latest=${latest}` : ''}&limit=500`
    );

    if (!slack.ok) {
      return new Response(JSON.stringify({ error: slack.error }), { status: 400, headers: cors });
    }

    const messages = [...(slack.messages || [])].reverse();

    const userPunches: Record<string, { status: 'on' | 'off'; ts: number }[]> = {};
    const hourlyOnMessages: { slackId: string; ts: string }[] = [];

    for (const msg of messages) {
      const text = (msg.text || '').trim().toLowerCase();

      if ((text === 'on' || text === 'off') && msg.user) {
        if (!userPunches[msg.user]) userPunches[msg.user] = [];
        userPunches[msg.user].push({ status: text as 'on' | 'off', ts: parseFloat(msg.ts) });

        if (text === 'on' && msg.reply_count > 0) {
          hourlyOnMessages.push({ slackId: msg.user, ts: msg.ts });
        }
      }
      // No overtime parsing from Slack — OT comes from hub_overtime_requests
    }

    // Resolve hourly hours from "on" thread replies
    const hourlyHoursByTs: Record<number, number> = {};

    await Promise.all(
      hourlyOnMessages.map(async ({ slackId, ts }) => {
        const thread = await slackGet(`conversations.replies?channel=${CHANNEL_ID}&ts=${ts}`);
        if (!thread.ok) return;
        for (const reply of thread.messages || []) {
          if (reply.ts === ts) continue;
          if (reply.user !== slackId) continue;
          const num = parseFloat((reply.text || '').trim());
          if (!isNaN(num) && num > 0) {
            hourlyHoursByTs[parseFloat(ts)] = num;
            break;
          }
        }
      })
    );

    // Get all active contractors
    const { data: contractors } = await supabase
      .from('hub_users')
      .select('id, full_name, avatar_url, department, email, status, slack_username, slack_id, payment_type, shift_start')
      .eq('status', 'active');

    // Fetch approved OT for today + yesterday — past-midnight shifts start on the previous date
    // so shiftDate may be yesterday even when the function runs today.
    const yesterdayDate = new Date(phNow.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: approvedOTRows } = await supabase
      .from('hub_overtime_requests')
      .select('contractor_id, hours, date')
      .gte('date', yesterdayDate)
      .lte('date', todayDate)
      .eq('status', 'approved');
    // Keyed by user_id → date so we look up by shiftDate (not todayDate)
    const approvedOTMap: Record<string, Record<string, number>> = {};
    for (const r of approvedOTRows || []) {
      if (!approvedOTMap[r.contractor_id]) approvedOTMap[r.contractor_id] = {};
      approvedOTMap[r.contractor_id][r.date] = (approvedOTMap[r.contractor_id][r.date] || 0) + (r.hours || 0);
    }

    const emailMap: Record<string, any> = {};
    const slackUsernameMap: Record<string, any> = {};
    const slackIdMap: Record<string, any> = {};
    for (const c of contractors || []) {
      emailMap[c.email?.toLowerCase()] = c;
      if (c.slack_username) slackUsernameMap[c.slack_username.toLowerCase().replace(/^@/, '')] = c;
      if (c.slack_id) slackIdMap[c.slack_id.trim()] = c;
    }

    const slackIds = [...new Set(Object.keys(userPunches))];
    const slackEmailMap: Record<string, string> = {};
    const slackDisplayNameMap: Record<string, string> = {};

    await Promise.all(
      slackIds.map(async (slackId) => {
        const info = await slackGet(`users.info?user=${slackId}`);
        if (info.ok) {
          const email = info.user?.profile?.email;
          if (email) slackEmailMap[slackId] = email.toLowerCase();
          const display = (info.user?.profile?.display_name || info.user?.profile?.real_name || '').toLowerCase().replace(/^@/, '');
          if (display) slackDisplayNameMap[slackId] = display;
        }
      })
    );

    const punchedEmails = new Set<string>();
    const attendance: any[] = [];
    const hoursUpserts: any[] = [];
    const hoursInProgress: any[] = [];

    for (const slackId of slackIds) {
      const punches = userPunches[slackId] || [];
      const email = slackEmailMap[slackId];
      const displayName = slackDisplayNameMap[slackId];
      const hubUser = slackIdMap[slackId] ?? (email ? emailMap[email] : null) ?? (displayName ? slackUsernameMap[displayName] : null);
      if (hubUser?.email) punchedEmails.add(hubUser.email);
      else if (email) punchedEmails.add(email);

      const latestPunch = punches[punches.length - 1];
      const status = latestPunch?.status ?? 'absent';

      const punchList = punches.map((p) => ({
        status: p.status,
        time: new Date(p.ts * 1000).toISOString(),
      }));

      const firstOn = punches.find(p => p.status === 'on');
      const lastOff = firstOn ? punches.find(p => p.status === 'off' && p.ts > firstOn.ts) : undefined;

      // Record hours under the date the shift STARTED (on punch)
      const shiftDate = (() => {
        if (!firstOn) return todayDate;
        const punchMs = firstOn.ts * 1000;
        const punchDate = new Date(punchMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        const punchHour = parseInt(new Date(punchMs).toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }));
        const shiftStartHour = hubUser?.shift_start ? parseInt(hubUser.shift_start.split(':')[0]) : null;
        // Overnight shift: starts at/after 8 PM, and punch-in is before noon → previous day
        if (shiftStartHour !== null && shiftStartHour >= 20 && punchHour < 12) {
          const prev = new Date(punchMs - 24 * 60 * 60 * 1000);
          return prev.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        }
        return punchDate;
      })();

      const isHourly = hubUser?.payment_type === 'hourly';
      const threadHours = firstOn ? hourlyHoursByTs[firstOn.ts] : undefined;

      let hoursRaw = 0;
      let hoursCapped = 0;
      let effectiveStatus = status;

      if (isHourly && threadHours != null) {
        hoursRaw = threadHours;
        hoursCapped = threadHours;
        effectiveStatus = 'off';
      } else if (firstOn && lastOff && lastOff.ts > firstOn.ts) {
        hoursRaw = (lastOff.ts - firstOn.ts) / 3600;
        // Deduct 1h unpaid lunch if shift is 5+ raw hours (lunch at 4h mark per handbook)
        const lunchDeduction = hoursRaw >= 5 ? 1 : 0;
        hoursCapped = Math.min(hoursRaw - lunchDeduction, MAX_HOURS_FIXED);
      } else if (!isHourly && threadHours != null && firstOn) {
        hoursRaw = threadHours;
        hoursCapped = Math.min(threadHours, MAX_HOURS_FIXED);
        effectiveStatus = 'off';
      }

      // Handbook rule: clock-in at/after 12 PM PHT → max half day (4 hrs)
      if (firstOn) {
        const firstOnHour = parseInt(new Date(firstOn.ts * 1000).toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }));
        if (firstOnHour >= 12) {
          hoursCapped = Math.min(hoursCapped, 4);
        }
      }

      // Compute actual OT from Slack hours vs approved OT request for this date.
      // Requires 9+ raw hours (full shift + lunch), capped at admin-approved hours.
      const approvedOT = hubUser ? (approvedOTMap[hubUser.id]?.[shiftDate] || 0) : 0;
      const actualOT = approvedOT > 0
        ? parseFloat(Math.min(Math.max(0, hoursRaw - 9), approvedOT).toFixed(2))
        : 0;

      if (hubUser && firstOn) {
        const validLastOff = (lastOff && lastOff.ts > firstOn.ts) ? new Date(lastOff.ts * 1000).toISOString() : null;
        const row = {
          user_id: hubUser.id,
          date: shiftDate,
          hours_raw: parseFloat(hoursRaw.toFixed(2)),
          hours_capped: parseFloat(hoursCapped.toFixed(2)),
          overtime_hours: actualOT,
          first_on: new Date(firstOn.ts * 1000).toISOString(),
          last_off: validLastOff,
          updated_at: new Date().toISOString(),
        };
        if (hoursRaw > 0) {
          hoursUpserts.push(row);
        } else {
          hoursInProgress.push(row);
        }
      }

      if (latestPunch) {
        attendance.push({
          hub_user_id: hubUser?.id || null,
          email: email || null,
          full_name: hubUser?.full_name || `Slack user (${slackId})`,
          avatar_url: hubUser?.avatar_url || null,
          department: hubUser?.department || null,
          shift_date: shiftDate,
          status: effectiveStatus,
          last_punch: new Date(latestPunch.ts * 1000).toISOString(),
          punches: punchList,
          hours_today: parseFloat(hoursCapped.toFixed(2)),
          overtime_today: 0,
        });
      }
    }

    // Upsert daily hours — do NOT touch overtime_hours column (managed by OT approval flow)
    // Also never overwrite rows that were manually edited by an admin (is_manual = true)
    if (hoursUpserts.length > 0) {
      const userDatePairs = hoursUpserts.map((r: any) => `(user_id.eq.${r.user_id},date.eq.${r.date})`);
      const { data: manualRows } = await supabase
        .from('hub_daily_hours')
        .select('user_id, date')
        .eq('is_manual', true)
        .or(userDatePairs.join(','));
      const manualSet = new Set((manualRows || []).map((r: any) => `${r.user_id}::${r.date}`));
      const safeUpserts = hoursUpserts.filter((r: any) => !manualSet.has(`${r.user_id}::${r.date}`));
      if (safeUpserts.length > 0) {
        await supabase
          .from('hub_daily_hours')
          .upsert(safeUpserts, { onConflict: 'user_id,date' });
      }
    }

    if (hoursInProgress.length > 0) {
      await supabase
        .from('hub_daily_hours')
        .upsert(hoursInProgress, { onConflict: 'user_id,date', ignoreDuplicates: true });
    }

    // Add absent contractors
    for (const c of contractors || []) {
      if (!punchedEmails.has(c.email)) {
        attendance.push({
          hub_user_id: c.id,
          email: c.email,
          full_name: c.full_name,
          avatar_url: c.avatar_url,
          department: c.department,
          shift_date: null,
          status: 'absent',
          last_punch: null,
          punches: [],
          hours_today: 0,
          overtime_today: 0,
        });
      }
    }

    const order: Record<string, number> = { on: 0, off: 1, absent: 2 };
    attendance.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

    return new Response(JSON.stringify({ attendance }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
