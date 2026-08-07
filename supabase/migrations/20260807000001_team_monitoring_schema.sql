-- Phase 1 of team-based project monitoring: schema + permissions foundation.
-- Three teams, named after their leads' initials: CP (Chico Palanas, olive
-- green), EGS (Elijah Gabriel Sanchez, navy blue), FS (Fretz Suralta, powder
-- blue — the owner's own team, no separate lead needed since the owner
-- already has full access everywhere).
--
-- Deliberately NOT introducing a new hub_users.role value for team leads —
-- many existing queries filter role = 'contractor' / role in ('contractor',
-- 'admin') for payroll, attendance, and time-off eligibility. A new role
-- would silently exclude Chico/Gab from all of that. Instead, team_lead_of
-- is a separate, purely additive flag: they stay role='contractor' for every
-- existing purpose, and only unlock new team-scoped permissions via this
-- column.

alter table hub_users
  add column if not exists team text check (team in ('cp', 'egs', 'fs')),
  add column if not exists team_lead_of text check (team_lead_of in ('cp', 'egs', 'fs')),
  add column if not exists timesheet_sheet_id text;

alter table hub_projects
  add column if not exists team text check (team in ('cp', 'egs', 'fs'));

alter table hub_project_tasks
  add column if not exists team text check (team in ('cp', 'egs', 'fs')),
  add column if not exists hours_spent numeric;

-- ── hub_projects: team leads can update (not create/delete) their own
-- team's projects. SELECT is already `using (true)` for all authenticated
-- users (20260523000012), so "view all projects" needs no change.
create policy "Team leads update own team projects" on hub_projects
  for update to authenticated
  using (exists (select 1 from hub_users u where u.id = auth.uid() and u.team_lead_of = hub_projects.team))
  with check (exists (select 1 from hub_users u where u.id = auth.uid() and u.team_lead_of = hub_projects.team));

-- ── hub_project_tasks: team leads can create and update tasks scoped to
-- their own team. SELECT is already `using (true)` (20260529000010).
create policy "Team leads insert own team tasks" on hub_project_tasks
  for insert to authenticated
  with check (exists (select 1 from hub_users u where u.id = auth.uid() and u.team_lead_of = hub_project_tasks.team));

create policy "Team leads update own team tasks" on hub_project_tasks
  for update to authenticated
  using (exists (select 1 from hub_users u where u.id = auth.uid() and u.team_lead_of = hub_project_tasks.team))
  with check (exists (select 1 from hub_users u where u.id = auth.uid() and u.team_lead_of = hub_project_tasks.team));

-- ── hub_project_contractors: team leads can add/remove their own
-- teammates on projects that belong to their team.
create policy "Team leads manage own team project contractors" on hub_project_contractors
  for all to authenticated
  using (exists (
    select 1 from hub_projects p
    join hub_users u on u.team_lead_of = p.team
    where p.id = hub_project_contractors.project_id and u.id = auth.uid()
  ))
  with check (exists (
    select 1 from hub_projects p
    join hub_users u on u.team_lead_of = p.team
    where p.id = hub_project_contractors.project_id and u.id = auth.uid()
  ));

-- Tag the two leads (safe to re-run — no-op if already set or names change).
update hub_users set team = 'cp', team_lead_of = 'cp' where full_name ilike '%chico palanas%';
update hub_users set team = 'egs', team_lead_of = 'egs' where full_name ilike '%elijah gabriel sanchez%';
update hub_users set team = 'fs' where full_name ilike '%fretz suralta%';
