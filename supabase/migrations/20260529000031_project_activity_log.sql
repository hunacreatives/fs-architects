create table if not exists hub_project_activity (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  user_id uuid references hub_users(id) on delete set null,
  action text not null, -- 'task_created', 'task_status_changed', 'task_assigned', 'comment_added', 'task_deleted'
  entity_type text not null default 'task',
  entity_id bigint,
  entity_title text,
  meta jsonb,
  created_at timestamptz default now()
);

alter table hub_project_activity enable row level security;

create policy "Auth users read project activity"
  on hub_project_activity for select to authenticated using (true);

create policy "Auth users insert project activity"
  on hub_project_activity for insert to authenticated
  with check (user_id = auth.uid());
