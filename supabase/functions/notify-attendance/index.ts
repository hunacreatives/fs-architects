const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HUB_BASE_URL = Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph';
const HUB_URL = `${HUB_BASE_URL}/hub/admin/attendance`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function dbQuery<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T[]>;
}

async function dbSelect<T = Record<string, unknown>>(
  table: string,
  select: string,
  filters: Record<string, unknown> = {},
): Promise<T[]> {
  const params = new URLSearchParams({ select });
  for (const [k, v] of Object.entries(filters)) {
    params.set(k, `eq.${v}`);
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T[]>;
}

async function dbSelectWithFilter<T = Record<string, unknown>>(
  table: string,
  select: string,
  query: string,
): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&${query}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T[]>;
}

async function dbInsert(table: string, row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('dbInsert error', text);
  }
}

async function sendPush(user_id: string, title: string, body: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, title, body, url: HUB_URL }),
    });
  } catch {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const payload = await req.json();

    const record = payload.record;
    const oldRecord = payload.old_record;
    const eventType = payload.type; // INSERT or UPDATE

    if (!record?.user_id) return new Response('no user_id', { headers: cors });

    // Manual admin corrections (EditHoursModal) aren't live punches — don't fire "clocked in/out" pushes for them
    if (record.is_manual) return new Response('manual edit, no push needed', { headers: cors });

    // Get contractor name
    const users = await dbSelect<{ full_name: string }>('hub_users', 'full_name', { id: record.user_id });
    const name = users[0]?.full_name ?? 'Someone';
    const firstName = name.split(' ')[0];

    let title: string;
    let body: string;
    let eventTime: string;

    if (eventType === 'INSERT') {
      title = `${firstName} clocked in`;
      body = 'Now in the office';
      // hub_daily_hours has no created_at column — first_on is the actual clock-in instant
      eventTime = record.first_on ?? new Date().toISOString();
    } else if (eventType === 'UPDATE' && record.last_off && !oldRecord?.last_off) {
      const raw = record.hours_raw ? parseFloat(record.hours_raw) : 0;
      const hours = raw % 1 === 0 ? raw.toFixed(0) : raw.toFixed(1);
      title = `${firstName} clocked out`;
      body = `Logged ${hours} hours today`;
      eventTime = record.last_off ?? new Date().toISOString();
    } else {
      return new Response('no push needed', { headers: cors });
    }

    // Get all owners and admins (excluding the contractor who clocked in/out)
    const admins = await dbSelectWithFilter<{ id: string }>(
      'hub_users',
      'id',
      `status=eq.active&role=in.(owner,admin)&id=neq.${record.user_id}`,
    );

    // Send push + insert hub_notification for each admin (deduplicated: skip if same event already inserted within 5 min)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await Promise.all(
      (admins ?? []).map(async (a) => {
        const existing = await dbSelectWithFilter<{ id: string }>(
          'hub_notifications',
          'id',
          `user_id=eq.${a.id}&type=eq.attendance&created_at=gte.${encodeURIComponent(fiveMinAgo)}&title=like.${encodeURIComponent(`*${firstName}*`)}`,
        );
        if (existing.length > 0) return; // already notified for this event
        await sendPush(a.id, title, body);
        await dbInsert('hub_notifications', {
          user_id: a.id,
          type: 'attendance',
          title,
          body,
          link: HUB_URL,
          read: false,
          created_at: eventTime,
        });
      }),
    );

    return new Response(JSON.stringify({ sent: (admins ?? []).length }), { headers: cors });
  } catch (e) {
    console.error('notify-attendance error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
