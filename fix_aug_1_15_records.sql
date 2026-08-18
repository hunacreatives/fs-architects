-- ============================================================
-- Aug 1–15, 2026 record corrections
--
-- Context:
--  * Chico worked the holiday, so he earned 10/10 days. His stored
--    base_pay (4,272.30) was hand-typed while the Hours column was
--    blanked by the display bug, and is 9/10 of the true amount.
--    Correct base = monthly_rate / 2 = 9,494.01 / 2 = 4,747.01.
--    Record-only: the 474.71 difference was settled outside the system.
--  * Francis Yu (hr) was excluded from payroll entirely by the role
--    filter, so no payout row was ever created for him. He is
--    auto-included at a flat half-month regardless of logged hours.
--  * The batch total/count must then be rebuilt from its payout rows.
--
-- Holiday policy confirmed: unpaid unless worked. The 9-day employees
-- are correct and are deliberately NOT touched.
--
-- RUN STEP 0 FIRST and read it before running anything else.
-- ============================================================


-- ── STEP 0 — PREVIEW (read-only). Confirm before writing. ──
select u.full_name, u.role, p.status, p.payment_date,
       p.approved_hours, p.approved_days,
       p.base_pay, p.overtime_pay, p.final_payout,
       (select coalesce(sum((a->>'amount')::numeric), 0)
          from jsonb_array_elements(coalesce(p.adjustments,'[]'::jsonb)) a) as adj_total
from hub_payouts p
join hub_users u on u.id = p.contractor_id
where p.cutoff_start = '2026-08-01'
order by u.full_name;

-- Current batch header
select id, period_label, status, total_amount, contractor_count
from hub_payroll_batches
where period_start = '2026-08-01'
order by created_at desc
limit 1;


-- ── STEP 1 — Correct Chico's base pay and final payout ──
-- final_payout is recomputed from base + OT + his existing adjustments
-- (Double Pay 431.55 + SSS 950 + PAGIBIG 100 + PHIC 250 = 1,731.55),
-- so it stays consistent instead of being hardcoded.
update hub_payouts p
set base_pay       = 4747.01,
    approved_hours = 80,
    approved_days  = 10,
    final_payout   = 4747.01
                     + coalesce(p.overtime_pay, 0)
                     + (select coalesce(sum((a->>'amount')::numeric), 0)
                          from jsonb_array_elements(coalesce(p.adjustments,'[]'::jsonb)) a)
from hub_users u
where u.id = p.contractor_id
  and p.cutoff_start = '2026-08-01'
  and u.full_name ilike '%chico%';


-- ── STEP 2 — Create Francis Yu's missing payout row ──
-- Flat half-month (10,000 / 2). No hours: auto-included staff bypass
-- the accrual entirely. Attached to the existing Aug 1–15 batch.
insert into hub_payouts (
  contractor_id, cutoff_start, cutoff_end,
  base_pay, overtime_pay, final_payout,
  approved_hours, approved_days,
  status, approved_at, payment_date, paid_at,
  prorated_note, batch_id
)
select u.id, '2026-08-01', '2026-08-15',
       5000, 0, 5000,
       0, 0,
       'paid', now(), '2026-08-15', now(),
       'auto-included full cutoff',
       (select id from hub_payroll_batches
         where period_start = '2026-08-01'
         order by created_at desc limit 1)
from hub_users u
where u.full_name = 'Francis Yu'
on conflict (contractor_id, cutoff_start) do nothing;


-- ── STEP 3 — Rebuild the batch total and headcount from its rows ──
update hub_payroll_batches b
set total_amount     = s.total,
    contractor_count = s.cnt
from (
  select coalesce(sum(final_payout), 0) as total,
         count(*)                       as cnt
  from hub_payouts
  where cutoff_start = '2026-08-01'
) s
where b.period_start = '2026-08-01';


-- ── STEP 4 — VERIFY (read-only) ──
-- Expect: Chico base 4,747.01 / final 6,478.56; Francis Yu 5,000;
-- batch total = sum of the rows above, count = 10.
select u.full_name, p.status, p.approved_days,
       p.base_pay, p.final_payout
from hub_payouts p
join hub_users u on u.id = p.contractor_id
where p.cutoff_start = '2026-08-01'
order by u.full_name;

select period_label, status, total_amount, contractor_count
from hub_payroll_batches
where period_start = '2026-08-01';
