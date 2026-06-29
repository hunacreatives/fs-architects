-- ── Fix hub_time_off schema drift ────────────────────────────────────────────
-- The employee request form and admin flow were updated to use half-day leave
-- (half_day, half_day_period) and a "forwarded to owner" admin step
-- (forwarded_to_owner), but the matching columns were never added to the table
-- — and the type/status CHECK constraints were never widened either. Every
-- insert/update referencing these missing columns or disallowed values was
-- rejected by Postgres. Because the resulting error was swallowed client-side,
-- the UI showed "success" and fired the HR notification email anyway, while no
-- row was ever saved (e.g. Elijah Servacio's unpaid leave request, 2026-07-02
-- to 2026-07-30 — confirmed missing from the table despite the email going out).

alter table hub_time_off add column if not exists half_day boolean not null default false;
alter table hub_time_off add column if not exists half_day_period text
  check (half_day_period in ('morning', 'afternoon'));
alter table hub_time_off add column if not exists forwarded_to_owner boolean not null default false;

alter table hub_time_off drop constraint if exists hub_time_off_type_check;
alter table hub_time_off add constraint hub_time_off_type_check
  check (type in (
    'pto','vacation','sick','birthday','sil','emergency',
    'maternity','paternity','solo_parent','women_special','vawc',
    'unpaid','other'
  ));

alter table hub_time_off drop constraint if exists hub_time_off_status_check;
alter table hub_time_off add constraint hub_time_off_status_check
  check (status in ('pending','forwarded','approved','rejected','denied'));
