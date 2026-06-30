-- ── Admin read access to staff notifications (Audit Log → Notifications) ──────
-- hub_notifications is otherwise own-row-only (hub_notif_own). HR wants a retained
-- archive of all admin/owner/HR notifications in the Audit Log, so allow admins to
-- read notifications whose recipient is an admin/owner/HR user. Contractors'
-- personal notifications stay private (only their own policy applies to them).
drop policy if exists "hub_notif_admin_read" on hub_notifications;
create policy "hub_notif_admin_read" on hub_notifications for select to authenticated
using (
  is_hub_admin()
  and exists (
    select 1 from hub_users u
    where u.id = hub_notifications.user_id and u.role in ('admin', 'owner', 'hr')
  )
);
