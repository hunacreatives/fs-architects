alter table hub_project_tasks add column if not exists archived boolean not null default false;
alter table hub_project_tasks add column if not exists archived_at timestamptz;
create index if not exists hub_project_tasks_archived_idx on hub_project_tasks(project_id, archived);
