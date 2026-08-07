-- Phase 7 of team-based project monitoring: sync every completed task into
-- the assignee's own live Google Sheet. Fires server-side (same reliable
-- pg_net pattern as every other automated email/log this session) the
-- instant a task's status flips to 'done' — not from the client, which
-- would depend on the browser tab staying open long enough.

create or replace function notify_task_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and (old.status is distinct from new.status) then
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

drop trigger if exists hub_project_tasks_notify_completed on hub_project_tasks;
create trigger hub_project_tasks_notify_completed
  after update on hub_project_tasks
  for each row execute function notify_task_completed();
