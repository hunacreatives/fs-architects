-- C-03: hub_doc_requests was created by hand in the dashboard and has no
-- CREATE TABLE migration, so its schema/RLS are invisible to version control and
-- missing from any fresh environment. This backfills the canonical definition.
-- It is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), so it is a safe no-op
-- against the existing production table while making clean environments work.

create table if not exists public.hub_doc_requests (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references hub_users(id) on delete cascade,
  doc_type text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'in_review', 'ready', 'rejected', 'completed')),
  admin_notes text,
  file_name text,
  file_url text,
  pickup_notified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Match the column adds that were applied out-of-band, in case the live table
-- predates some of them.
alter table public.hub_doc_requests
  add column if not exists admin_notes text,
  add column if not exists file_name text,
  add column if not exists file_url text,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists pickup_notified_at timestamptz;

create index if not exists idx_hub_doc_requests_contractor on public.hub_doc_requests (contractor_id);

alter table public.hub_doc_requests enable row level security;

drop policy if exists "Contractors view own doc requests" on public.hub_doc_requests;
create policy "Contractors view own doc requests"
  on public.hub_doc_requests for select to authenticated
  using (
    contractor_id = auth.uid()
    or exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr'))
  );

drop policy if exists "Contractors create own doc requests" on public.hub_doc_requests;
create policy "Contractors create own doc requests"
  on public.hub_doc_requests for insert to authenticated
  with check (contractor_id = auth.uid());

drop policy if exists "Admins manage doc requests" on public.hub_doc_requests;
create policy "Admins manage doc requests"
  on public.hub_doc_requests for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')));
