create table if not exists hub_job_applications (
  id bigserial primary key,
  job_id text,
  role text not null,
  name text not null,
  email text not null,
  expected_rate text not null,
  portfolio_link text,
  resume_link text,
  resume_filename text,
  resume_drive_file_id text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'reviewing', 'shortlisted', 'archived')),
  admin_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid references hub_users(id) on delete set null,
  source text not null default 'careers_site',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hub_job_applications_created_at_idx on hub_job_applications(created_at desc);
create index if not exists hub_job_applications_status_idx on hub_job_applications(status);
create index if not exists hub_job_applications_role_idx on hub_job_applications(role);

alter table hub_job_applications enable row level security;

create policy "Admins manage job applications"
  on hub_job_applications
  for all
  using (exists (
    select 1
    from hub_users
    where id = auth.uid()
      and role in ('admin', 'owner', 'hr')
  ))
  with check (exists (
    select 1
    from hub_users
    where id = auth.uid()
      and role in ('admin', 'owner', 'hr')
  ));
