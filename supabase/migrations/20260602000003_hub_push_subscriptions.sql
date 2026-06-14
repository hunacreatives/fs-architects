create table if not exists hub_push_subscriptions (
  id bigserial primary key,
  user_id uuid not null references hub_users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists hub_push_subscriptions_user_idx
  on hub_push_subscriptions (user_id);

alter table hub_push_subscriptions enable row level security;

drop policy if exists "Users manage own push subscriptions" on hub_push_subscriptions;
create policy "Users manage own push subscriptions"
  on hub_push_subscriptions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
