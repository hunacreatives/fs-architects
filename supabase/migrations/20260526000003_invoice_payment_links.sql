create table if not exists hub_invoice_payment_links (
  id uuid primary key default gen_random_uuid(),
  token uuid unique not null default gen_random_uuid(),
  project_id bigint references hub_projects(id) on delete set null,
  invoice_number text not null,
  client_name text not null,
  project_name text not null,
  to_email text not null,
  amount_due numeric(12,2) not null,
  due_date date,
  line_items jsonb,
  payment_terms text,
  reference text,
  status text not null default 'open', -- open, submitted, closed
  submitted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists hub_payment_proof_submissions (
  id serial primary key,
  payment_link_id uuid not null references hub_invoice_payment_links(id) on delete cascade,
  project_id bigint references hub_projects(id) on delete set null,
  invoice_number text not null,
  client_name text not null,
  project_name text not null,
  payer_name text not null,
  payer_email text,
  payment_channel text not null,
  amount numeric(12,2),
  reference_number text,
  notes text,
  proof_url text,
  status text not null default 'submitted',
  submitted_at timestamptz default now()
);

alter table hub_invoice_payment_links enable row level security;
alter table hub_payment_proof_submissions enable row level security;

create policy "admins manage invoice payment links" on hub_invoice_payment_links
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')));

create policy "admins manage payment proof submissions" on hub_payment_proof_submissions
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr')));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'payment-proofs', 'payment-proofs', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where not exists (
  select 1 from storage.buckets where id = 'payment-proofs'
);
