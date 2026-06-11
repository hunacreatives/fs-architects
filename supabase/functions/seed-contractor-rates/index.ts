import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

Deno.serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;
  const sql = postgres(dbUrl, { ssl: 'require' });

  const results: any[] = [];

  try {
    // Step 1: Add missing columns to hub_users
    const migrations = [
      ['currency col', `ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS currency text DEFAULT 'PHP'`],
      ['bank_name col', `ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS bank_name text`],
      ['bank_account_name col', `ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS bank_account_name text`],
      ['bank_account_number col', `ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS bank_account_number text`],
      ['bank_account_type col', `ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS bank_account_type text`],
      ['notes col', `ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS notes text`],
      ['hub_pending_rates table', `
        CREATE TABLE IF NOT EXISTS hub_pending_rates (
          email text PRIMARY KEY,
          payment_type text DEFAULT 'hourly' CHECK (payment_type IN ('hourly', 'fixed')),
          hourly_rate numeric,
          monthly_rate numeric,
          currency text DEFAULT 'PHP',
          bank_name text,
          bank_account_number text,
          start_date date,
          created_at timestamptz DEFAULT now()
        )
      `],
    ['start_date col on pending_rates', `ALTER TABLE hub_pending_rates ADD COLUMN IF NOT EXISTS start_date date`],
    ];

    for (const [name, query] of migrations) {
      try {
        await sql.unsafe(query);
        results.push({ step: name, ok: true });
      } catch (e: any) {
        results.push({ step: name, error: e.message });
      }
    }

    // Step 2: Seed contractor rates
    const contractors = [
      { email: 'nellaskatleen@gmail.com',       payment_type: 'fixed',  hourly_rate: null, monthly_rate: 45500, currency: 'PHP', bank_name: 'Banco De Oro (BDO)', bank_account_number: '002940326904', start_date: '2024-12-04' },
      { email: 'duterteabigaile@gmail.com',      payment_type: 'fixed',  hourly_rate: null, monthly_rate: 5000,  currency: 'PHP', bank_name: 'Banco De Oro (BDO)', bank_account_number: '007680243392', start_date: '2025-06-14' },
      { email: 'angelalouiseando@gmail.com',     payment_type: 'fixed',  hourly_rate: null, monthly_rate: 27000, currency: 'PHP', bank_name: 'GoTyme',              bank_account_number: '018871813232', start_date: '2025-10-30' },
      { email: 'janreesepj@gmail.com',           payment_type: 'hourly', hourly_rate: 4,    monthly_rate: null,  currency: 'USD', bank_name: 'GoTyme',              bank_account_number: null,           start_date: '2025-04-22' },
      { email: 'reevajumawan@gmail.com',         payment_type: 'hourly', hourly_rate: 4,    monthly_rate: null,  currency: 'USD', bank_name: 'BDO',                 bank_account_number: '002310885521', start_date: '2025-05-30' },
      { email: 'claudettemaytahil@gmail.com',    payment_type: 'fixed',  hourly_rate: null, monthly_rate: 12000, currency: 'PHP', bank_name: 'GoTyme',              bank_account_number: '013352128068', start_date: '2026-02-05' },
    ];

    for (const c of contractors) {
      try {
        await sql.unsafe(`
          INSERT INTO hub_pending_rates (email, payment_type, hourly_rate, monthly_rate, currency, bank_name, bank_account_number, start_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (email) DO UPDATE SET
            payment_type = EXCLUDED.payment_type,
            hourly_rate = EXCLUDED.hourly_rate,
            monthly_rate = EXCLUDED.monthly_rate,
            currency = EXCLUDED.currency,
            bank_name = EXCLUDED.bank_name,
            bank_account_number = EXCLUDED.bank_account_number,
            start_date = EXCLUDED.start_date
        `, [c.email, c.payment_type, c.hourly_rate, c.monthly_rate, c.currency, c.bank_name, c.bank_account_number, c.start_date]);
        results.push({ step: `rate: ${c.email}`, ok: true });
      } catch (e: any) {
        results.push({ step: `rate: ${c.email}`, error: e.message });
      }
    }

    await sql.end();
    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
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
