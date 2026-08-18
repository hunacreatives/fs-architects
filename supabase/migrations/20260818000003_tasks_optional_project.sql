-- ── Tasks can exist without a project ────────────────────────────────────────
-- Fretz wants standalone tasks on the board (admin errands, one-offs) that
-- aren't attached to any client project.

alter table hub_project_tasks
  alter column project_id drop not null;

-- The "Project members manage tasks" policy matches on hub_project_contractors
-- .project_id, which can never match a null — so without this, a project-less
-- task would be editable only by admins/owners and the assignee could not even
-- tick it off their own To-Do list.
drop policy if exists "Assignees manage project-less tasks" on hub_project_tasks;

create policy "Assignees manage project-less tasks"
on hub_project_tasks
for all
to authenticated
using (
  project_id is null
  and (
    assigned_to = auth.uid()
    or auth.uid() = any (coalesce(assignee_ids, '{}'::uuid[]))
  )
)
with check (
  project_id is null
  and (
    assigned_to = auth.uid()
    or auth.uid() = any (coalesce(assignee_ids, '{}'::uuid[]))
  )
);
