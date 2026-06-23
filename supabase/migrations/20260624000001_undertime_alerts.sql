-- ── Undertime 3-strike alerts ────────────────────────────────────────────────
-- Tracks which employees have already been alerted for hitting 3 undertime days
-- (raw clocked hours < 9 on a scheduled work day) within a pay period, so the
-- daily check fires the notification only once per employee per period.

create table if not exists hub_undertime_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references hub_users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  undertime_count int not null,
  created_at timestamptz not null default now(),
  unique (user_id, period_start)
);

alter table hub_undertime_alerts enable row level security;

create policy "Admins manage undertime alerts" on hub_undertime_alerts
  for all to authenticated
  using (exists (select 1 from hub_users u where u.id = auth.uid() and u.role in ('owner','admin','hr')));

create policy "Employees view own undertime alerts" on hub_undertime_alerts
  for select to authenticated using (user_id = auth.uid());

-- Run the undertime check every day at midnight PHT (UTC 16:00). The function
-- only counts fully-completed days (strictly before today), so a day in progress
-- never registers as undertime.
select cron.schedule(
  'check-undertime',
  '0 16 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/check-undertime',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
