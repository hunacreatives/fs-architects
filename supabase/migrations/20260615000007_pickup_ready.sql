alter table hub_sign_assignments
  add column if not exists pickup_ready boolean not null default false,
  add column if not exists pickup_notified_at timestamptz;
