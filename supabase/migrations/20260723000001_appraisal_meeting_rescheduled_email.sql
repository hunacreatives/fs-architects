-- Distinguish "first time scheduled" from "rescheduled" in the 1-on-1 email.
-- Previously every one_on_one_at change (including a correction to a typo'd
-- time) sent an identical "Scheduled" email with no indication anything had
-- changed, which read like the meeting was being booked fresh each time.
-- Now the trigger passes along whether a time was already set, plus what it
-- was, so the edge function can say "Rescheduled" and show the old time.

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
      body := jsonb_build_object(
        'appraisal_id', new.id,
        'is_reschedule', tg_op = 'UPDATE' and old.one_on_one_at is not null,
        'previous_one_on_one_at', case when tg_op = 'UPDATE' then old.one_on_one_at else null end
      )
    );
  end if;
  return new;
end;
$$;
