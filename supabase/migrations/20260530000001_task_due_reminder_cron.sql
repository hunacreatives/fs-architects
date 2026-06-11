-- Fire task due reminder daily at 9:00 AM PHT (01:00 UTC)
-- Function queries tasks due today or tomorrow and notifies assignees
select cron.schedule(
  'task-due-reminder',
  '0 1 * * *',
  $$
  select net.http_post(
    url := 'https://aaqpwobmfofztcbbsonw.supabase.co/functions/v1/notify-task-due-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhcXB3b2JtZm9menRjYmJzb253Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDA1NTcsImV4cCI6MjA5NDc3NjU1N30.t7vFL_lHKX-WmXBPtrgsDMwztH5nfC_-0-fVQjEQ9bo'
    ),
    body := '{}'::jsonb
  );
  $$
);
