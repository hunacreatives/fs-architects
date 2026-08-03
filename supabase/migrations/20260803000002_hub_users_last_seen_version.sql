alter table hub_users add column if not exists last_seen_app_version text;

revoke select on hub_users from authenticated;
revoke select on hub_users from anon;

grant select (
  id, full_name, email, role, avatar_url, phone, birthday, address,
  emergency_contact, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
  slack_username, slack_id, department, start_date, status, onboarding_completed,
  is_developer, shift_start, shift_end, work_days, annual_pto_days, annual_sick_days,
  contract_expiry_date, dev_toolbar_hidden, currency, payment_type,
  avatar_position, avatar_scale, created_at, updated_at, last_seen_app_version
) on hub_users to authenticated;
