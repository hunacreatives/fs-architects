-- W-25: Avatar crop position/scale were hardcoded by employee name in HubAvatar,
-- so a name change silently broke the crop. Store them per-user instead. The
-- component now reads these via props and only falls back to the legacy name map.
alter table public.hub_users
  add column if not exists avatar_position text,
  add column if not exists avatar_scale numeric;
