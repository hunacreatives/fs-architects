-- Add closed state to payroll batches
alter table hub_payroll_batches
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references hub_users(id) on delete set null;

-- Allow 'closed' as a valid status
alter table hub_payroll_batches
  drop constraint if exists hub_payroll_batches_status_check;

alter table hub_payroll_batches
  add constraint hub_payroll_batches_status_check
  check (status in ('pending_owner', 'owner_approved', 'closed'));
