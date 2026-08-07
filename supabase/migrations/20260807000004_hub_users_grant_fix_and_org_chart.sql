-- Critical fix: hub_users has a strict column-level SELECT lockdown
-- (20260624000014) — every column must be explicitly re-granted to
-- `authenticated` or it's silently unreadable through the normal client,
-- even though it's fully visible via the SQL editor (which runs as
-- superuser and bypasses grants entirely — that's why this went unnoticed).
-- team, team_lead_of, and timesheet_sheet_id (added earlier today) were
-- never added to this list, so every query reading them through the app
-- has been failing. Also adds manager_id + role_title for the org-chart
-- feature, granted from the start this time.

alter table hub_users
  add column if not exists manager_id uuid references hub_users(id) on delete set null,
  add column if not exists role_title text;

revoke select on hub_users from authenticated;
revoke select on hub_users from anon;

grant select (
  id, full_name, email, role, avatar_url, phone, birthday, address,
  emergency_contact, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
  slack_username, slack_id, department, start_date, status, onboarding_completed,
  is_developer, shift_start, shift_end, work_days, annual_pto_days, annual_sick_days,
  contract_expiry_date, dev_toolbar_hidden, currency, payment_type,
  avatar_position, avatar_scale, created_at, updated_at, last_seen_app_version,
  team, team_lead_of, timesheet_sheet_id, manager_id, role_title
) on hub_users to authenticated;
