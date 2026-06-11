alter table hub_pending_rates enable row level security;

create policy "admins manage pending rates" on hub_pending_rates
  for all to authenticated
  using (
    exists (
      select 1 from hub_users
      where id = auth.uid()
      and role in ('admin', 'owner', 'hr')
    )
  )
  with check (
    exists (
      select 1 from hub_users
      where id = auth.uid()
      and role in ('admin', 'owner', 'hr')
    )
  );
