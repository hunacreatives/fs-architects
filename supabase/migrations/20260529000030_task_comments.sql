create table if not exists hub_project_task_comments (
  id bigserial primary key,
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  user_id uuid not null references hub_users(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

alter table hub_project_task_comments enable row level security;

create policy "Auth users read task comments"
  on hub_project_task_comments for select to authenticated using (true);

create policy "Auth users insert task comments"
  on hub_project_task_comments for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users delete own comments or admins delete any"
  on hub_project_task_comments for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner'))
  );
