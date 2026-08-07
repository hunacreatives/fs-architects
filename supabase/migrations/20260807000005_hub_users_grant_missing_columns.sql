-- AuthContext fetches the logged-in user's profile with select('*'), which
-- under column-level grants requires every hub_users column to be granted,
-- not just the ones a given feature happens to use. The previous grant-fix
-- migration (20260807000004) missed project_percentage and auto_payroll,
-- so select('*') failed outright for every authenticated user, surfacing
-- as "Your account signed in, but no hub profile was found for this
-- workspace."

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
  project_percentage, auto_payroll
) on hub_users to authenticated;
