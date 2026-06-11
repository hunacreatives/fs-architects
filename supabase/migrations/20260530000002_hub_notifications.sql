create table if not exists hub_notifications (
  id bigserial primary key,
  user_id uuid not null references hub_users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists hub_notifications_user_id_idx on hub_notifications(user_id);
create index if not exists hub_notifications_read_idx on hub_notifications(user_id, read);

alter table hub_notifications enable row level security;

-- Users can read their own notifications
create policy "Users read own notifications"
  on hub_notifications for select to authenticated
  using (user_id = auth.uid());

-- Edge functions (service role) can insert
create policy "Service role insert notifications"
  on hub_notifications for insert to authenticated
  with check (true);

-- Users can mark their own as read
create policy "Users update own notifications"
  on hub_notifications for update to authenticated
  using (user_id = auth.uid());
