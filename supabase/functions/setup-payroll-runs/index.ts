import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

Deno.serve(async () => {
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { ssl: 'require' });

  const steps: [string, string][] = [
    ['payroll_runs table', `CREATE TABLE IF NOT EXISTS hub_payroll_runs (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      period_start date NOT NULL,
      period_end date NOT NULL,
      period_label text NOT NULL,
      total_amount numeric NOT NULL DEFAULT 0,
      payout_count int NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid')),
      submitted_by uuid REFERENCES hub_users(id),
      approved_by uuid REFERENCES hub_users(id),
      notes text,
      payment_date date,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`],
    ['rls', `ALTER TABLE hub_payroll_runs ENABLE ROW LEVEL SECURITY`],
    ['admin read', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_payroll_runs' AND policyname='Admins read runs') THEN CREATE POLICY "Admins read runs" ON hub_payroll_runs FOR SELECT USING (auth.uid() IS NOT NULL); END IF; END $$`],
    ['admin insert', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_payroll_runs' AND policyname='Admins insert runs') THEN CREATE POLICY "Admins insert runs" ON hub_payroll_runs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM hub_users u WHERE u.id = auth.uid() AND u.role IN ('admin','owner'))); END IF; END $$`],
    ['admin update', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_payroll_runs' AND policyname='Admins update runs') THEN CREATE POLICY "Admins update runs" ON hub_payroll_runs FOR UPDATE USING (EXISTS (SELECT 1 FROM hub_users u WHERE u.id = auth.uid() AND u.role IN ('admin','owner'))) WITH CHECK (EXISTS (SELECT 1 FROM hub_users u WHERE u.id = auth.uid() AND u.role IN ('admin','owner'))); END IF; END $$`],
  ];

  const results: any[] = [];
  for (const [name, query] of steps) {
    try { await sql.unsafe(query); results.push({ name, ok: true }); }
    catch (e: any) { results.push({ name, error: e.message }); }
  }
  await sql.end();
  return new Response(JSON.stringify({ results }, null, 2), { headers: { 'Content-Type': 'application/json' } });
});
