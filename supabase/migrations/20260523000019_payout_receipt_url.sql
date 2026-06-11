alter table hub_project_contractor_payouts
  add column if not exists receipt_url text;
