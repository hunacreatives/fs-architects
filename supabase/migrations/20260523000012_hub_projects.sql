create table if not exists hub_projects (
  id bigserial primary key,
  client_name text not null,
  project_name text not null,
  service text,
  contract_price numeric(12,2) not null default 0,
  status text not null default 'ongoing' check (status in ('ongoing', 'completed', 'paused', 'cancelled')),
  start_date date,
  deadline date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists hub_project_payments (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  amount numeric(12,2) not null,
  paid_at date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists hub_project_costs (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  label text not null,
  amount numeric(12,2) not null,
  date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists hub_project_contractors (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  contractor_id uuid not null references hub_users(id) on delete cascade,
  percentage numeric(5,2) not null,
  payout_status text not null default 'pending' check (payout_status in ('pending', 'approved', 'paid')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  unique(project_id, contractor_id)
);

-- RLS
alter table hub_projects enable row level security;
alter table hub_project_payments enable row level security;
alter table hub_project_costs enable row level security;
alter table hub_project_contractors enable row level security;

create policy "Authenticated users can read projects" on hub_projects for select to authenticated using (true);
create policy "Admins can manage projects" on hub_projects for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));

create policy "Authenticated users can read project payments" on hub_project_payments for select to authenticated using (true);
create policy "Admins can manage project payments" on hub_project_payments for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));

create policy "Authenticated users can read project costs" on hub_project_costs for select to authenticated using (true);
create policy "Admins can manage project costs" on hub_project_costs for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));

create policy "Authenticated users can read project contractors" on hub_project_contractors for select to authenticated using (true);
create policy "Admins can manage project contractors" on hub_project_contractors for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));
