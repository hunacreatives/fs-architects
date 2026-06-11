create table hub_questionnaires (
  id bigint primary key generated always as identity,
  service_type text not null,
  client_name text not null,
  client_email text not null,
  token uuid default gen_random_uuid() unique not null,
  status text default 'draft' check (status in ('draft', 'sent', 'submitted')),
  questions jsonb not null default '[]',
  answers jsonb,
  intro_message text,
  submitted_at timestamptz,
  created_by uuid references hub_users(id),
  created_at timestamptz default now()
);

alter table hub_questionnaires enable row level security;

create policy "Admins manage questionnaires"
  on hub_questionnaires for all
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')));

create policy "Public read by token"
  on hub_questionnaires for select
  to anon using (true);

create policy "Public submit by token"
  on hub_questionnaires for update
  to anon using (status = 'sent') with check (status = 'submitted');
