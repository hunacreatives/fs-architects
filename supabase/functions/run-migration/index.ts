import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

Deno.serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;
  const sql = postgres(dbUrl, { ssl: 'require' });

  const steps: [string, string][] = [
    ['payment_type col', `ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'hourly' CHECK (payment_type IN ('hourly', 'fixed'))`],
    ['monthly_rate col', 'ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS monthly_rate numeric'],
    ['hub_daily_hours table', `CREATE TABLE IF NOT EXISTS hub_daily_hours (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid REFERENCES hub_users(id) ON DELETE CASCADE,
      date date NOT NULL,
      hours_raw numeric NOT NULL DEFAULT 0,
      hours_capped numeric NOT NULL DEFAULT 0,
      first_on timestamptz,
      last_off timestamptz,
      updated_at timestamptz DEFAULT now(),
      UNIQUE(user_id, date)
    )`],
    ['enable RLS', 'ALTER TABLE hub_daily_hours ENABLE ROW LEVEL SECURITY'],
    ['admin policy', `DO $body$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_daily_hours' AND policyname='Admins manage daily hours') THEN CREATE POLICY "Admins manage daily hours" ON hub_daily_hours FOR ALL USING (is_hub_admin()) WITH CHECK (is_hub_admin()); END IF; END $body$`],
    ['contractor policy', `DO $body$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_daily_hours' AND policyname='Contractors view own hours') THEN CREATE POLICY "Contractors view own hours" ON hub_daily_hours FOR SELECT USING (user_id = auth.uid()); END IF; END $body$`],
  ];

  const results: any[] = [];
  for (const [name, query] of steps) {
    try {
      await sql.unsafe(query);
      results.push({ name, ok: true });
    } catch (e: any) {
      results.push({ name, error: e.message });
    }
  }

  await sql.end();
  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
});
