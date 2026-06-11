create table if not exists hub_project_tasks (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assignee_id uuid references hub_users(id) on delete set null,
  due_date date,
  created_by uuid references hub_users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists hub_project_activity (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  actor_id uuid references hub_users(id) on delete set null,
  actor_name text not null,
  description text not null,
  created_at timestamptz default now()
);

alter table hub_project_tasks enable row level security;
alter table hub_project_activity enable row level security;

create policy "Auth users read tasks" on hub_project_tasks for select to authenticated using (true);
create policy "Admins manage tasks" on hub_project_tasks for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));

create policy "Auth users read activity" on hub_project_activity for select to authenticated using (true);
create policy "Admins manage activity" on hub_project_activity for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));
