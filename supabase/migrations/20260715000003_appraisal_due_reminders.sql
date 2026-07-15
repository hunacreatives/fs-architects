-- ── Quarterly appraisal reminders ────────────────────────────────────────────
-- Every employee hits a milestone every 3 months from their start_date (3rd,
-- 6th, 9th month, …). The daily check-appraisal-due function reminds admins/HR
-- 7 days before and on the day — unless an appraisal was already created for
-- that employee this quarter. This table dedupes so each reminder fires once.

create table if not exists hub_appraisal_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references hub_users(id) on delete cascade,
  milestone_date date not null,
  months int not null,
  stage text not null check (stage in ('week_before', 'day_of')),
  created_at timestamptz not null default now(),
  unique (user_id, milestone_date, stage)
);

alter table hub_appraisal_reminders enable row level security;

create policy "Admins manage appraisal reminders" on hub_appraisal_reminders
  for all to authenticated
  using (exists (select 1 from hub_users u where u.id = auth.uid() and u.role in ('owner','admin','hr')));

-- Daily at 1 AM PHT (UTC 17:00) — hardcoded URL/key, no vault dependency
-- (same approach as 20260713000001). Idempotent.
do $$
begin
  perform cron.unschedule('check-appraisal-due');
exception when others then
  null; -- job didn't exist yet; ignore
end $$;

select cron.schedule('check-appraisal-due', '0 17 * * *', $$
  select net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/check-appraisal-due',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'),
    body := '{}'::jsonb
  );
$$);
