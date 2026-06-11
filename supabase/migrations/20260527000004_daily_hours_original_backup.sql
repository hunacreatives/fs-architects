alter table hub_daily_hours
  add column if not exists original_hours_raw numeric,
  add column if not exists original_hours_capped numeric;
