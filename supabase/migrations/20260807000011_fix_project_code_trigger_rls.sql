-- generate_project_code() writes to hub_project_code_sequences internally,
-- but was never marked security definer — it ran as the calling user, and
-- RLS on hub_project_code_sequences has no policy letting a regular
-- authenticated user write to it, so every project save failed with
-- "new row violates row-level security policy for table
-- hub_project_code_sequences". Elevating it to security definer, same
-- pattern already used by every other trigger function in this app
-- (notify_task_completed, notify_appraisal_completed, etc.).

create or replace function generate_project_code() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  yr int;
  seq int;
begin
  if new.project_type_code is null then
    new.project_code := null;
    return new;
  end if;

  -- Don't burn a new sequence number on unrelated edits — only (re)generate
  -- when a code isn't set yet, or the type actually changed.
  if new.project_code is not null and TG_OP = 'UPDATE' and OLD.project_type_code = NEW.project_type_code then
    return new;
  end if;

  yr := extract(year from coalesce(new.created_at, now()))::int;

  insert into hub_project_code_sequences (year, next_seq)
  values (yr, 2)
  on conflict (year) do update set next_seq = hub_project_code_sequences.next_seq + 1
  returning next_seq - 1 into seq;

  new.project_code := 'FS-' || new.project_type_code || '-' || lpad((yr % 100)::text, 2, '0') || '-' || lpad(seq::text, 3, '0');
  return new;
end $$;
