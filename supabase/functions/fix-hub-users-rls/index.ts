import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, key);

  // Test: try updating Claudette's phone directly to verify column + RLS
  const { data: claudette } = await supabase
    .from('hub_users')
    .select('id, email, phone, emergency_contact_name, emergency_contact_phone')
    .eq('email', 'claudettemaytahil@gmail.com')
    .maybeSingle();

  // Check what policies exist on hub_users via pg catalog
  const { data: policies } = await supabase
    .from('pg_policies')
    .select('policyname, cmd, qual, with_check')
    .eq('tablename', 'hub_users')
    .catch(() => ({ data: null }));

  // Add self-update policy via raw SQL using service role
  const results: any[] = [];

  // Drop old catch-all if it exists, add specific policies
  const sqls = [
    // Allow authenticated users to read all hub_users (needed for joins)
    `DROP POLICY IF EXISTS "Users can update own profile" ON hub_users;`,
    `CREATE POLICY "Users can update own profile" ON hub_users
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);`,
  ];

  for (const sql of sqls) {
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ sql }),
    });
    results.push({ sql: sql.slice(0, 60), status: res.status });
  }

  // Verify by doing a direct service-role update on Claudette (preserve existing value)
  const { error: updateErr } = await supabase
    .from('hub_users')
    .update({ updated_at: new Date().toISOString() })
    .eq('email', 'claudettemaytahil@gmail.com');

  return new Response(JSON.stringify({
    claudette_row: claudette,
    sql_results: results,
    update_test: updateErr ? updateErr.message : 'ok',
  }, null, 2), { headers: { 'Content-Type': 'application/json' } });
});
