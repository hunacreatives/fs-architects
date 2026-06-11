create table if not exists public.hub_overtime_requests (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references public.hub_users(id) on delete cascade,
  date date not null,
  hours numeric(5,2) not null,
  reason text,
  status text not null default 'pending', -- pending, approved, rejected
  reviewed_by uuid references public.hub_users(id),
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.hub_overtime_requests enable row level security;

create policy "Contractors can view own ot requests"
  on public.hub_overtime_requests for select
  using (contractor_id = auth.uid());

create policy "Contractors can insert own ot requests"
  on public.hub_overtime_requests for insert
  with check (contractor_id = auth.uid());

create policy "Admins can manage all ot requests"
  on public.hub_overtime_requests for all
  using (exists (
    select 1 from public.hub_users where id = auth.uid() and role in ('admin', 'owner')
  ));
