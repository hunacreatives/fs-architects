import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Check what columns exist in hub_pending_rates
  const { data: sample } = await supabase.from('hub_pending_rates').select('*').limit(5);

  const fixed = [
    { email: 'nellaskatleen@gmail.com', monthly_rate: 55000 },
    { email: 'claudettegamboa.work@gmail.com', monthly_rate: 12000 },
  ];
  const hourly = [
    { email: 'reevabarbaza@gmail.com', hourly_rate: 4 },
    { email: 'reesebarbaza@gmail.com', hourly_rate: 4 },
  ];

  const results: any[] = [];

  for (const f of fixed) {
    const { error } = await supabase.from('hub_pending_rates')
      .upsert({ email: f.email, payment_type: 'fixed', monthly_rate: f.monthly_rate }, { onConflict: 'email' });
    results.push({ email: f.email, type: 'fixed', error: error?.message ?? 'ok' });
  }
  for (const h of hourly) {
    const { error } = await supabase.from('hub_pending_rates')
      .upsert({ email: h.email, payment_type: 'hourly', hourly_rate: h.hourly_rate }, { onConflict: 'email' });
    results.push({ email: h.email, type: 'hourly', error: error?.message ?? 'ok' });
  }

  return new Response(JSON.stringify({ sample, results }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
