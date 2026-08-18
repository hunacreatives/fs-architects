-- ── Task time estimate ───────────────────────────────────────────────────────
-- Adds the "Time Est." column Fretz asked for on the Tasks board. Stored as
-- hours (numeric so half-hours like 2.5 work); null means "not estimated" and
-- renders as an empty cell rather than 0.

alter table hub_project_tasks
  add column if not exists time_est numeric(6,2);

comment on column hub_project_tasks.time_est is
  'Estimated effort in hours. Null = not estimated. Summed per group on the Tasks board.';
