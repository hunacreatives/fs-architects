-- Correction to 20260807000005:
--
-- 1. project_percentage is salary data (see 20260624000008's C-01 fix) and
--    should NOT be in the general directory grant — it was added there by
--    mistake while chasing the login bug. It's already served correctly
--    through get_user_finance(), which every finance-reading page already
--    uses. Removing it here restores that security boundary.
--
-- 2. employee_id and employment_classification were genuinely missing from
--    every grant list since they were added. They are NOT finance data, so
--    they belong in the general directory grant.
--
-- Root cause note: the actual bug behind "no hub profile found for this
-- workspace" was never really about a missing grant column — it was that
-- src/contexts/AuthContext.tsx (and one contractor-detail page) used
-- `select('*')`, which requires every hub_users column to be grantable,
-- including the ones deliberately excluded for finance security. That's
-- fixed in code (HUB_USER_SAFE_COLUMNS, an explicit column list). This
-- migration just makes the grant itself correct and complete.

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
  auto_payroll, employee_id, employment_classification
) on hub_users to authenticated;
