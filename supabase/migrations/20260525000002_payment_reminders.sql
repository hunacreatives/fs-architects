create table if not exists hub_payment_reminders (
  id serial primary key,
  project_id bigint references hub_projects(id) on delete cascade,
  send_date date not null,
  amount_due numeric(12,2),
  notes text,
  status text default 'pending', -- pending, sent, cancelled
  sent_at timestamptz,
  created_at timestamptz default now()
);

alter table hub_payment_reminders enable row level security;

create policy "admins manage payment reminders" on hub_payment_reminders
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')));
