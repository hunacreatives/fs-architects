import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN');
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const CREDS_URL = `${HUB_BASE_URL}/hub/employee/credentials`;

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function sendPush(user_id: string, title: string, body: string, url?: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, title, body, url }),
    });
  } catch (err) { console.error('send-push failed:', err); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { contractor_id, platform, client_name, decision } = await req.json() as {
      contractor_id: string;
      platform: string;
      client_name?: string;
      decision: 'approved' | 'denied';
    };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: user } = await supabase
      .from('hub_users')
      .select('slack_id')
      .eq('id', contractor_id)
      .single();

    const credLabel = `${platform}${client_name ? ` — ${client_name}` : ''}`;
    const approved = decision === 'approved';
    const notifTitle = approved ? 'Credential access granted' : 'Credential access denied';
    const notifBody = approved
      ? `You now have access to ${credLabel}.`
      : `Your request for access to ${credLabel} was not approved.`;

    const { error: notifErr } = await supabase.from('hub_notifications').insert({
      user_id: contractor_id,
      type: approved ? 'credential_approved' : 'credential_denied',
      title: notifTitle,
      body: notifBody,
      link: CREDS_URL,
      read: false,
    });
    if (notifErr) console.error('hub_notifications insert failed:', notifErr);

    if (user?.slack_id && SLACK_BOT_TOKEN) {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: user.slack_id,
          text: notifBody,
          unfurl_links: false,
          unfurl_media: false,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `${approved ? '🔓' : '🔒'} *${notifTitle}*\n${notifBody}` },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View Credentials →' },
                  url: CREDS_URL,
                  style: approved ? 'primary' : 'danger',
                },
              ],
            },
          ],
        }),
      }).catch((err) => console.error('Slack credential DM failed:', err));
    }

    await sendPush(contractor_id, notifTitle, notifBody, CREDS_URL);

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
