import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

Deno.serve(async () => {
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { ssl: 'require' });
  try {
    await sql.unsafe(`ALTER TABLE hub_daily_hours ADD COLUMN IF NOT EXISTS overtime_hours numeric NOT NULL DEFAULT 0`);
    await sql.end();
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    await sql.end();
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
