alter table public.hub_project_tasks
  add column if not exists assignee_ids uuid[] null;

update public.hub_project_tasks
set assignee_ids = array[assigned_to]
where assigned_to is not null
  and (assignee_ids is null or cardinality(assignee_ids) = 0);

update public.hub_project_tasks
set assignee_ids = null
where assignee_ids is not null
  and cardinality(assignee_ids) = 0;
