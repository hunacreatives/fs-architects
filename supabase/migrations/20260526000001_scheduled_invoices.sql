create table if not exists hub_scheduled_invoices (
  id serial primary key,
  project_id bigint references hub_projects(id) on delete set null,
  invoice_number text not null,
  to_email text not null,
  cc_email text,
  subject text,
  client_name text not null,
  project_name text not null,
  service text,
  contract_price numeric(12,2),
  start_date date,
  due_date date,
  payments jsonb,
  show_payments boolean default true,
  line_items jsonb,
  notes text,
  bill_to_name text,
  bill_to_address text,
  reference text,
  payment_terms text,
  message text,
  scheduled_for timestamptz not null,
  status text not null default 'pending', -- pending, sent, cancelled, failed
  sent_at timestamptz,
  cancelled_at timestamptz,
  last_error text,
  created_at timestamptz default now()
);

alter table hub_scheduled_invoices enable row level security;

create policy "admins manage scheduled invoices" on hub_scheduled_invoices
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')));
