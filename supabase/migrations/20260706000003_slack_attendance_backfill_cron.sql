-- ── Auto-finalize overnight Slack attendance ───────────────────────────────
-- slack-attendance has no schedule: it only runs when someone opens a hub page.
-- Its live mode also only looks back 18h and can only record an "off" when the
-- matching "on" is inside the same window. So an overnight logout (e.g. on at
-- 9 AM, off at 3 AM = an 18h shift) is never captured: nobody has the hub open
-- at 3 AM, and by morning the 9 AM "on" has aged out of every live sync's
-- window — the dangling "off" is discarded and the day never closes. Admins had
-- to press "Sync Slack" (backfill mode, midnight→+36h window) manually.
--
-- Schedule that same backfill for YESTERDAY every day at noon PH (04:00 UTC).
-- The 36h window (yesterday 00:00 → today noon) is guaranteed to contain both
-- punches of any overnight shift, so the day is finalized without manual syncs.
do $$
declare
  job text;
begin
  foreach job in array array['slack-attendance-backfill', 'slack-attendance-live']
  loop
    begin
      perform cron.unschedule(job);
    exception when others then
      null; -- job didn't exist yet; ignore
    end;
  end loop;
end $$;

select cron.schedule('slack-attendance-backfill', '0 4 * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/slack-attendance',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := jsonb_build_object('date', to_char((now() at time zone 'Asia/Manila')::date - 1, 'YYYY-MM-DD'))
  );
$$);

-- Live sync every 30 minutes — keeps attendance/daily-hours fresh overnight and
-- on days nobody opens the hub (page loads were previously the only trigger).
-- Uses the normal 18h live window; the daily backfill above is what guarantees
-- overnight shifts get finalized.
select cron.schedule('slack-attendance-live', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/slack-attendance',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := '{}'::jsonb
  );
$$);
