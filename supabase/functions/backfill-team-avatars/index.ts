const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const PHOTOS: { file: string; keywords: string[] }[] = [
  { file: '/images/team/fretz.webp', keywords: ['fretz', 'suralta'] },
  { file: '/images/team/dan.webp', keywords: ['danielle', 'cabahug'] },
  { file: '/images/team/john.webp', keywords: ['ricarte'] },
  { file: '/images/team/jan.webp', keywords: ['declaro'] },
  { file: '/images/team/gab.webp', keywords: ['gabriel', 'sanchez', 'elijah'] },
  { file: '/images/team/mikee.webp', keywords: ['mikee', 'ryza', 'yu'] },
  { file: '/images/team/neil.webp', keywords: ['neil', 'atupan'] },
  { file: '/images/team/chico.webp', keywords: ['chico', 'palanas'] },
  { file: '/images/team/juls.webp', keywords: ['julius', 'quintos', 'elbert', 'juls'] },
];

function matchPhoto(fullName: string): string | null {
  const name = fullName.toLowerCase();
  for (const p of PHOTOS) {
    for (const kw of p.keywords) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(name)) return p.file;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hub_users?select=id,full_name,avatar_url`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const users = await res.json();

    const updated: { full_name: string; avatar_url: string }[] = [];
    const skipped: { full_name: string; reason: string }[] = [];

    for (const u of users) {
      if (u.avatar_url) { skipped.push({ full_name: u.full_name, reason: 'already has avatar' }); continue; }
      const match = matchPhoto(u.full_name || '');
      if (!match) { skipped.push({ full_name: u.full_name, reason: 'no matching photo' }); continue; }

      const upRes = await fetch(`${SUPABASE_URL}/rest/v1/hub_users?id=eq.${u.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ avatar_url: match }),
      });

      if (upRes.ok) updated.push({ full_name: u.full_name, avatar_url: match });
      else skipped.push({ full_name: u.full_name, reason: `update failed: ${await upRes.text()}` });
    }

    return new Response(JSON.stringify({ updated, skipped }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
