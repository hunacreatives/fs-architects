-- Add slug column to hub_projects for friendly URLs
alter table hub_projects add column if not exists slug text unique;

-- Slugify helper: lowercase, replace non-alphanumeric runs with hyphens, trim hyphens
create or replace function slugify(input text) returns text
  language sql immutable strict as $$
    select regexp_replace(
      regexp_replace(
        lower(trim(input)),
        '[^a-z0-9]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    )
  $$;

-- Backfill slugs for existing projects (resolve collisions by appending id)
do $$
declare
  r record;
  base_slug text;
  final_slug text;
  counter int;
begin
  for r in select id, client_name from hub_projects where slug is null order by id loop
    base_slug := slugify(r.client_name);
    final_slug := base_slug;
    counter := 2;
    while exists (select 1 from hub_projects where slug = final_slug and id != r.id) loop
      final_slug := base_slug || '-' || counter;
      counter := counter + 1;
    end loop;
    update hub_projects set slug = final_slug where id = r.id;
  end loop;
end $$;

-- Trigger to auto-set slug on new projects (only if not provided)
create or replace function hub_projects_set_slug() returns trigger
  language plpgsql as $$
declare
  base_slug text;
  final_slug text;
  counter int;
begin
  if new.slug is null or new.slug = '' then
    base_slug := slugify(new.client_name);
    final_slug := base_slug;
    counter := 2;
    while exists (select 1 from hub_projects where slug = final_slug and id != coalesce(new.id, -1)) loop
      final_slug := base_slug || '-' || counter;
      counter := counter + 1;
    end loop;
    new.slug := final_slug;
  end if;
  return new;
end $$;

drop trigger if exists hub_projects_slug_trigger on hub_projects;
create trigger hub_projects_slug_trigger
  before insert on hub_projects
  for each row execute function hub_projects_set_slug();
