-- Allow project members (contractors) to insert activity logs for their projects
drop policy if exists "Admins manage activity" on hub_project_activity;

create policy "Project members manage activity"
on hub_project_activity
for all
to authenticated
using (
  exists (
    select 1 from hub_project_contractors pc
    where pc.project_id = hub_project_activity.project_id
      and pc.contractor_id = auth.uid()
  )
  or exists (
    select 1 from hub_users hu
    where hu.id = auth.uid()
      and hu.role in ('admin', 'owner')
  )
)
with check (
  exists (
    select 1 from hub_project_contractors pc
    where pc.project_id = hub_project_activity.project_id
      and pc.contractor_id = auth.uid()
  )
  or exists (
    select 1 from hub_users hu
    where hu.id = auth.uid()
      and hu.role in ('admin', 'owner')
  )
);
