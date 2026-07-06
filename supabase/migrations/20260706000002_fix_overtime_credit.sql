-- ── Fix approved overtime never reaching payroll / payslips ────────────────
-- Approving an OT request (admin Overtime page) upserts the approved hours into
-- hub_daily_hours.overtime_hours — the column payroll and the employee payouts
-- page actually read. hub_daily_hours was created outside migrations and its
-- RLS has no staff write policy, so that client-side upsert fails silently:
-- requests show "Approved" but the hours are never credited anywhere.

-- 1. Let admin/owner/hr write hub_daily_hours from the client (attendance edge
--    functions use the service role and bypass RLS, so they're unaffected).
drop policy if exists "hub_daily_hours_staff_write" on public.hub_daily_hours;
create policy "hub_daily_hours_staff_write"
  on public.hub_daily_hours for all to authenticated
  using (exists (
    select 1 from public.hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')
  ))
  with check (exists (
    select 1 from public.hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')
  ));

-- 2. Backfill: re-credit every approved OT request whose hours never landed in
--    hub_daily_hours (same aggregate the approve flow computes).
insert into public.hub_daily_hours (user_id, date, overtime_hours, updated_at)
select r.contractor_id, r.date, sum(r.hours), now()
from public.hub_overtime_requests r
where r.status = 'approved' and r.contractor_id is not null
group by r.contractor_id, r.date
on conflict (user_id, date)
do update set overtime_hours = excluded.overtime_hours, updated_at = now();
