import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dmAdmins } from '../_shared/slack.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const PERFORMANCE_URL = `${HUB_BASE_URL}/hub/admin/performance`;

// Remind this many days before the quarterly milestone, and again on the day.
const LEAD_DAYS = 7;
// An appraisal created within this window before a milestone counts as "already
// handled" for that quarter — no reminders fire.
const COVERED_DAYS = 75;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Today's date in PH time (UTC+8), at midnight
function todayPHT(): Date {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// start_date + N months, clamped to the last day of the target month
// (Jan 31 + 3mo → Apr 30, not May 1).
function addMonthsClamped(start: Date, months: number): Date {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay)));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Natural tenure phrasing: "3 months", "1 year", "1 year and 3 months", "2 years"
function tenureLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const y = years > 0 ? `${years} year${years > 1 ? 's' : ''}` : '';
  const m = rem > 0 ? `${rem} month${rem > 1 ? 's' : ''}` : '';
  return y && m ? `${y} and ${m}` : y || m;
}

function prettyDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const today = todayPHT();

  const { data: employees, error } = await supabase
    .from('hub_users')
    .select('id, full_name, start_date')
    .eq('status', 'active')
    .eq('role', 'contractor')
    .not('start_date', 'is', null);
  if (error) throw error;

  const { data: admins } = await supabase
    .from('hub_users')
    .select('id')
    .in('role', ['admin', 'owner', 'hr'])
    .eq('status', 'active');

  let sent = 0;

  for (const emp of employees ?? []) {
    const start = new Date(`${emp.start_date}T00:00:00Z`);
    if (isNaN(start.getTime())) continue;

    // Find a quarterly milestone landing exactly LEAD_DAYS out or today.
    for (let k = 1; k <= 120; k++) {
      const milestone = addMonthsClamped(start, k * 3);
      const daysUntil = Math.round((milestone.getTime() - today.getTime()) / 86400000);
      if (daysUntil > LEAD_DAYS) break;
      if (daysUntil !== LEAD_DAYS && daysUntil !== 0) continue;

      const stage = daysUntil === 0 ? 'day_of' : 'week_before';
      const months = k * 3;
      const milestoneDate = isoDate(milestone);

      // Already appraised this quarter? Skip both stages.
      const coveredSince = isoDate(new Date(milestone.getTime() - COVERED_DAYS * 86400000));
      const { count: appraised } = await supabase
        .from('hub_appraisals')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', emp.id)
        .gte('created_at', coveredSince);
      if ((appraised ?? 0) > 0) continue;

      // Dedupe — insert claims this reminder; a conflict means it already fired.
      const { error: claimError } = await supabase
        .from('hub_appraisal_reminders')
        .insert({ user_id: emp.id, milestone_date: milestoneDate, months, stage });
      if (claimError) continue;

      const label = tenureLabel(months);
      const when = daysUntil === 0 ? 'today' : `on ${prettyDate(milestone)} (in ${LEAD_DAYS} days)`;
      const title = daysUntil === 0
        ? `Quarterly appraisal due today — ${emp.full_name}`
        : `Quarterly appraisal coming up — ${emp.full_name}`;
      const body = `${emp.full_name}'s quarterly appraisal is due ${when} — that marks ${label} at FS Architects. Prepare the appraisal and schedule the 1-on-1.`;

      // In-app notifications for all active admins/owner/HR
      const rows = (admins ?? []).map((a) => ({
        user_id: a.id,
        type: 'appraisal_due',
        title,
        body,
        link: '/hub/admin/performance',
        read: false,
      }));
      if (rows.length > 0) await supabase.from('hub_notifications').insert(rows);

      // Push to the same people
      await Promise.all((admins ?? []).map((a) =>
        fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: a.id, title, body, url: '/hub/admin/performance' }),
        }).catch(() => {})
      ));

      // Slack DM to FS admin (Francis Yu) + owner (Fretz)
      await dmAdmins(SLACK_BOT_TOKEN, {
        text: `📋 *${title}*\n${body}\n<${PERFORMANCE_URL}|Open Performance →>`,
      }).catch(() => {});

      sent++;
    }
  }

  return { checked: employees?.length ?? 0, reminders: sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const result = await run();
    return new Response(JSON.stringify({ ok: true, ...result }), { headers: cors });
  } catch (err) {
    console.error('check-appraisal-due failed', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
