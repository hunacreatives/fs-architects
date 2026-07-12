-- Fix the two remaining cron jobs that still read vault secrets named
-- 'SUPABASE_URL' / 'SUPABASE_SERVICE_ROLE_KEY' (uppercase), which were never
-- created in the FS Architects project's vault. Their net.http_post url
-- evaluated to NULL, so the jobs failed silently every minute — this is why
-- scheduled announcements (e.g. the Jul 7 Timekeeping Advisory) never
-- published or posted to Slack. The 20260624000003 fix migrated the other
-- Huna-copied jobs to hardcoded FS URLs but missed these two.
-- Idempotent: unschedules by name if present, then (re)schedules.

do $$
declare
  job text;
begin
  foreach job in array array[
    'publish-scheduled-announcements',
    'process-scheduled-invoices'
  ]
  loop
    begin
      perform cron.unschedule(job);
    exception when others then
      null; -- job didn't exist yet; ignore
    end;
  end loop;
end $$;

-- Publish due scheduled announcements (flips published, notifies, posts to Slack) — every minute
select cron.schedule('publish-scheduled-announcements', '* * * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/publish-scheduled-announcements',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := '{}'::jsonb
  );
$$);

-- Process due scheduled invoices — every minute
select cron.schedule('process-scheduled-invoices', '* * * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/process-scheduled-invoices',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := '{}'::jsonb
  );
$$);
