-- Renumber ALL existing project codes into one continuous sequence per
-- year (across all project types), ordered by original creation time, per
-- explicit request. Previously each type had its own sequence, so
-- AI-26-001 and COM-26-001 could both exist as "001" — this rewrites every
-- existing code so numbering is continuous within each year regardless of
-- type.
--
-- Drive folder names are NOT touched here — renaming a Drive folder
-- requires calling the Drive API, which SQL can't do. Run the
-- backfill-project-drive-folder-names edge function right after this to
-- resync every affected project's folder name to its new code.

do $$
declare
  r record;
  seq int;
  cur_year int := null;
begin
  for r in
    select id, project_type_code, extract(year from created_at)::int as yr
    from hub_projects
    where project_type_code is not null
    order by extract(year from created_at)::int, created_at, id
  loop
    if cur_year is distinct from r.yr then
      cur_year := r.yr;
      seq := 1;
    end if;

    update hub_projects
    set project_code = 'FS-' || project_type_code || '-' || lpad((r.yr % 100)::text, 2, '0') || '-' || lpad(seq::text, 3, '0')
    where id = r.id;

    seq := seq + 1;
  end loop;
end $$;

-- Rebuild the per-year sequence table to match the new numbering exactly,
-- so the next NEW project continues right after the last renumbered one.
delete from hub_project_code_sequences;
insert into hub_project_code_sequences (year, next_seq)
select extract(year from created_at)::int as yr, count(*) + 1
from hub_projects
where project_type_code is not null
group by extract(year from created_at)::int;
