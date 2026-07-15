-- The 20260528000004 migration that schedules check-contract-expiry was never
-- applied to the FS Architects project — cron.job had no such row as of
-- 2026-07-15, so contract-expiry alerts have never fired. Schedule it with a
-- hardcoded URL/key (same approach as 20260713000001) instead of vault
-- lookups. Idempotent: unschedules by name first if present.

do $$
begin
  perform cron.unschedule('check-contract-expiry');
exception when others then
  null; -- job didn't exist yet; ignore
end $$;

-- Contract expiry check — every day at 8 AM PHT (UTC 00:00)
select cron.schedule('check-contract-expiry', '0 0 * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/check-contract-expiry',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := '{}'::jsonb
  );
$$);
