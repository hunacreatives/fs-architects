-- Fix missing SELECT policy on hub_payouts
-- Without this, admins can't see submitted payouts and contractors can't read back their own

-- Contractors can read their own payouts
create policy "Contractors can view own payouts"
  on hub_payouts for select to authenticated
  using (contractor_id = auth.uid());

-- Admins and owners can read all payouts
create policy "Admins can view all payouts"
  on hub_payouts for select to authenticated
  using (
    exists (
      select 1 from hub_users
      where id = auth.uid() and role in ('admin', 'owner')
    )
  );

-- Admins and owners can update any payout (approve, mark paid, cancel, etc.)
create policy "Admins can update all payouts"
  on hub_payouts for update to authenticated
  using (
    exists (
      select 1 from hub_users
      where id = auth.uid() and role in ('admin', 'owner')
    )
  );

-- Admins and owners can insert payouts (bulk approve, manual entry)
create policy "Admins can insert payouts"
  on hub_payouts for insert to authenticated
  with check (
    exists (
      select 1 from hub_users
      where id = auth.uid() and role in ('admin', 'owner')
    )
  );

-- Admins and owners can delete payouts (cancel)
create policy "Admins can delete payouts"
  on hub_payouts for delete to authenticated
  using (
    exists (
      select 1 from hub_users
      where id = auth.uid() and role in ('admin', 'owner')
    )
  );
