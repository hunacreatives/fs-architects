-- Add annual leave allocations to hub_users
alter table hub_users
  add column if not exists annual_pto_days integer default 15,
  add column if not exists annual_sick_days integer default 10;
