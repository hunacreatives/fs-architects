-- The timesheet sync trigger only fired on the status transition to
-- 'done', so a task marked done with empty hours (or any other detail
-- filled in later) never got its timesheet row updated afterward — the
-- row stayed stuck with whatever was true at the moment of completion.
-- Now it also re-fires for edits made while the task is already done, so
-- hours/title/description/UAP category/due date changes keep the sheet
-- in sync instead of requiring an undone->redone toggle to pick them up.

create or replace function notify_task_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and (
    old.status is distinct from new.status
    or old.hours_spent is distinct from new.hours_spent
    or old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.uap_category is distinct from new.uap_category
    or old.due_date is distinct from new.due_date
  ) then
    perform net.http_post(
      url := 'https://yerjcnxyjlmtimvuufch.supabase.co/functions/v1/sync-employee-timesheet',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inllcmpjbnh5amxtdGltdnV1ZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTMyMTYsImV4cCI6MjA5NTgyOTIxNn0.K_PX_n8sYpPh90g3QRzm2h98hE87ajRxG71DEMqQ6dg'
      ),
      body := jsonb_build_object('task_id', new.id)
    );
  end if;
  return new;
end;
$$;
