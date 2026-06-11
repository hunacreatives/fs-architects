alter table hub_users
  add column if not exists contract_expiry_date date;
