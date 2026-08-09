-- UAP (United Architects of the Philippines) Field of Practice hour
-- tracking — junior architects/students need 3,840 logged hours across 6
-- categories before they can sit the board exam. track_uap_hours flags
-- which employees this applies to; uap_category is an explicit per-task
-- override of the category auto-derived from the project's Phase on the
-- frontend (Schematic Design -> A, Construction Documents -> B, etc.) —
-- needed because some phases (Schematic Design, Design Development) can
-- map to more than one category depending on what the task is actually
-- about (Interiors, MEPF).

alter table hub_users
  add column if not exists track_uap_hours boolean not null default false;

alter table hub_project_tasks
  add column if not exists uap_category text
    check (uap_category in ('A', 'B', 'C', 'D', 'E', 'F'));

-- hub_users has a column-level SELECT lockdown — every column must be
-- explicitly re-granted or it's silently unreadable via the normal client
-- (see 20260807000006 and its predecessors for the full history of this
-- gotcha). Re-running the full grant list here, now including
-- track_uap_hours.
revoke select on hub_users from authenticated;
revoke select on hub_users from anon;

grant select (
  id, full_name, email, role, avatar_url, phone, birthday, address,
  emergency_contact, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
  slack_username, slack_id, department, start_date, status, onboarding_completed,
  is_developer, shift_start, shift_end, work_days, annual_pto_days, annual_sick_days,
  contract_expiry_date, dev_toolbar_hidden, currency, payment_type,
  avatar_position, avatar_scale, created_at, updated_at, last_seen_app_version,
  team, team_lead_of, timesheet_sheet_id, manager_id, role_title,
  auto_payroll, employee_id, employment_classification, track_uap_hours
) on hub_users to authenticated;
