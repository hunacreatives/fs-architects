-- ── Forgot-to-clock-out reminders ────────────────────────────────────────────
-- Dedup guard so the remind-clockout job DMs each employee at most once per day.

create table if not exists hub_clockout_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references hub_users(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table hub_clockout_reminders enable row level security;

create policy "Admins manage clockout reminders" on hub_clockout_reminders
  for all to authenticated
  using (exists (select 1 from hub_users u where u.id = auth.uid() and u.role in ('owner','admin','hr')));
