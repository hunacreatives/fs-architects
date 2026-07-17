-- Weekend overtime reminder — once per weekend day, sent to the attendance
-- channel 1 minute after the first "on" punch, nudging people to file an OT
-- request before their shift ends. unique(date) is the once-per-day guard.
create table if not exists hub_weekend_ot_reminders (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  created_at timestamptz not null default now(),
  unique (date)
);

alter table hub_weekend_ot_reminders enable row level security;

create policy "Admins manage weekend OT reminders" on hub_weekend_ot_reminders
  for all to authenticated
  using (exists (select 1 from hub_users u where u.id = auth.uid() and u.role in ('owner','admin','hr')));
