-- Ensure project_type allows 'retainer'
alter table hub_projects drop constraint if exists hub_projects_project_type_check;
alter table hub_projects add constraint hub_projects_project_type_check
  check (project_type in ('client', 'internal', 'retainer'));

-- Add monthly_rate_currency for USD retainer clients
alter table hub_projects add column if not exists monthly_rate_currency text not null default 'PHP';
