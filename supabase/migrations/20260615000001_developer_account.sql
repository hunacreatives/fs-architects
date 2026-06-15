-- Ensure is_developer column exists with a safe default
alter table public.hub_users
  add column if not exists is_developer boolean not null default false;

-- Mark the developer account as invisible
update public.hub_users
  set is_developer = true
  where lower(email) = 'francis@blue-collarnutrition.com'
     or lower(full_name) = 'francis fiel roble';
