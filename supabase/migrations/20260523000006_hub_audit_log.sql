create table if not exists hub_audit_log (
  id bigserial primary key,
  actor_id uuid references hub_users(id) on delete set null,
  actor_name text,
  action text not null,
  entity_type text,
  entity_id text,
  description text,
  metadata jsonb,
  created_at timestamptz default now()
);

alter table hub_audit_log enable row level security;

-- Admins and owners can read all logs
create policy "hub_audit_log_read" on hub_audit_log
  for select using (
    exists (
      select 1 from hub_users
      where id = auth.uid()
      and role in ('admin', 'owner')
    )
  );

-- Any authenticated hub user can insert (so contractor actions also get logged if needed)
create policy "hub_audit_log_insert" on hub_audit_log
  for insert with check (auth.uid() is not null);
