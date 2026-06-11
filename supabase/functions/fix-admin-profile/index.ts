import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

Deno.serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;
  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const result = await sql.unsafe(`
      UPDATE hub_users
      SET
        full_name  = 'Francis Fiel Roble',
        avatar_url = 'https://images.squarespace-cdn.com/content/v1/688d8b734aa1173915369520/4ea0f3e2-5d0d-4fbd-b1e8-e899bd2b7ea4/Francis+Fiel+Roble',
        updated_at = now()
      WHERE email = 'francisfielroble@gmail.com'
      RETURNING id, full_name, avatar_url
    `);
    await sql.end();
    return new Response(JSON.stringify({ ok: true, updated: result }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    await sql.end();
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
