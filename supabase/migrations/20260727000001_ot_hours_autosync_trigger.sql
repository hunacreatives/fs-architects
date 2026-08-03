-- Fix: hub_daily_hours.overtime_hours (what payroll actually reads) can drift
-- from hub_overtime_requests (the source of truth for approved OT) whenever
-- the app-level sync step is skipped or fails silently — e.g. an approval's
-- follow-up write errors out, or a later manual attendance edit touches the
-- same row. This trigger makes the DB itself keep the two in sync any time
-- hub_overtime_requests changes, so payroll can never show stale OT hours
-- regardless of which UI path touched the data.

create or replace function public.sync_hub_daily_hours_overtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_contractor uuid;
  target_date date;
  total_approved numeric;
begin
  target_contractor := coalesce(new.contractor_id, old.contractor_id);
  target_date := coalesce(new.date, old.date);

  select coalesce(sum(hours), 0) into total_approved
  from public.hub_overtime_requests
  where contractor_id = target_contractor
    and date = target_date
    and status = 'approved';

  insert into public.hub_daily_hours (user_id, date, overtime_hours, updated_at)
  values (target_contractor, target_date, total_approved, now())
  on conflict (user_id, date)
  do update set overtime_hours = excluded.overtime_hours, updated_at = now();

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_hub_daily_hours_overtime on public.hub_overtime_requests;

create trigger trg_sync_hub_daily_hours_overtime
after insert or update or delete on public.hub_overtime_requests
for each row
execute function public.sync_hub_daily_hours_overtime();

-- One-time backfill: correct any dates that are already out of sync today.
update public.hub_daily_hours dh
set overtime_hours = totals.total_approved, updated_at = now()
from (
  select contractor_id, date, coalesce(sum(hours), 0) as total_approved
  from public.hub_overtime_requests
  where status = 'approved'
  group by contractor_id, date
) totals
where dh.user_id = totals.contractor_id
  and dh.date = totals.date
  and dh.overtime_hours is distinct from totals.total_approved;
