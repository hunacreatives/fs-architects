import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dmAdmins } from '../_shared/slack.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function slackPost(path: string, body: unknown) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok || !json.ok) {
    console.error(`Slack API failed: ${path}`, { status: res.status, body, response: json });
    throw new Error(`Slack API failed: ${path} - ${json.error ?? res.status}`);
  }

  return json;
}

async function slackDm(userId: string, text: string) {
  const opened = await slackPost('conversations.open', { users: userId });
  await slackPost('chat.postMessage', {
    channel: opened.channel.id,
    text,
  });
}

function formatCurrency(amount: number | null | undefined) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount ?? 0));
}

async function sendNotification(batchId: string, closedByName?: string | null) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: batch, error: batchError } = await supabase
    .from('hub_payroll_batches')
    .select('period_label, total_amount, contractor_count')
    .eq('id', batchId)
    .single();

  if (batchError || !batch) {
    console.error('notify-payroll-closed: batch lookup failed', batchError);
    throw batchError ?? new Error('Payroll batch not found');
  }

  const { data: owners, error: ownerError } = await supabase
    .from('hub_users')
    .select('id, slack_id, full_name')
    .eq('role', 'owner')
    .eq('status', 'active')
    .not('slack_id', 'is', null);

  if (ownerError) {
    console.error('notify-payroll-closed: owner lookup failed', ownerError);
    throw ownerError;
  }

  const closer = closedByName?.trim() || 'Payroll Admin';
  const total = formatCurrency(batch.total_amount);
  const contractorCount = Number(batch.contractor_count ?? 0);
  const message =
    `Payroll closed\n` +
    `Period: ${batch.period_label}\n` +
    `Total: ${total}\n` +
    `Contractors: ${contractorCount}\n` +
    `Closed by: ${closer}`;

  // In-app push to active owners
  for (const owner of owners ?? []) {
    if (owner.id) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: owner.id, title: 'Payroll closed', body: message }),
      }).catch(() => {});
    }
  }

  // Slack DM to FS admin (Francis Yu) + owner (Fretz)
  await dmAdmins(SLACK_BOT_TOKEN, { text: message });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { batch_id, closed_by_name } = await req.json();

    if (!batch_id) {
      return new Response(JSON.stringify({ error: 'batch_id required' }), { status: 400, headers: cors });
    }

    // @ts-ignore
    EdgeRuntime.waitUntil((async () => {
      try {
        await sendNotification(String(batch_id), closed_by_name ? String(closed_by_name) : null);
      } catch (error) {
        console.error('notify-payroll-closed background task failed', { batch_id, error });
      }
    })());

    return new Response(JSON.stringify({ ok: true, queued: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
