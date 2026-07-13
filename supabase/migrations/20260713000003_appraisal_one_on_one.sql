-- Add a 1-on-1 discussion date to appraisals, set by the rater before sending
-- to the employee. Fretz wants to talk through the review with the employee
-- on this date, so an email goes to both of them the moment the employee
-- acknowledges (reads it and submits their comments).
alter table hub_appraisals
  add column if not exists one_on_one_at timestamptz;

-- Fires the review-summary email server-side (via pg_net, same reliable
-- pattern as the existing cron jobs) the moment an employee acknowledges —
-- not from the client, which would depend on their browser tab staying open
-- long enough for the request to complete.
create or replace function acknowledge_appraisal(p_id uuid, p_comments text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_name text;
begin
  update hub_appraisals
  set employee_comments = nullif(trim(coalesce(p_comments, '')), ''),
      employee_acknowledged_at = now(),
      status = 'awaiting_hr',
      updated_at = now()
  where id = p_id
    and employee_id = auth.uid()
    and status = 'awaiting_employee';

  if not found then
    raise exception 'Appraisal not found or not awaiting your acknowledgment';
  end if;

  select full_name into v_employee_name from hub_users where id = auth.uid();

  insert into hub_notifications (user_id, type, title, body, link, read)
  select u.id, 'appraisal',
         'Appraisal acknowledged',
         coalesce(v_employee_name, 'An employee') || ' acknowledged their performance appraisal — ready for HR review.',
         '/hub/admin/performance', false
  from hub_users u
  where u.role in ('admin', 'owner', 'hr') and u.status = 'active';

  perform net.http_post(
    url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/send-appraisal-review-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'
    ),
    body := jsonb_build_object('appraisal_id', p_id)
  );
end $$;

grant execute on function acknowledge_appraisal(uuid, text) to authenticated;
