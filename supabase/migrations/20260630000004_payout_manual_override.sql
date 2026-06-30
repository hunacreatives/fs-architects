-- ── Persist manual payroll-row edits ─────────────────────────────────────────
-- Editing a payroll row's hours/pay only lived in local React state and was lost
-- on reload, because the open-period payroll view always recomputes from live
-- daily hours and ignored the saved payout. This flag marks a payout whose
-- hours/base_pay were set manually by an admin, so the view restores the edit
-- (from base_pay / approved_hours) instead of recomputing over it.
alter table hub_payouts add column if not exists manual_override boolean not null default false;
