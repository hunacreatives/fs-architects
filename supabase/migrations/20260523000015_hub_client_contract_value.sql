alter table hub_clients
  add column if not exists contract_value numeric(10,2);
