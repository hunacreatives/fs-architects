alter table public.hub_users
  add column if not exists onboarding_completed boolean default false;

-- Existing active users are already onboarded
update public.hub_users
  set onboarding_completed = true
  where status = 'active';
