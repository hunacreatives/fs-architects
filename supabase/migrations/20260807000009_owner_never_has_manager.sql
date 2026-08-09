-- The org chart's "Add Direct Report" picker and the Teams page's
-- auto-reparent-onto-lead logic didn't exclude the owner, so the owner
-- could end up with a manager_id set (e.g. Fretz got notified "You now
-- report to Francis Yu"). The owner is always the chart's root and must
-- never have a manager. Frontend now excludes them from every picker/
-- auto-reparent path; this:
--   1. Clears manager_id for anyone with role = 'owner' right now.
--   2. Adds a trigger so it can never happen again, from any path.

update hub_users set manager_id = null where role = 'owner' and manager_id is not null;

create or replace function public.hub_users_prevent_owner_manager()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'owner' and new.manager_id is not null then
    raise exception 'The owner cannot report to anyone.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hub_users_prevent_owner_manager on hub_users;
create trigger trg_hub_users_prevent_owner_manager
  before insert or update of manager_id, role on hub_users
  for each row
  execute function public.hub_users_prevent_owner_manager();
