import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

Deno.serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;
  const sql = postgres(dbUrl, { ssl: 'require' });

  const steps: [string, string][] = [
    ['drop old all-in-one policy', `DROP POLICY IF EXISTS "Admins manage announcements" ON hub_announcements`],
    ['select policy', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_announcements' AND policyname='Admins read announcements') THEN CREATE POLICY "Admins read announcements" ON hub_announcements FOR SELECT USING (auth.uid() IS NOT NULL); END IF; END $$`],
    ['insert policy', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_announcements' AND policyname='Admins insert announcements') THEN CREATE POLICY "Admins insert announcements" ON hub_announcements FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM hub_users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'owner'))); END IF; END $$`],
    ['update policy', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_announcements' AND policyname='Admins update announcements') THEN CREATE POLICY "Admins update announcements" ON hub_announcements FOR UPDATE USING (EXISTS (SELECT 1 FROM hub_users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'owner'))) WITH CHECK (EXISTS (SELECT 1 FROM hub_users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'owner'))); END IF; END $$`],
    ['delete policy', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_announcements' AND policyname='Admins delete announcements') THEN CREATE POLICY "Admins delete announcements" ON hub_announcements FOR DELETE USING (EXISTS (SELECT 1 FROM hub_users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'owner'))); END IF; END $$`],
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
    headers: { 'Content-Type': 'application/json' },
  });
});
