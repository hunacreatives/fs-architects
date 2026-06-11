alter table hub_users
  drop constraint if exists hub_users_payment_type_check;

alter table hub_users
  add constraint hub_users_payment_type_check
  check (payment_type in ('hourly', 'fixed', 'fixed_flexible', 'project_based'));
