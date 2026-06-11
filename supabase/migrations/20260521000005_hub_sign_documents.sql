create table if not exists public.hub_sign_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_url text not null,
  file_name text not null,
  uploaded_by uuid references public.hub_users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.hub_sign_assignments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.hub_sign_documents(id) on delete cascade,
  contractor_id uuid not null references public.hub_users(id) on delete cascade,
  status text not null default 'pending', -- pending, signed
  signed_at timestamptz,
  signed_name text,
  created_at timestamptz default now(),
  unique(document_id, contractor_id)
);

alter table public.hub_sign_documents enable row level security;
alter table public.hub_sign_assignments enable row level security;

-- Admins/owners can do everything
create policy "Admins manage sign documents"
  on public.hub_sign_documents for all
  using (exists (
    select 1 from public.hub_users where id = auth.uid() and role in ('admin', 'owner')
  ));

-- Contractors can view documents assigned to them
create policy "Contractors view assigned documents"
  on public.hub_sign_documents for select
  using (exists (
    select 1 from public.hub_sign_assignments
    where document_id = hub_sign_documents.id and contractor_id = auth.uid()
  ));

-- Admins manage all assignments
create policy "Admins manage sign assignments"
  on public.hub_sign_assignments for all
  using (exists (
    select 1 from public.hub_users where id = auth.uid() and role in ('admin', 'owner')
  ));

-- Contractors view and update own assignments
create policy "Contractors view own assignments"
  on public.hub_sign_assignments for select
  using (contractor_id = auth.uid());

create policy "Contractors sign own assignments"
  on public.hub_sign_assignments for update
  using (contractor_id = auth.uid())
  with check (contractor_id = auth.uid());
