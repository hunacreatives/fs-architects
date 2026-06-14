alter table hub_project_task_comments
  add column if not exists attachment_url  text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_mime text;
