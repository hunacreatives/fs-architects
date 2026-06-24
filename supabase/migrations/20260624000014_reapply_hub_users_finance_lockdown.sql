-- C-01 (re-applied safely): re-revoke direct read of hub_users' sensitive
-- financial/bank columns, AFTER the frontend was updated to stop using SELECT *
-- and to read those values through get_user_finance(). This is the same intent as
-- 20260624000008 but is now safe because no query selects * or the sensitive
-- columns directly.
--
-- ORDER OF OPERATIONS (important):
--   1. Deploy the frontend that reads hub_users via HUB_USER_SAFE_COLUMNS.
--   2. Confirm login + payroll work on the live site.
--   3. THEN run this migration.
-- ROLLBACK if anything misbehaves:
--   grant select on hub_users to authenticated;
-- (that instantly restores full read and login.)

revoke select on hub_users from authenticated;
revoke select on hub_users from anon;

grant select (
  id, full_name, email, role, avatar_url, phone, birthday, address,
  emergency_contact, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
  slack_username, slack_id, department, start_date, status, onboarding_completed,
  is_developer, shift_start, shift_end, work_days, annual_pto_days, annual_sick_days,
  contract_expiry_date, dev_toolbar_hidden, currency, payment_type,
  avatar_position, avatar_scale, created_at, updated_at
) on hub_users to authenticated;
