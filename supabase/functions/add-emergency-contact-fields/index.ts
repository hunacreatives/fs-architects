import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Use the pg REST endpoint directly for DDL
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      sql: `ALTER TABLE hub_users
              ADD COLUMN IF NOT EXISTS emergency_contact_name text,
              ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
              ADD COLUMN IF NOT EXISTS emergency_contact_phone text;`
    }),
  });

  // Fallback: use Supabase client with a dummy query to test columns exist
  const supabase = createClient(url, serviceKey);
  const { error: testErr } = await supabase
    .from('hub_users')
    .select('emergency_contact_name, emergency_contact_relationship, emergency_contact_phone')
    .limit(1);

  if (!testErr) {
    return new Response(JSON.stringify({ ok: true, message: 'Columns already exist or were added' }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: testErr.message }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
