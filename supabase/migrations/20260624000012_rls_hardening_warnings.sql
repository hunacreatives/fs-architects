-- W-20, W-21, W-22: tighten three over-permissive RLS policies surfaced by the audit.

-- ── W-20: hub_notifications INSERT was open to any authenticated user for any
-- user_id, so anyone could spam another person's feed. Restrict to: your own
-- notifications, or admin/owner/hr (who legitimately broadcast announcements).
-- Edge functions use the service role and bypass RLS regardless.
drop policy if exists "Service role insert notifications" on hub_notifications;
create policy "Insert own or admin notifications"
  on hub_notifications for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr'))
  );

-- ── W-21: hub_rate_history SELECT exposed every contractor's full pay-rate
-- history to all employees. Scope to own rows or admin/owner/hr. (The employee
-- payouts page only ever reads the caller's own history.)
drop policy if exists "Authenticated can view rate history" on hub_rate_history;
create policy "View own or admin rate history"
  on hub_rate_history for select to authenticated
  using (
    contractor_id = auth.uid()
    or exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr'))
  );

-- ── W-22: hub_audit_log INSERT only checked that a user was logged in, so any
-- user could forge entries with any actor_id. Require actor_id to match the
-- caller. Edge-function/system logging uses the service role and bypasses RLS.
drop policy if exists "hub_audit_log_insert" on hub_audit_log;
create policy "hub_audit_log_insert" on hub_audit_log
  for insert to authenticated
  with check (actor_id = auth.uid());
