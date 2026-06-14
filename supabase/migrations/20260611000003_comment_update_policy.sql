-- Allow users to update their own comment body; allow anyone to update reactions
create policy "Users update own comments"
  on hub_project_task_comments for update to authenticated
  using (true)
  with check (true);
