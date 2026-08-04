-- System-generated project codes: FS-{TYPE}-{YY}-{NNN}
--
-- project_type_code replaces the old free-text "service" field (Architecture /
-- Interior Design, etc.) with a fixed 10-value use-classification. It's a
-- distinct concept from the existing `project_type` column (client/internal/
-- retainer — a workflow classification), kept as a separate column on purpose.
--
-- The sequence resets per type per year (COM-26-001, COM-26-002, then
-- RES-26-001 starts fresh), tracked in hub_project_code_sequences so
-- concurrent saves can't hand out the same number.

alter table hub_projects add column if not exists project_type_code text
  check (project_type_code in ('RES','COM','IND','INST','AGR','MIX','REN','ADD','INT','SITE'));
alter table hub_projects add column if not exists project_code text unique;

create table if not exists hub_project_code_sequences (
  project_type_code text not null,
  year int not null,
  next_seq int not null default 1,
  primary key (project_type_code, year)
);

create or replace function generate_project_code() returns trigger
  language plpgsql as $$
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

  insert into hub_project_code_sequences (project_type_code, year, next_seq)
  values (new.project_type_code, yr, 2)
  on conflict (project_type_code, year) do update set next_seq = hub_project_code_sequences.next_seq + 1
  returning next_seq - 1 into seq;

  new.project_code := 'FS-' || new.project_type_code || '-' || lpad((yr % 100)::text, 2, '0') || '-' || lpad(seq::text, 3, '0');
  return new;
end $$;

drop trigger if exists hub_projects_set_code on hub_projects;
create trigger hub_projects_set_code
  before insert or update of project_type_code on hub_projects
  for each row execute function generate_project_code();
