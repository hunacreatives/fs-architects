import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 200, headers: cors });
    }

    const { data: link, error } = await supabase
      .from('hub_invoice_payment_links')
      .select('id, token, client_name, project_name, invoice_number, to_email, amount_due, due_date, line_items, payment_terms, reference, status, submitted_at')
      .eq('token', token)
      .single();

    if (error || !link) {
      return new Response(JSON.stringify({ error: 'Payment link not found' }), { status: 200, headers: cors });
    }

    const { data: proof } = await supabase
      .from('hub_payment_proof_submissions')
      .select('payer_name, payer_email, payment_channel, amount, reference_number, notes, proof_url, submitted_at')
      .eq('payment_link_id', link.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return new Response(JSON.stringify({ ok: true, link, proof: proof ?? null }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
