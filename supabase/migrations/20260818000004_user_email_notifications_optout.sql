-- ── Per-user email notification opt-out ──────────────────────────────────────
-- Admin/owner/hr staff are emailed for every submitted request, with the
-- recipient list derived purely from role — so there was no way to stop
-- receiving them short of changing someone's role and their access with it.
--
-- This flag only gates EMAIL. Slack DMs and push notifications still go to
-- everyone in the role, so nothing stops being actioned; it just stops
-- filling an inbox.

alter table hub_users
  add column if not exists email_notifications boolean not null default true;

comment on column hub_users.email_notifications is
  'False = do not send this user role-based notification emails (requests, time off, overtime, undertime). Slack and push are unaffected.';

-- Developer accounts hold admin/owner for access, not to action requests, and
-- are already excluded from staff lists elsewhere in the app. The notification
-- functions now exclude them too; this flags them off as well so the intent is
-- visible in the data rather than only in the edge-function code.
update hub_users
set email_notifications = false
where is_developer = true;
