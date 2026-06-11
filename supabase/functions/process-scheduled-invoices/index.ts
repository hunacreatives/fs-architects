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

  const now = new Date().toISOString();

  const { data: invoices, error } = await supabase
    .from('hub_scheduled_invoices')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: cors });
  }

  const results: { id: number; ok: boolean; error?: string }[] = [];

  for (const invoice of invoices ?? []) {
    try {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          to: invoice.to_email,
          cc: invoice.cc_email,
          subject: invoice.subject,
          client_name: invoice.client_name,
          project_name: invoice.project_name,
          service: invoice.service,
          contract_price: invoice.contract_price,
          start_date: invoice.start_date,
          deadline: invoice.due_date,
          payments: invoice.payments ?? [],
          show_payments: invoice.show_payments,
          line_items: invoice.line_items ?? [],
          notes: invoice.notes,
          bill_to_name: invoice.bill_to_name,
          bill_to_address: invoice.bill_to_address,
          reference: invoice.reference,
          payment_terms: invoice.payment_terms,
          message: invoice.message,
          invoice_number: invoice.invoice_number,
          project_id: invoice.project_id,
          amount_requested: invoice.amount_requested ?? undefined,
        }),
      });

      const body = await res.json();
      if (!body.ok) {
        await supabase
          .from('hub_scheduled_invoices')
          .update({ status: 'failed', last_error: body.error ?? 'Failed to send invoice' })
          .eq('id', invoice.id);
        results.push({ id: invoice.id, ok: false, error: body.error ?? 'Failed to send invoice' });
        continue;
      }

      await supabase
        .from('hub_scheduled_invoices')
        .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
        .eq('id', invoice.id);

      results.push({ id: invoice.id, ok: true });
    } catch (err) {
      const message = String(err);
      await supabase
        .from('hub_scheduled_invoices')
        .update({ status: 'failed', last_error: message })
        .eq('id', invoice.id);
      results.push({ id: invoice.id, ok: false, error: message });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), { headers: cors });
});
