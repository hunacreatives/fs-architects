alter table hub_project_contractors
  add column if not exists payout_type text not null default 'percentage' check (payout_type in ('percentage', 'fixed')),
  add column if not exists fixed_amount numeric(10,2);
