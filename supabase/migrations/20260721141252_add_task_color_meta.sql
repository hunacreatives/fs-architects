alter table public.hub_project_tasks
  add column if not exists color text,
  add column if not exists meta jsonb;
