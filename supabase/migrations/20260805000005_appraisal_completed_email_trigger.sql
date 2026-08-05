-- Email the employee (and the owner, for the record) the moment an
-- appraisal's status flips to 'completed' — i.e. the instant HR signs off.
-- Same reliable DB-trigger pattern as the other appraisal emails (sent,
-- meeting scheduled, acknowledged) so it fires server-side regardless of
-- whether HR's browser tab stays open.

create or replace function notify_appraisal_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform net.http_post(
      url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/send-appraisal-completed-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'
      ),
      body := jsonb_build_object('appraisal_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists hub_appraisals_notify_completed on hub_appraisals;
create trigger hub_appraisals_notify_completed
  after insert or update on hub_appraisals
  for each row execute function notify_appraisal_completed();
