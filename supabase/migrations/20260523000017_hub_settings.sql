create table if not exists hub_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

insert into hub_settings (key, value) values ('usd_rate', '56') on conflict (key) do nothing;

alter table hub_settings enable row level security;

create policy "admins manage settings" on hub_settings
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')));

create policy "hub users read settings" on hub_settings
  for select to authenticated
  using (true);
