create table if not exists public.hub_payslip_disputes (
  id uuid primary key default gen_random_uuid(),
  payout_id bigint references public.hub_payouts(id) on delete cascade,
  contractor_id uuid references public.hub_users(id) on delete cascade,
  reason text not null,
  status text not null default 'open', -- open, resolved
  admin_notes text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

alter table public.hub_payslip_disputes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='hub_payslip_disputes' and policyname='Contractors can view own disputes') then
    execute 'create policy "Contractors can view own disputes" on public.hub_payslip_disputes for select using (contractor_id = auth.uid())';
  end if;
  if not exists (select 1 from pg_policies where tablename='hub_payslip_disputes' and policyname='Contractors can insert own disputes') then
    execute 'create policy "Contractors can insert own disputes" on public.hub_payslip_disputes for insert with check (contractor_id = auth.uid())';
  end if;
  if not exists (select 1 from pg_policies where tablename='hub_payslip_disputes' and policyname='Admins can manage all disputes') then
    execute $p$create policy "Admins can manage all disputes" on public.hub_payslip_disputes for all using (exists (select 1 from public.hub_users where id = auth.uid() and role in (''admin'', ''owner'')))$p$;
  end if;
end $$;
