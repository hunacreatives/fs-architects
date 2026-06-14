alter table hub_project_task_comments
  add column if not exists reactions jsonb not null default '{}';
