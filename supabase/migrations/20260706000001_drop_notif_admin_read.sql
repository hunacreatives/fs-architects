-- ── Remove cross-account notification read access ──────────────────────────
-- hub_notif_admin_read (20260630000003) let any admin/owner/hr user read every
-- other admin/owner/hr user's rows in hub_notifications, since Postgres OR's
-- permissive SELECT policies together with hub_notif_own. That meant one
-- admin's notification bell / Audit Log archive showed every admin's
-- notifications, not just their own. The Audit Log "Notifications" tab is now
-- scoped client-side to auth.uid() only, so this broader policy is no longer
-- needed and is dropped to keep notifications private per account at the DB
-- layer too.
drop policy if exists "hub_notif_admin_read" on hub_notifications;
