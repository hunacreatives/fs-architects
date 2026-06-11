import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

Deno.serve(async () => {
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { ssl: 'require' });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Add columns
  await sql.unsafe(`
    ALTER TABLE hub_users
      ADD COLUMN IF NOT EXISTS phone text,
      ADD COLUMN IF NOT EXISTS birthday text,
      ADD COLUMN IF NOT EXISTS emergency_contact_name text,
      ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
      ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
  `);
  await sql.end();

  // Seed contact info for active contractors
  const contacts = [
    {
      email: 'nellaskatleen@gmail.com',
      phone: '09568917740',
      birthday: 'September 14, 1997',
      emergency_contact_name: 'Keanu Nellas',
      emergency_contact_relationship: 'Brother',
      emergency_contact_phone: '09620997782',
    },
    {
      email: 'duterteabigaile@gmail.com',
      phone: '09154547654',
      birthday: 'June 13, 1996',
      emergency_contact_name: 'Roussel L. Duterte',
      emergency_contact_relationship: 'Spouse',
      emergency_contact_phone: '09154501314',
    },
    {
      email: 'reevajumawan@gmail.com',
      phone: '09065361558',
      birthday: 'July 25, 1995',
      emergency_contact_name: 'Reese Jumawan',
      emergency_contact_relationship: 'Sister',
      emergency_contact_phone: '+63 977 472 4164',
    },
    {
      email: 'angelalouiseando@gmail.com',
      phone: '09952983725',
      birthday: 'February 4, 2002',
      emergency_contact_name: 'Ava Sunday May Masaya',
      emergency_contact_relationship: 'Partner',
      emergency_contact_phone: '09970136834',
    },
    {
      email: 'claudettemaytahil@gmail.com',
      phone: '09560125419',
      birthday: 'July 24, 1996',
      emergency_contact_name: 'Rodulfo Tahil',
      emergency_contact_relationship: 'Father',
      emergency_contact_phone: '09173105826',
    },
  ];

  const results: any[] = [];
  for (const c of contacts) {
    const { email, ...fields } = c;
    const { error } = await supabase.from('hub_users').update(fields).eq('email', email);
    results.push({ email, error: error?.message || 'ok' });
  }

  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
});
