import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { error: katError } = await supabase
    .from('hub_users')
    .update({ monthly_rate: 55000 })
    .eq('email', 'nellaskatleen@gmail.com');

  await supabase
    .from('hub_pending_rates')
    .update({ monthly_rate: 55000 })
    .eq('email', 'nellaskatleen@gmail.com');

  return new Response(
    JSON.stringify({ katleen: katError?.message || 'updated to 55000' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
