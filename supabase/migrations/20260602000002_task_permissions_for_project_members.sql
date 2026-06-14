drop policy if exists "Project members manage tasks" on hub_project_tasks;

create policy "Project members manage tasks"
on hub_project_tasks
for all
to authenticated
using (
  exists (
    select 1
    from hub_project_contractors pc
    where pc.project_id = hub_project_tasks.project_id
      and pc.contractor_id = auth.uid()
  )
  or exists (
    select 1
    from hub_users hu
    where hu.id = auth.uid()
      and hu.role in ('admin', 'owner')
  )
)
with check (
  exists (
    select 1
    from hub_project_contractors pc
    where pc.project_id = hub_project_tasks.project_id
      and pc.contractor_id = auth.uid()
  )
  or exists (
    select 1
    from hub_users hu
    where hu.id = auth.uid()
      and hu.role in ('admin', 'owner')
  )
);
