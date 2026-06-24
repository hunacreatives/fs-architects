-- C-02: The previous "Users update own comments" policy used USING (true) WITH
-- CHECK (true), letting any authenticated user rewrite any other user's comment.
-- We need two different rules on the same UPDATE:
--   • reactions (jsonb column) — any authenticated user may update (collaborative)
--   • body (text column)       — only the comment's author may change
-- A single RLS policy can't distinguish by column, so we keep a permissive row
-- policy and enforce the column rule with a BEFORE UPDATE trigger.

drop policy if exists "Users update own comments" on hub_project_task_comments;

create policy "Authenticated update task comments"
  on hub_project_task_comments for update to authenticated
  using (true) with check (true);

create or replace function public.enforce_comment_edit_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the author may change the comment body.
  if new.body is distinct from old.body and old.user_id <> auth.uid() then
    raise exception 'Only the author can edit a comment body.';
  end if;
  -- Ownership and threading are immutable regardless of who updates reactions.
  new.user_id := old.user_id;
  new.task_id := old.task_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists trg_enforce_comment_edit on hub_project_task_comments;
create trigger trg_enforce_comment_edit
  before update on hub_project_task_comments
  for each row execute function public.enforce_comment_edit_rules();
