-- hub_time_off
alter table hub_time_off
  add column if not exists updated_at timestamptz default now();

update hub_time_off set updated_at = created_at where updated_at is null;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists hub_time_off_updated_at on hub_time_off;
create trigger hub_time_off_updated_at
  before update on hub_time_off
  for each row execute function set_updated_at();

-- hub_requests
alter table hub_requests
  add column if not exists updated_at timestamptz default now();

update hub_requests set updated_at = created_at where updated_at is null;

drop trigger if exists hub_requests_updated_at on hub_requests;
create trigger hub_requests_updated_at
  before update on hub_requests
  for each row execute function set_updated_at();
