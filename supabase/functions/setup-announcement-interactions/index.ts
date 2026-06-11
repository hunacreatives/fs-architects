import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

Deno.serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;
  const sql = postgres(dbUrl, { ssl: 'require' });

  const steps: [string, string][] = [
    ['reactions table', `CREATE TABLE IF NOT EXISTS hub_announcement_reactions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      announcement_id int REFERENCES hub_announcements(id) ON DELETE CASCADE,
      user_id uuid REFERENCES hub_users(id) ON DELETE CASCADE,
      emoji text NOT NULL,
      created_at timestamptz DEFAULT now(),
      UNIQUE(announcement_id, user_id, emoji)
    )`],
    ['reactions rls', `ALTER TABLE hub_announcement_reactions ENABLE ROW LEVEL SECURITY`],
    ['reactions read policy', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_announcement_reactions' AND policyname='Anyone reads reactions') THEN CREATE POLICY "Anyone reads reactions" ON hub_announcement_reactions FOR SELECT USING (auth.uid() IS NOT NULL); END IF; END $$`],
    ['reactions insert policy', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_announcement_reactions' AND policyname='Users insert own reactions') THEN CREATE POLICY "Users insert own reactions" ON hub_announcement_reactions FOR INSERT WITH CHECK (user_id = auth.uid()); END IF; END $$`],
    ['reactions delete policy', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_announcement_reactions' AND policyname='Users delete own reactions') THEN CREATE POLICY "Users delete own reactions" ON hub_announcement_reactions FOR DELETE USING (user_id = auth.uid()); END IF; END $$`],

    ['comments table', `CREATE TABLE IF NOT EXISTS hub_announcement_comments (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      announcement_id int REFERENCES hub_announcements(id) ON DELETE CASCADE,
      user_id uuid REFERENCES hub_users(id) ON DELETE CASCADE,
      body text NOT NULL,
      created_at timestamptz DEFAULT now()
    )`],
    ['comments rls', `ALTER TABLE hub_announcement_comments ENABLE ROW LEVEL SECURITY`],
    ['comments read policy', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_announcement_comments' AND policyname='Anyone reads comments') THEN CREATE POLICY "Anyone reads comments" ON hub_announcement_comments FOR SELECT USING (auth.uid() IS NOT NULL); END IF; END $$`],
    ['comments insert policy', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_announcement_comments' AND policyname='Users insert own comments') THEN CREATE POLICY "Users insert own comments" ON hub_announcement_comments FOR INSERT WITH CHECK (user_id = auth.uid()); END IF; END $$`],
    ['comments delete policy', `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hub_announcement_comments' AND policyname='Users delete own comments') THEN CREATE POLICY "Users delete own comments" ON hub_announcement_comments FOR DELETE USING (user_id = auth.uid()); END IF; END $$`],
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
