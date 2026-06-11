create table if not exists hub_project_contractor_payouts (
  id serial primary key,
  project_contractor_id integer not null references hub_project_contractors(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  paid_at date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

alter table hub_project_contractor_payouts enable row level security;

create policy "admins manage contractor payouts" on hub_project_contractor_payouts
  for all to authenticated
  using (
    exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr'))
  )
  with check (
    exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr'))
  );

create policy "contractors view own payouts" on hub_project_contractor_payouts
  for select to authenticated
  using (
    exists (
      select 1 from hub_project_contractors pc
      where pc.id = project_contractor_id and pc.contractor_id = auth.uid()
    )
  );
