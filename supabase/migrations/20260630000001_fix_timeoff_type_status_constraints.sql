-- ── Fix hub_time_off type/status constraints ────────────────────────────────
-- The employee request form offers more leave types (birthday, SIL, maternity,
-- paternity, solo-parent, women-special, VAWC) and the admin flow uses extra
-- statuses (forwarded, rejected) than the original CHECK constraints allowed.
-- Any value outside the old list was rejected by Postgres — and because the
-- insert error was swallowed client-side, the request silently failed while the
-- HR notification email still went out (e.g. an "unpaid" request that never
-- appeared in the hub). Rebuild both constraints to match what the app uses.

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
