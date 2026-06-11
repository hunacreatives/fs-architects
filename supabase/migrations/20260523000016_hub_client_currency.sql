alter table hub_clients
  add column if not exists contract_currency text not null default 'PHP' check (contract_currency in ('PHP', 'USD'));
