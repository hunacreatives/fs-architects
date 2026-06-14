import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const PAYOUTS_URL = `${HUB_BASE_URL}/hub/employee/payouts`;

async function sendPush(user_id: string, title: string, body: string, url?: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`, 'Content-Type': 'application/json' },
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
    const { batch_id, period_label, total_amount, contractor_ids } = await req.json();

    if (!batch_id || !period_label || !contractor_ids?.length) {
      return new Response(JSON.stringify({ error: 'batch_id, period_label, and contractor_ids are required' }), { status: 400, headers: cors });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const results: { contractor_id: string; ok: boolean; error?: string }[] = [];

    for (const contractor_id of contractor_ids as string[]) {
      try {
        // Fetch contractor user info
        const { data: user } = await supabase
          .from('hub_users')
          .select('full_name, slack_id')
          .eq('id', contractor_id)
          .single();

        // Fetch payout for this contractor in this batch
        const { data: payout } = await supabase
          .from('hub_payouts')
          .select('final_payout')
          .eq('batch_id', batch_id)
          .eq('contractor_id', contractor_id)
          .single();

        const finalPayout = payout?.final_payout ?? 0;
        const payoutFmt = '₱' + (finalPayout as number).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Send Slack DM if they have a slack_id
        if (user?.slack_id && SLACK_BOT_TOKEN) {
          await slackDm(
            user.slack_id,
            `✅ *Payroll approved*\nYour payment of ${payoutFmt} for ${period_label} has been approved by the owner and is being processed.\nPayment typically arrives within 1–2 business days. 🙏\n<${PAYOUTS_URL}|View payslip →>`,
          );
        }

        // Insert hub_notification
        await supabase.from('hub_notifications').insert({
          user_id: contractor_id,
          type: 'payroll_batch_approved',
          title: 'Payroll approved',
          body: `Your payment of ${payoutFmt} for ${period_label} has been approved.`,
          link: PAYOUTS_URL,
          read: false,
        }).catch(() => {});

        await sendPush(contractor_id, 'Payroll approved', `Your payment of ${payoutFmt} for ${period_label} has been approved and is being processed.`, PAYOUTS_URL);
        results.push({ contractor_id, ok: true });
      } catch (err) {
        results.push({ contractor_id, ok: false, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
