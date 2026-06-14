create table if not exists hub_application_notes (
  id bigint generated always as identity primary key,
  application_id bigint not null references hub_job_applications(id) on delete cascade,
  author_id uuid not null references hub_users(id) on delete cascade,
  author_name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table hub_application_notes enable row level security;

create policy "Admins can manage application notes"
  on hub_application_notes
  for all
  using (
    exists (
      select 1 from hub_users
      where id = auth.uid()
      and role in ('owner', 'admin', 'hr')
      and status = 'active'
    )
  );
