import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
Deno.serve(async () => {
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { ssl: 'require' });
  const steps = [
    `CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)`,
    `CREATE POLICY "Users update own avatar" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)`,
    `CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars')`,
    `CREATE POLICY "Users delete own avatar" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)`,
  ];
  const results = [];
  for (const q of steps) {
    try { await sql.unsafe(q); results.push({ ok: true, q: q.slice(0, 50) }); }
    catch (e: any) { results.push({ error: e.message, q: q.slice(0, 50) }); }
  }
  await sql.end();
  return new Response(JSON.stringify(results, null, 2), { headers: { 'Content-Type': 'application/json' } });
});
