-- Fix contractor UPDATE policy — old one only allowed updating when status='pending',
-- which blocked submission when a seed row existed with status='paid'.
-- Contractors should be able to submit/update their own unlocked rows.
drop policy if exists "Contractors can update own pending payout" on hub_payouts;

create policy "Contractors can update own payout"
  on hub_payouts for update to authenticated
  using (contractor_id = auth.uid() and coalesce(locked, false) = false)
  with check (contractor_id = auth.uid());

-- Delete incorrectly seeded 'paid' row for the current open period
-- so Angela (and any contractor) can submit fresh for May 16-29
delete from hub_payouts
where cutoff_start = '2026-05-16'
  and status = 'paid'
  and locked = true
  and contractor_id in (
    select id from hub_users where full_name ilike '%angela%'
  );
