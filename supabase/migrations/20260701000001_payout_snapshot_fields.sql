-- ── Payroll archive snapshot fields ──────────────────────────────────────────
-- Save approved_days and overtime_hours on hub_payouts at payment time so
-- closed-period archives show accurate hours, days, and OT without needing
-- to recompute from hub_daily_hours (which may not match what was approved).
alter table hub_payouts add column if not exists approved_days   integer;
alter table hub_payouts add column if not exists overtime_hours  numeric(8,2);
alter table hub_payouts add column if not exists prorated_note   text;
