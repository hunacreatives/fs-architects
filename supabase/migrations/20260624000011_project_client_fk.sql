-- W-17: hub_projects linked to clients only by a plain client_name string, so a
-- client rename in hub_clients silently orphaned its projects. Add a real FK and
-- backfill it from the existing name match. client_name is kept as a denormalized
-- display/label field, but client_id is now the source of truth for the link.
alter table public.hub_projects
  add column if not exists client_id bigint references hub_clients(id) on delete set null;

-- Backfill by case-insensitive name match where unambiguous.
update public.hub_projects p
set client_id = c.id
from public.hub_clients c
where p.client_id is null
  and lower(trim(p.client_name)) = lower(trim(c.client_name));

create index if not exists idx_hub_projects_client_id on public.hub_projects (client_id);
