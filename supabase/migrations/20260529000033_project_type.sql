alter table hub_projects
  add column if not exists project_type text not null default 'client'
  check (project_type in ('client', 'internal'));
