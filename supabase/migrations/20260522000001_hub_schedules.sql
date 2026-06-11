alter table public.hub_users
  add column if not exists shift_start time,
  add column if not exists shift_end time,
  add column if not exists work_days text[] default '{}';
