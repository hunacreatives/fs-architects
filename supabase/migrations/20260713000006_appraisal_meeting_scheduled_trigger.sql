-- Notify the employee the moment a 1-on-1 discussion date is set or changed
-- on their appraisal — even while it's still a draft. This is deliberately
-- separate from the "appraisal sent" notification: it only announces the
-- meeting, never the appraisal's ratings/comments/scores, since Fretz hasn't
-- confirmed the discussion happened yet at this point.

create or replace function notify_appraisal_meeting_scheduled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.one_on_one_at is not null
     and (tg_op = 'INSERT' or old.one_on_one_at is distinct from new.one_on_one_at) then
    perform net.http_post(
      url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/send-appraisal-meeting-scheduled-email',
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

drop trigger if exists hub_appraisals_notify_meeting_scheduled on hub_appraisals;
create trigger hub_appraisals_notify_meeting_scheduled
  after insert or update on hub_appraisals
  for each row execute function notify_appraisal_meeting_scheduled();
