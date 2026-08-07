-- The org chart's auto-reparent-onto-team-lead logic could create a
-- reporting cycle (A reports to B, B reports to A), which made the chart
-- recurse infinitely and froze the tab. Frontend now guards against
-- creating new cycles, but this:
--   1. Breaks any cycle that may already exist in live data from testing.
--   2. Adds a trigger so a cycle can never be written again, from any path
--      (including future bugs, or a direct SQL edit).

-- 1. Break existing cycles: for anyone whose manager chain loops back to
-- themselves, drop their manager_id (falls back to reporting to root).
do $$
declare
  r record;
  cur uuid;
  seen uuid[];
  is_cycle boolean;
begin
  for r in select id, manager_id from hub_users where manager_id is not null loop
    cur := r.manager_id;
    seen := array[r.id];
    is_cycle := false;
    while cur is not null loop
      if cur = any(seen) then
        is_cycle := true;
        exit;
      end if;
      seen := array_append(seen, cur);
      select manager_id into cur from hub_users where id = cur;
    end loop;
    if is_cycle then
      update hub_users set manager_id = null where id = r.id;
      raise notice 'Cleared cyclic manager_id for user %', r.id;
    end if;
  end loop;
end $$;

-- 2. Reject any future write that would create a cycle.
create or replace function public.hub_users_prevent_manager_cycle()
returns trigger
language plpgsql
as $$
declare
  cur uuid;
begin
  if new.manager_id is null then
    return new;
  end if;
  if new.manager_id = new.id then
    raise exception 'A user cannot report to themself.';
  end if;
  cur := new.manager_id;
  while cur is not null loop
    if cur = new.id then
      raise exception 'This reporting line would create a cycle.';
    end if;
    select manager_id into cur from hub_users where id = cur;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_hub_users_prevent_manager_cycle on hub_users;
create trigger trg_hub_users_prevent_manager_cycle
  before insert or update of manager_id on hub_users
  for each row
  execute function public.hub_users_prevent_manager_cycle();
