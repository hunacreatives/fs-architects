import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const startDates: { email: string; start_date: string; name: string }[] = [
    { email: 'nellaskatleen@gmail.com',      start_date: '2026-01-01', name: 'Katleen' },
    { email: 'duterteabigaile@gmail.com',    start_date: '2026-01-01', name: 'Abigail' },
    { email: 'angelalouiseando@gmail.com',   start_date: '2026-01-01', name: 'Angela' },
    { email: 'reevajumawan@gmail.com',       start_date: '2026-01-01', name: 'Reeva' },
    { email: 'claudettemaytahil@gmail.com',  start_date: '2026-02-06', name: 'Claudette' },
    { email: 'janreesepj@gmail.com',         start_date: '2026-03-16', name: 'Reese' },
  ];

  const results = [];

  for (const { email, start_date, name } of startDates) {
    const { error } = await supabase
      .from('hub_users')
      .update({ start_date })
      .eq('email', email);

    // Also update hub_pending_rates in case user hasn't signed up yet
    const { error: prError } = await supabase
      .from('hub_pending_rates')
      .update({ start_date })
      .eq('email', email);

    results.push({ name, email, start_date, hub_users_ok: !error, pending_rates_ok: !prError, error: error?.message });
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
