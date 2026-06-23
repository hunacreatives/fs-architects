-- Fire payroll cutoff reminder daily at 9:00 AM PHT (01:00 UTC)
-- Function checks internally if today is actually a cutoff day
select cron.schedule(
  'slack-payroll-reminder',
  '0 1 * * *',
  $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/slack-payroll-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'
    ),
    body := '{}'::jsonb
  );
  $$
);
