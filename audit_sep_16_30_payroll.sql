-- ============================================================
-- READ-ONLY AUDIT — Sep 16–30, 2026 payroll.
--
-- One row per employee: their rates (profile + rate history in
-- effect), what attendance logged, every OT request in the period
-- (any status), and the payout row. Used to check the payroll page
-- figures line by line before Approve.
--
-- Safe to run: a single SELECT, no writes.
-- ============================================================

with emp as (
  select id, full_name, role, payment_type, monthly_rate, hourly_rate
  from hub_users
  where status = 'active'
    and role in ('contractor', 'admin', 'hr')
    and coalesce(is_developer, false) = false
),
rate_in_effect as (
  select distinct on (contractor_id)
         contractor_id, effective_date, payment_type, monthly_rate, hourly_rate
  from hub_rate_history
  where effective_date <= '2026-09-30'
  order by contractor_id, effective_date desc
),
hours as (
  select user_id,
         count(*) filter (where extract(dow from date) between 1 and 5 and hours_capped > 0) as days_logged,
         round(sum(hours_capped) filter (where extract(dow from date) between 1 and 5)::numeric, 2) as capped_hours,
         round(sum(hours_raw)::numeric, 2) as raw_hours,
         sum(overtime_hours) as ot_hours_credited,
         jsonb_object_agg(date, jsonb_build_object('raw', round(hours_raw::numeric, 2), 'ot', overtime_hours))
           filter (where coalesce(overtime_hours, 0) > 0) as ot_days_credited
  from hub_daily_hours
  where date between '2026-09-16' and '2026-09-30'
  group by user_id
),
ot_requests as (
  select contractor_id,
         sum(hours) filter (where status = 'approved') as ot_approved,
         sum(hours) filter (where status = 'pending')  as ot_pending,
         sum(hours) filter (where status = 'rejected') as ot_rejected,
         jsonb_agg(jsonb_build_object('date', date, 'hours', hours, 'status', status, 'rest_day', is_rest_day)
                   order by date) as ot_request_list
  from hub_overtime_requests
  where date between '2026-09-16' and '2026-09-30'
  group by contractor_id
)
select e.full_name,
       e.payment_type,
       e.monthly_rate          as profile_monthly,
       e.hourly_rate           as profile_hourly,
       r.effective_date        as rate_effective,
       r.monthly_rate          as history_monthly,
       r.hourly_rate           as history_hourly,
       h.days_logged,
       h.capped_hours,
       h.raw_hours,
       h.ot_hours_credited,
       o.ot_approved,
       o.ot_pending,
       o.ot_rejected,
       h.ot_days_credited,
       o.ot_request_list,
       p.status                as payout_status,
       p.manual_override,
       p.base_pay,
       p.overtime_pay,
       p.final_payout,
       p.adjustments
from emp e
left join rate_in_effect r on r.contractor_id = e.id
left join hours h          on h.user_id = e.id
left join ot_requests o    on o.contractor_id = e.id
left join hub_payouts p    on p.contractor_id = e.id and p.cutoff_start = '2026-09-16'
order by e.full_name;
