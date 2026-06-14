create table if not exists contact_submissions (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  subject text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  created_at timestamptz not null default now()
);

alter table contact_submissions enable row level security;

create policy "Admins can manage contact submissions"
  on contact_submissions for all
  using (
    exists (
      select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')
    )
  );
