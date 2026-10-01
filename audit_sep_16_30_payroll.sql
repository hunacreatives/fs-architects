-- ============================================================
-- READ-ONLY AUDIT — Sep 16–30, 2026 payroll ("base pay disappeared
-- on Oct 1").
--
-- Symptom: once the date passed Sep 30 the payroll page restored
-- every hub_payouts row as an "edit". Rows created only to hold a
-- reimbursement carry base_pay 0 / approved_hours 0, so the card
-- showed OT + adjustments only (Prince: ₱1,144.03 instead of
-- ₱4,006.01). Approving in that state writes the wrong final_payout.
--
-- Safe to run: SELECTs only, no writes.
-- ============================================================

-- Every payout row for the period, with what was logged.
-- Look for: base_pay = 0 with logged hours, manual_override = true on
-- rows nobody hand-edited, and any status past 'pending' (already
-- approved/paid with a possibly-wrong final_payout).
with logged as (
  select d.user_id,
         count(*) filter (where extract(dow from d.date) between 1 and 5) as weekdays_logged,
         round(sum(d.hours_capped) filter (where extract(dow from d.date) between 1 and 5)::numeric, 2) as capped_hours,
         sum(d.overtime_hours) as ot_hours
  from hub_daily_hours d
  where d.date between '2026-09-16' and '2026-09-30'
  group by d.user_id
)
select u.full_name,
       u.payment_type,
       p.status,
       p.manual_override,
       p.base_pay,
       p.overtime_pay,
       (select coalesce(sum((a->>'amount')::numeric), 0)
          from jsonb_array_elements(coalesce(p.adjustments, '[]'::jsonb)) a) as adjustments_total,
       p.final_payout,
       p.approved_hours,
       p.approved_days,
       l.weekdays_logged,
       l.capped_hours,
       l.ot_hours,
       p.payment_date,
       p.created_at,
       p.approved_at
from hub_payouts p
join hub_users u on u.id = p.contractor_id
left join logged l on l.user_id = p.contractor_id
where p.cutoff_start = '2026-09-16'
order by u.full_name;


-- Batch state for the period (is it still open?).
select id, status, total_amount, contractor_count, created_at, approved_at, closed_at
from hub_payroll_batches
where period_start = '2026-09-16'
order by created_at desc;
