-- Track when a task was marked done
alter table hub_project_tasks
  add column if not exists done_at timestamptz;

-- Backfill existing done tasks (use updated_at as approximation)
update hub_project_tasks
  set done_at = updated_at
  where status = 'done' and done_at is null;

-- Trigger: set done_at when status flips to done, clear it when un-done
create or replace function set_task_done_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.done_at = now();
  elsif new.status != 'done' then
    new.done_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_task_done_at on hub_project_tasks;
create trigger trg_task_done_at
  before update on hub_project_tasks
  for each row execute function set_task_done_at();

-- Daily cron: archive done tasks that have been done for 14+ days
-- Requires pg_cron extension (enabled on Supabase Pro)
select cron.schedule(
  'auto-archive-done-tasks',
  '0 3 * * *',
  $$
  update hub_project_tasks
  set archived_at = now(), archived = true
  where status = 'done'
    and archived_at is null
    and done_at is not null
    and done_at < now() - interval '14 days';
  $$
);
