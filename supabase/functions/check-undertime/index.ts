import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Undertime 3-strike alert ─────────────────────────────────────────────────
// Daily job. A day counts as "undertime" when an employee clocked in on a
// scheduled work day but logged fewer than 9 raw hours (handbook: 9h = 8h paid
// + 1h unpaid lunch). Approved time-off days never count. The moment an employee
// reaches 3 undertime days in the current pay period, the owner + admins get an
// FYI and the employee gets a request to explain — once per employee per period.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') ?? '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'payroll@fsarchitects.ph';
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';

const UNDERTIME_THRESHOLD_HOURS = 9; // raw clocked hours that make a full day
const STRIKES = 3;                   // undertime days before an alert fires

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Date / pay-period helpers (PHT) ──────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const DAY_NUM: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function nowPHT(): Date {
  // PHT is UTC+8 with no DST; shift then read via UTC getters.
  return new Date(Date.now() + 8 * 3600 * 1000);
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Current pay period: 1–15, or 16–end of month.
function currentPeriod(today: Date): { start: string; end: string; label: string } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth(); // 0-based
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (today.getUTCDate() <= 15) {
    return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-15`, label: `${MONTHS[m]} 1–15, ${y}` };
  }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { start: `${y}-${pad(m + 1)}-16`, end: `${y}-${pad(m + 1)}-${pad(lastDay)}`, label: `${MONTHS[m]} 16–${lastDay}, ${y}` };
}

function workDaySet(workDays: string[] | null | undefined): Set<number> {
  if (!workDays || workDays.length === 0) return new Set([1, 2, 3, 4, 5]); // default Mon–Fri
  const set = new Set<number>();
  for (const d of workDays) {
    const n = DAY_NUM[String(d).slice(0, 3).toLowerCase()];
    if (typeof n === 'number') set.add(n);
  }
  return set.size ? set : new Set([1, 2, 3, 4, 5]);
}

function weekday(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// ── Channels ─────────────────────────────────────────────────────────────────
async function slackDm(slackId: string, text: string) {
  if (!SLACK_BOT_TOKEN || !slackId) return;
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

async function sendPush(userId: string, title: string, body: string, url: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, title, body, url }),
    });
  } catch (err) {
    console.error('sendPush failed', err);
  }
}

async function inApp(userId: string, title: string, body: string, link: string) {
  const { error } = await supabase.from('hub_notifications').insert({
    user_id: userId, type: 'undertime', title, body, link, read: false,
  });
  if (error) console.error('hub_notifications insert failed', error);
}

async function sendEmail(to: string, subject: string, heading: string, subheading: string, bodyHtml: string, ctaLabel: string, ctaUrl: string) {
  if (!RESEND_API_KEY || !to) return;
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c2b3a;padding:24px 32px;">
      <p style="color:#9fb4c8;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">FS Architects</p>
      <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;">${heading}</h1>
      <p style="color:#94a3b8;font-size:13px;margin:6px 0 0;">${subheading}</p>
    </div>
    <div style="padding:28px 32px;">
      <div style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 20px;">${bodyHtml}</div>
      <div style="text-align:center;">
        <a href="${ctaUrl}" style="display:inline-block;background:#1c2b3a;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">${ctaLabel}</a>
      </div>
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
      body: JSON.stringify({ from: `FS Architects <${FROM_EMAIL}>`, to, subject, html }),
    });
    if (!res.ok) console.error('Resend error', await res.text());
  } catch (err) {
    console.error('sendEmail failed', err);
  }
}

// ── Core ─────────────────────────────────────────────────────────────────────
interface Staff { id: string; full_name: string; email: string | null; slack_id: string | null; work_days: string[] | null; }

async function run() {
  // Evaluate the last fully-completed day (yesterday PHT) and the pay period it
  // belongs to. This way a 3rd strike landing on a period's final day is still
  // caught the next morning, before we move on to the new period.
  const evalDay = new Date(nowPHT().getTime() - 24 * 3600 * 1000);
  const evalDayStr = ymd(evalDay);
  const { start, end, label } = currentPeriod(evalDay);

  const adminUrl = `${HUB_BASE_URL}/hub/admin/attendance`;
  const employeeUrl = `${HUB_BASE_URL}/hub/employee/attendance`;

  const { data: employees, error: empErr } = await supabase
    .from('hub_users')
    .select('id, full_name, email, slack_id, work_days')
    .eq('role', 'contractor')
    .eq('status', 'active');
  if (empErr) { console.error('load employees failed', empErr); return; }

  const { data: recipients } = await supabase
    .from('hub_users')
    .select('id, full_name, email, slack_id')
    .in('role', ['owner', 'admin', 'hr'])
    .eq('status', 'active');
  const managers = (recipients ?? []) as Staff[];

  for (const emp of (employees ?? []) as Staff[]) {
    try {
      const days = workDaySet(emp.work_days);

      // Daily hours for completed days in this period (through the last completed day).
      const { data: hours } = await supabase
        .from('hub_daily_hours')
        .select('date, hours_raw')
        .eq('user_id', emp.id)
        .gte('date', start)
        .lte('date', evalDayStr)
        .order('date', { ascending: true });

      // Approved leave covering any day in the period.
      const { data: leave } = await supabase
        .from('hub_time_off')
        .select('start_date, end_date')
        .eq('contractor_id', emp.id)
        .eq('status', 'approved')
        .lte('start_date', end)
        .gte('end_date', start);

      const onLeave = (dateStr: string) =>
        (leave ?? []).some((l: any) => l.start_date <= dateStr && dateStr <= l.end_date);

      const undertimeDays = (hours ?? []).filter((h: any) =>
        Number(h.hours_raw) < UNDERTIME_THRESHOLD_HOURS &&
        days.has(weekday(h.date)) &&
        !onLeave(h.date),
      );
      const count = undertimeDays.length;
      if (count < STRIKES) continue;

      // Fire once per employee per period — the unique constraint is the guard.
      const { error: insErr } = await supabase.from('hub_undertime_alerts').insert({
        user_id: emp.id, period_start: start, period_end: end, undertime_count: count,
      });
      if (insErr) {
        // 23505 = already alerted this period; anything else is a real error.
        if ((insErr as any).code !== '23505') console.error('alert insert failed', emp.id, insErr);
        continue;
      }

      const first = emp.full_name.split(' ')[0];
      console.log(`Undertime alert: ${emp.full_name} — ${count} days in ${label}`);

      // ── Owner + admins: FYI ──
      const mgrTitle = 'Undertime alert';
      const mgrBody = `${emp.full_name} has logged undertime (under ${UNDERTIME_THRESHOLD_HOURS} hours) on ${count} days this pay period (${label}).`;
      const mgrEmailHtml = `<strong>${emp.full_name}</strong> has logged undertime — fewer than ${UNDERTIME_THRESHOLD_HOURS} clocked hours — on <strong>${count} scheduled work days</strong> during the pay period <strong>${label}</strong>.<br><br>They have been asked to explain. Review their attendance below.`;
      for (const m of managers) {
        if (m.slack_id) await slackDm(m.slack_id, `:warning: *Undertime alert — ${emp.full_name}*\n${count} undertime days (under ${UNDERTIME_THRESHOLD_HOURS} hours) this pay period (*${label}*). They've been asked to explain.`);
        if (m.email) await sendEmail(m.email, `Undertime alert — ${emp.full_name} (${label})`, mgrTitle, label, mgrEmailHtml, 'Review Attendance →', adminUrl);
        await inApp(m.id, mgrTitle, mgrBody, adminUrl);
        await sendPush(m.id, mgrTitle, mgrBody, adminUrl);
      }

      // ── Employee: explain ──
      const empTitle = 'Please explain your undertime';
      const empBody = `Our records show ${count} undertime days (under ${UNDERTIME_THRESHOLD_HOURS} hours) this pay period (${label}). Please reach out to HR with an explanation.`;
      const empEmailHtml = `Hi ${first},<br><br>Our records show <strong>${count} undertime days</strong> — fewer than ${UNDERTIME_THRESHOLD_HOURS} clocked hours on a scheduled work day — during the pay period <strong>${label}</strong>.<br><br>Please reach out to HR with an explanation. If you think this is a mistake, check your logged hours below.`;
      if (emp.slack_id) await slackDm(emp.slack_id, `Hi ${first} — our records show *${count} undertime days* (under ${UNDERTIME_THRESHOLD_HOURS} hours) this pay period (*${label}*). Please reply here or reach out to HR to explain.`);
      if (emp.email) await sendEmail(emp.email, `Action needed: undertime this pay period (${label})`, empTitle, label, empEmailHtml, 'View My Hours →', employeeUrl);
      await inApp(emp.id, empTitle, empBody, employeeUrl);
      await sendPush(emp.id, empTitle, empBody, employeeUrl);
    } catch (err) {
      console.error('undertime check failed for', emp.id, err);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // @ts-ignore EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(run().catch((e) => console.error('check-undertime failed', e)));
  return new Response(JSON.stringify({ ok: true, queued: true }), { headers: cors });
});
