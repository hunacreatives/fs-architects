-- Project codes were numbered per-type-per-year (AI-26-001, COM-26-001,
-- both starting fresh at 001). Numbering should be continuous per year
-- regardless of type, so the next code after AI-26-001 and COM-26-001 is
-- 002 (on whichever type is created next), not another 001.
--
-- Existing codes are left untouched — this only changes what NEW codes get
-- assigned going forward. The new per-year sequence is seeded from the
-- highest next_seq already in use across all types for each year, so
-- numbering picks up right after whatever's already been issued instead of
-- restarting.

create temporary table _year_max_seq as
select year, max(next_seq) as next_seq
from hub_project_code_sequences
group by year;

drop table hub_project_code_sequences;

create table hub_project_code_sequences (
  year int primary key,
  next_seq int not null default 1
);

insert into hub_project_code_sequences (year, next_seq)
select year, next_seq from _year_max_seq;

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

  insert into hub_project_code_sequences (year, next_seq)
  values (yr, 2)
  on conflict (year) do update set next_seq = hub_project_code_sequences.next_seq + 1
  returning next_seq - 1 into seq;

  new.project_code := 'FS-' || new.project_type_code || '-' || lpad((yr % 100)::text, 2, '0') || '-' || lpad(seq::text, 3, '0');
  return new;
end $$;
