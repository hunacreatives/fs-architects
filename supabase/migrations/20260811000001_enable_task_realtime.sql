-- Powers the To-Do list's live-update subscription (no more manual refresh
-- needed to see a newly-assigned or newly-completed task). RLS already lets
-- any authenticated user read all tasks ("Auth users read tasks" policy),
-- so this just turns on the change-stream itself.
alter publication supabase_realtime add table hub_project_tasks;
