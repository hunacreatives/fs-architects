-- ── hub_time_off.hr_notes ─────────────────────────────────────────────────────
-- The admin review flow writes hr_notes when forwarding to the owner and when the
-- owner approves/rejects, but the column was never added to the table. Those
-- updates were silently failing (PGRST204 "column not found"), so forwarding and
-- approval/rejection didn't actually persist. Add the column to match the code.

alter table hub_time_off add column if not exists hr_notes text;
