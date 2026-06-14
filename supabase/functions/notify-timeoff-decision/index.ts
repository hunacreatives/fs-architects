import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const TIMEOFF_URL = `${HUB_BASE_URL}/hub/employee/timeoff`;

async function sendPush(user_id: string, title: string, body: string, url?: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, title, body, url }),
    });
  } catch {}
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function slackDm(userId: string, text: string) {
  if (!SLACK_BOT_TOKEN) return;
  const opened = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: userId }),
  });
  const openedJson = await opened.json();
  const channel = openedJson.ok ? openedJson.channel?.id : userId;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { contractor_id, leave_type, start_date, end_date, decision } = await req.json() as {
      contractor_id: string;
      leave_type: string;
      start_date: string;
      end_date: string;
      decision: 'approved' | 'rejected';
    };

    if (!contractor_id || !leave_type || !start_date || !end_date || !decision) {
      return new Response(JSON.stringify({ error: 'contractor_id, leave_type, start_date, end_date, and decision are required' }), { status: 400, headers: cors });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: user } = await supabase
      .from('hub_users')
      .select('slack_id')
      .eq('id', contractor_id)
      .single();

    let slackText: string;
    let notifTitle: string;
    let notifBody: string;

    if (decision === 'approved') {
      slackText = `✅ *Time off approved*\nYour ${leave_type} request for ${start_date} to ${end_date} has been approved.\nEnjoy your time off! 🙏\n<${TIMEOFF_URL}|View →>`;
      notifTitle = 'Time off approved';
      notifBody = `Your ${leave_type} request for ${start_date} to ${end_date} has been approved.`;
    } else {
      slackText = `❌ *Time off request not approved*\nYour ${leave_type} request for ${start_date} to ${end_date} was not approved this time.\nFeel free to message us if you'd like to discuss.\n<${TIMEOFF_URL}|View →>`;
      notifTitle = 'Time off not approved';
      notifBody = `Your ${leave_type} request for ${start_date} to ${end_date} was not approved.`;
    }

    if (user?.slack_id) {
      await slackDm(user.slack_id, slackText).catch(() => {});
    }

    await supabase.from('hub_notifications').insert({
      user_id: contractor_id,
      type: decision === 'approved' ? 'timeoff_approved' : 'timeoff_rejected',
      title: notifTitle,
      body: notifBody,
      link: TIMEOFF_URL,
      read: false,
    }).catch(() => {});

    await sendPush(contractor_id, notifTitle, notifBody, TIMEOFF_URL);

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
