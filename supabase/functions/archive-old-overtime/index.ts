import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async () => {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);

  const { count, error } = await supabase
    .from('hub_overtime_requests')
    .update({ archived: true })
    .lt('created_at', cutoff.toISOString())
    .eq('archived', false);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, archived: count }));
});
