-- ============================================================
-- READ-ONLY AUDIT — Aug 1–15, 2026 "approved before the last
-- workday synced" shortfall (the Chico case).
--
-- Symptom: payroll was approved before a day's Slack punches had
-- landed, so approved_days snapshotted lower than the days the
-- employee actually worked. Fixed-rate employees lose
-- (1 / scheduled days) of the period per missing day.
--
-- Safe to run: SELECTs only, no writes.
-- ============================================================

-- Actual days logged vs the days payroll snapshotted, per employee.
-- Any row where actual_days > approved_days was underpaid.
with logged as (
  select d.user_id,
         count(*) filter (
           where extract(dow from d.date) between 1 and 5
         ) as actual_days,
         sum(d.hours_capped) as actual_capped_hours
  from hub_daily_hours d
  where d.date between '2026-08-01' and '2026-08-15'
  group by d.user_id
)
select u.full_name,
       u.payment_type,
       l.actual_days,
       p.approved_days,
       l.actual_days - coalesce(p.approved_days, 0) as days_missing,
       l.actual_capped_hours,
       p.approved_hours,
       p.base_pay,
       p.final_payout,
       -- What one missing day is worth for a fixed-rate employee:
       -- base_pay is (monthly/2) * approved_days / scheduled_days, so a day
       -- is base_pay / approved_days.
       case
         when u.payment_type in ('fixed','fixed_flexible')
              and coalesce(p.approved_days, 0) > 0
         then round(
                (p.base_pay / p.approved_days)
                * (l.actual_days - coalesce(p.approved_days, 0)),
              2)
       end as est_shortfall_php
from logged l
join hub_users u  on u.id = l.user_id
left join hub_payouts p
       on p.contractor_id = l.user_id
      and p.cutoff_start = '2026-08-01'
order by days_missing desc nulls last, u.full_name;


-- Cross-check: which employees are missing a row on each workday of the
-- period. Aug 7 showed only 2 rows in the earlier diagnostic, so this
-- confirms whether that was a genuine no-show day or an unsynced day.
select d.date,
       count(*) as employees_logged,
       string_agg(u.full_name, ', ' order by u.full_name) as logged_names
from hub_daily_hours d
join hub_users u on u.id = d.user_id
where d.date between '2026-08-01' and '2026-08-15'
  and extract(dow from d.date) between 1 and 5
group by d.date
order by d.date;
