-- Rename assignee_id → assigned_to on hub_project_tasks to match app code
alter table hub_project_tasks rename column assignee_id to assigned_to;
