-- Task panel modernization: soft-delete trash for tasks, read receipts and
-- multi-file attachments for comments.

-- Soft delete — tasks land in a workspace trash instead of disappearing
-- immediately, restorable for 30 days.
alter table hub_project_tasks
  add column if not exists deleted_at timestamptz;

-- Read receipts for task comments: array of user ids who have viewed the
-- comment. Auto-populated by the client when the task panel is open.
alter table hub_project_task_comments
  add column if not exists seen_by jsonb not null default '[]'::jsonb;

-- Multi-file comment attachments. The legacy attachment_url/name/size/mime
-- columns keep mirroring the first file so older readers keep working.
alter table hub_project_task_comments
  add column if not exists attachments jsonb;
