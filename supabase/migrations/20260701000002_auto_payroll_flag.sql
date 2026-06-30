-- Add explicit auto_payroll flag to hub_users.
-- Replaces the implicit role-based logic (all admin/hr = auto-include).
-- Existing admin/hr users are backfilled to true so nothing breaks.
alter table hub_users add column if not exists auto_payroll boolean not null default false;

update hub_users
set auto_payroll = true
where role in ('admin', 'hr')
  and (full_name not ilike '%testing%');
