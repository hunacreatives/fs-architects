alter table hub_daily_hours
  add column if not exists is_manual boolean default false,
  add column if not exists override_reason text;
