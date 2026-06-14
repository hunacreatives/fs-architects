-- Add service column to contact_submissions
alter table contact_submissions add column if not exists service text;

-- Create contact_replies table
create table if not exists contact_replies (
  id bigint generated always as identity primary key,
  submission_id bigint references contact_submissions(id) on delete set null,
  to_email text not null,
  to_name text,
  subject text not null,
  body text not null,
  sent_at timestamptz not null default now()
);

alter table contact_replies enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'contact_replies' and policyname = 'Admins can manage contact replies'
  ) then
    execute 'create policy "Admins can manage contact replies" on contact_replies for all using (exists (select 1 from hub_users where id = auth.uid() and role in (''admin'', ''owner'')))';
  end if;
end $$;
