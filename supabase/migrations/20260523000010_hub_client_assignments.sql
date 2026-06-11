-- Junction table for many-to-many client ↔ contractor assignments
create table if not exists hub_client_assignments (
  id bigserial primary key,
  client_id bigint not null references hub_clients(id) on delete cascade,
  contractor_id uuid not null references hub_users(id) on delete cascade,
  role text,
  created_at timestamptz default now(),
  unique(client_id, contractor_id)
);

-- Migrate existing single assignments
insert into hub_client_assignments (client_id, contractor_id, role)
select c.id, c.assigned_contractor_id::uuid, c.role
from hub_clients c
where c.assigned_contractor_id is not null
on conflict (client_id, contractor_id) do nothing;

alter table hub_client_assignments enable row level security;

create policy "Authenticated users can read client assignments"
  on hub_client_assignments for select to authenticated using (true);

create policy "Admins can manage client assignments"
  on hub_client_assignments for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));
