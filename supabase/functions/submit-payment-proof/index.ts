import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
import { getAdminSlackIds } from '../_shared/slack.ts';

async function slackPost(path: string, body: object) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function notifySlack(clientName: string, projectName: string, channel: string, amount: number | null) {
  const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const text = `💳 *Payment Proof Submitted*\n*${clientName}* sent proof for *${projectName}*${amount ? `\n> ${fmt(amount)} via ${channel}` : `\n> via ${channel}`}`;
  const notifyUsers = await getAdminSlackIds(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await Promise.all(notifyUsers.map(async (userId) => {
    const opened = await slackPost('conversations.open', { users: userId });
    const dmChannel = opened.ok ? opened.channel?.id : userId;
    await slackPost('chat.postMessage', {
      channel: dmChannel,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text } },
        {
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: 'Review Proof →', emoji: true },
            url: 'https://fsarchitects.ph/hub/admin/invoice-log',
            style: 'primary',
          }],
        },
      ],
    });
  }));
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const form = await req.formData();
    const token = String(form.get('token') ?? '');
    const payerName = String(form.get('payer_name') ?? '').trim();
    const payerEmail = String(form.get('payer_email') ?? '').trim();
    const paymentChannel = String(form.get('payment_channel') ?? '').trim();
    const amountRaw = String(form.get('amount') ?? '').trim();
    const referenceNumber = String(form.get('reference_number') ?? '').trim();
    const notes = String(form.get('notes') ?? '').trim();
    const proof = form.get('proof');

    if (!token || !payerName || !paymentChannel || !proof || !(proof instanceof File)) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 200, headers: cors });
    }

    const { data: link, error } = await supabase
      .from('hub_invoice_payment_links')
      .select('id, project_id, invoice_number, client_name, project_name, status')
      .eq('token', token)
      .single();

    if (error || !link) {
      return new Response(JSON.stringify({ error: 'Payment link not found' }), { status: 200, headers: cors });
    }

    if (link.status === 'submitted') {
      return new Response(JSON.stringify({ error: 'Proof of payment has already been submitted for this invoice.' }), { status: 200, headers: cors });
    }

    const ext = proof.name.includes('.') ? proof.name.split('.').pop() : 'jpg';
    const safeExt = (ext || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
    const path = `${link.id}/${Date.now()}.${safeExt}`;
    const { error: uploadError } = await supabase.storage
      .from('payment-proofs')
      .upload(path, proof, { upsert: true, contentType: proof.type || undefined });

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), { status: 200, headers: cors });
    }

    const { data: publicUrlData } = supabase.storage.from('payment-proofs').getPublicUrl(path);
    const amount = amountRaw ? parseFloat(amountRaw) : null;

    const { error: insertError } = await supabase.from('hub_payment_proof_submissions').insert({
      payment_link_id: link.id,
      project_id: link.project_id,
      invoice_number: link.invoice_number,
      client_name: link.client_name,
      project_name: link.project_name,
      payer_name: payerName,
      payer_email: payerEmail || null,
      payment_channel: paymentChannel,
      amount: Number.isFinite(amount as number) ? amount : null,
      reference_number: referenceNumber || null,
      notes: notes || null,
      proof_url: publicUrlData.publicUrl,
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), { status: 200, headers: cors });
    }

    await supabase
      .from('hub_invoice_payment_links')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', link.id);

    notifySlack(link.client_name, link.project_name, paymentChannel, Number.isFinite(amount as number) ? amount : null).catch(() => {});

    return new Response(JSON.stringify({ ok: true, proof_url: publicUrlData.publicUrl }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
