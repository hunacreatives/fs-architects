-- Teams were hardcoded to exactly 3 (cp/egs/fs) via check constraints and a
-- static frontend list. This replaces that with a real hub_teams table so
-- Fretz can create/edit/delete teams himself through a Manage Teams page,
-- no code changes needed going forward.

create table if not exists hub_teams (
  key text primary key,
  label text not null,
  lead_id uuid references hub_users(id) on delete set null,
  color text not null default '#94a3b8',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hub_teams enable row level security;

create policy "Authenticated users can read teams" on hub_teams
  for select to authenticated using (true);

create policy "Owner/admin manage teams" on hub_teams
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('owner', 'admin')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('owner', 'admin')));

-- Seed the 3 existing teams so nothing already tagged 'cp'/'egs'/'fs' breaks.
insert into hub_teams (key, label, lead_id, color)
select 'cp', 'Team CP', (select id from hub_users where full_name ilike '%chico palanas%'), '#808000'
where not exists (select 1 from hub_teams where key = 'cp');

insert into hub_teams (key, label, lead_id, color)
select 'egs', 'Team EGS', (select id from hub_users where full_name ilike '%elijah gabriel sanchez%'), '#1e3a8a'
where not exists (select 1 from hub_teams where key = 'egs');

insert into hub_teams (key, label, lead_id, color)
select 'fs', 'Team FS', (select id from hub_users where full_name ilike '%fretz suralta%'), '#a3c1e0'
where not exists (select 1 from hub_teams where key = 'fs');

-- Swap the fixed check constraints for foreign keys against hub_teams, so
-- any team key Fretz creates becomes valid everywhere immediately.
alter table hub_users drop constraint if exists hub_users_team_check;
alter table hub_users drop constraint if exists hub_users_team_lead_of_check;
alter table hub_users add constraint hub_users_team_fkey foreign key (team) references hub_teams(key) on delete set null;
alter table hub_users add constraint hub_users_team_lead_of_fkey foreign key (team_lead_of) references hub_teams(key) on delete set null;

alter table hub_projects drop constraint if exists hub_projects_team_check;
alter table hub_projects add constraint hub_projects_team_fkey foreign key (team) references hub_teams(key) on delete set null;

alter table hub_project_tasks drop constraint if exists hub_project_tasks_team_check;
alter table hub_project_tasks add constraint hub_project_tasks_team_fkey foreign key (team) references hub_teams(key) on delete set null;
