-- Fix scheduled Slack/notification cron jobs that were copied from Huna and
-- still pointed at Huna's project (aaqpwobmfofztcbbsonw) with Huna's anon key.
-- Re-point them at FS Architects' project (yerjcnxyjlmtimvuufch). Idempotent:
-- safely unschedules any existing job by name, then (re)schedules with FS's URL.
-- Also enables the birthday greeting, which had been left commented out.

do $$
declare
  job text;
begin
  foreach job in array array[
    'slack-payroll-reminder',
    'remind-attendance',
    'task-due-reminder',
    'slack-anniversary',
    'slack-birthday'
  ]
  loop
    begin
      perform cron.unschedule(job);
    exception when others then
      null; -- job didn't exist yet; ignore
    end;
  end loop;
end $$;

-- Payroll cutoff reminder — daily 9:00 AM PHT (01:00 UTC)
select cron.schedule('slack-payroll-reminder', '0 1 * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/slack-payroll-reminder',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := '{}'::jsonb
  );
$$);

-- Attendance reminders — every 15 minutes
select cron.schedule('remind-attendance', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/remind-attendance',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := '{}'::jsonb
  );
$$);

-- Task due reminders — daily 9:00 AM PHT (01:00 UTC)
select cron.schedule('task-due-reminder', '0 1 * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/notify-task-due-reminder',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := '{}'::jsonb
  );
$$);

-- Work anniversary greeting — daily 8:00 AM PHT (00:00 UTC)
select cron.schedule('slack-anniversary', '0 0 * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/slack-anniversary',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := '{}'::jsonb
  );
$$);

-- Birthday greeting — daily 9:00 AM PHT (01:00 UTC). Was previously disabled.
select cron.schedule('slack-birthday', '0 1 * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/slack-birthday',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := '{}'::jsonb
  );
$$);
