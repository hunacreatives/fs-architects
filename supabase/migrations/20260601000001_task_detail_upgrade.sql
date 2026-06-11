-- ── Task status: add in_review and blocked ───────────────────────────────────
alter table hub_project_tasks drop constraint if exists hub_project_tasks_status_check;
alter table hub_project_tasks add constraint hub_project_tasks_status_check
  check (status in ('todo', 'in_progress', 'in_review', 'blocked', 'done'));

-- ── Add start_date and checklist to tasks ─────────────────────────────────────
alter table hub_project_tasks add column if not exists start_date date;
alter table hub_project_tasks add column if not exists checklist jsonb default '[]'::jsonb;

-- ── Task attachments ──────────────────────────────────────────────────────────
create table if not exists hub_project_task_attachments (
  id bigserial primary key,
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  uploaded_by uuid references hub_users(id) on delete set null,
  name text not null,
  url text not null,
  size bigint,
  mime_type text,
  created_at timestamptz default now()
);

alter table hub_project_task_attachments enable row level security;

create policy "read task attachments"
  on hub_project_task_attachments for select to authenticated using (true);

create policy "upload task attachments"
  on hub_project_task_attachments for insert to authenticated with check (true);

create policy "delete task attachments"
  on hub_project_task_attachments for delete to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner'))
  );

-- ── Task watchers ─────────────────────────────────────────────────────────────
create table if not exists hub_project_task_watchers (
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  user_id uuid not null references hub_users(id) on delete cascade,
  primary key (task_id, user_id)
);

alter table hub_project_task_watchers enable row level security;

create policy "manage task watchers"
  on hub_project_task_watchers for all to authenticated using (true) with check (true);

-- ── Per-task activity log ─────────────────────────────────────────────────────
create table if not exists hub_project_task_activity (
  id bigserial primary key,
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  actor_id uuid references hub_users(id) on delete set null,
  actor_name text not null,
  type text not null,
  description text not null,
  created_at timestamptz default now()
);

alter table hub_project_task_activity enable row level security;

create policy "read task activity"
  on hub_project_task_activity for select to authenticated using (true);

create policy "log task activity"
  on hub_project_task_activity for insert to authenticated with check (true);

-- ── Storage bucket for task attachments ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 26214400, null)
on conflict (id) do nothing;

create policy "upload task attachment files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'task-attachments');

create policy "read task attachment files"
  on storage.objects for select to authenticated
  using (bucket_id = 'task-attachments');

create policy "delete task attachment files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'task-attachments');
