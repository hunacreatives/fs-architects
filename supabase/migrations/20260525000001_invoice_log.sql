create table if not exists hub_invoice_log (
  id serial primary key,
  invoice_number text not null,
  project_id bigint references hub_projects(id) on delete set null,
  client_name text not null,
  project_name text not null,
  sent_to text not null,
  sent_cc text,
  subject text,
  contract_price numeric(12,2),
  total_paid numeric(12,2),
  balance numeric(12,2),
  line_items jsonb,
  show_payments boolean default true,
  sent_at timestamptz default now()
);

create table if not exists hub_payment_receipt_log (
  id serial primary key,
  project_id bigint references hub_projects(id) on delete set null,
  client_name text not null,
  project_name text not null,
  payment_amount numeric(12,2) not null,
  paid_at date,
  sent_to text not null,
  total_paid numeric(12,2),
  balance numeric(12,2),
  receipt_url text,
  sent_at timestamptz default now()
);

alter table hub_invoice_log enable row level security;
alter table hub_payment_receipt_log enable row level security;

create policy "admins manage invoice log" on hub_invoice_log
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')));

create policy "admins manage receipt log" on hub_payment_receipt_log
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')));
