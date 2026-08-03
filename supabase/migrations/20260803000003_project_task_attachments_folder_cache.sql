-- Caches the resolved "Task Attachments" Drive subfolder id per project so
-- attachment uploads don't have to re-search Google Drive for it every time.
alter table hub_projects add column if not exists task_attachments_folder_id text;
