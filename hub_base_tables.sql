-- ── hub_users (base table — must exist before all migrations) ──────────────
create table if not exists hub_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'contractor' check (role in ('owner', 'admin', 'hr', 'contractor')),
  avatar_url text,
  phone text,
  birthday date,
  address text,
  emergency_contact text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  slack_username text,
  slack_id text,
  department text,
  start_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  payment_type text default 'hourly' check (payment_type in ('hourly', 'fixed', 'fixed_flexible', 'project_based')),
  hourly_rate numeric,
  monthly_rate numeric,
  currency text default 'PHP',
  payment_method text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_account_type text,
  notes text,
  onboarding_completed boolean default false,
  is_developer boolean default false,
  shift_start time,
  shift_end time,
  work_days text[] default '{}',
  annual_pto_days integer default 15,
  annual_sick_days integer default 10,
  contract_expiry_date date,
  project_percentage numeric(5,2),
  dev_toolbar_hidden boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_users enable row level security;

create policy "Users can view all hub users" on hub_users
  for select to authenticated using (true);

create policy "Users can update own profile" on hub_users
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Admins can manage hub users" on hub_users
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));

-- ── hub_daily_hours ────────────────────────────────────────────────────────
create table if not exists hub_daily_hours (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references hub_users(id) on delete cascade,
  date date not null,
  hours_raw numeric not null default 0,
  hours_capped numeric not null default 0,
  overtime_hours numeric default 0,
  first_on timestamptz,
  last_off timestamptz,
  is_manual boolean default false,
  override_reason text,
  original_hours_raw numeric,
  original_hours_capped numeric,
  updated_at timestamptz default now(),
  unique(user_id, date)
);

alter table hub_daily_hours enable row level security;

create policy "Admins manage daily hours" on hub_daily_hours
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')));

create policy "Contractors view own hours" on hub_daily_hours
  for select to authenticated using (user_id = auth.uid());

-- ── hub_announcements ──────────────────────────────────────────────────────
create table if not exists hub_announcements (
  id bigserial primary key,
  title text not null,
  body text not null,
  priority text default 'normal' check (priority in ('normal', 'important', 'urgent')),
  category text default 'general',
  published boolean default false,
  scheduled_at timestamptz,
  created_by uuid references hub_users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_announcements enable row level security;

create policy "Authenticated users read announcements" on hub_announcements
  for select to authenticated using (published = true);

create policy "Admins manage announcements" on hub_announcements
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')));

-- ── hub_time_off ───────────────────────────────────────────────────────────
create table if not exists hub_time_off (
  id bigserial primary key,
  contractor_id uuid references hub_users(id) on delete cascade,
  type text not null check (type in ('pto', 'vacation', 'sick', 'emergency', 'unpaid', 'other')),
  start_date date not null,
  end_date date not null,
  reason text,
  status text default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references hub_users(id),
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_time_off enable row level security;

create policy "Contractors view own time off" on hub_time_off
  for select to authenticated using (contractor_id = auth.uid());

create policy "Contractors insert own time off" on hub_time_off
  for insert to authenticated with check (contractor_id = auth.uid());

create policy "Admins manage all time off" on hub_time_off
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')));

-- ── hub_requests ───────────────────────────────────────────────────────────
create table if not exists hub_requests (
  id bigserial primary key,
  contractor_id uuid references hub_users(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  status text default 'open' check (status in ('open', 'in_review', 'resolved', 'closed')),
  admin_notes text,
  reviewed_by uuid references hub_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_requests enable row level security;

create policy "Contractors view own requests" on hub_requests
  for select to authenticated using (contractor_id = auth.uid());

create policy "Contractors insert own requests" on hub_requests
  for insert to authenticated with check (contractor_id = auth.uid());

create policy "Admins manage all requests" on hub_requests
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')));

-- ── hub_payouts ────────────────────────────────────────────────────────────
create table if not exists hub_payouts (
  id bigserial primary key,
  contractor_id uuid references hub_users(id) on delete cascade,
  cutoff_start date not null,
  cutoff_end date not null,
  approved_hours numeric default 0,
  hourly_rate numeric default 0,
  base_pay numeric default 0,
  bonus numeric default 0,
  incentives numeric default 0,
  reimbursements numeric default 0,
  deductions numeric default 0,
  advances numeric default 0,
  penalties numeric default 0,
  overtime_pay numeric default 0,
  final_payout numeric default 0,
  status text default 'pending' check (status in ('pending', 'submitted', 'hr_approved', 'paid')),
  locked boolean default false,
  adjustments jsonb default '[]',
  batch_id uuid,
  submitted_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  payslip_sent_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(contractor_id, cutoff_start)
);

alter table hub_payouts enable row level security;

-- ── hub_pending_rates ──────────────────────────────────────────────────────
create table if not exists hub_pending_rates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references hub_users(id) on delete cascade,
  new_hourly_rate numeric,
  new_monthly_rate numeric,
  new_payment_type text,
  effective_date date,
  status text default 'pending',
  created_at timestamptz default now()
);

-- ── hub_sops ────────────────────────────────────────────────────────────────
create table if not exists hub_sops (
  id bigserial primary key,
  title text not null unique,
  category text default 'General',
  content text not null,
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_sops enable row level security;

create policy "Authenticated users read published sops" on hub_sops
  for select to authenticated using (published = true);

create policy "Admins manage sops" on hub_sops
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')));

-- ── hub_clients ────────────────────────────────────────────────────────────
create table if not exists hub_clients (
  id bigserial primary key,
  client_name text not null,
  platform text,
  status text default 'active' check (status in ('active', 'paused', 'ended')),
  notes text,
  contract_value numeric(10,2),
  contract_currency text not null default 'PHP' check (contract_currency in ('PHP', 'USD')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_clients enable row level security;

create policy "Authenticated users read clients" on hub_clients
  for select to authenticated using (true);

create policy "Admins manage clients" on hub_clients
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));

-- ── hub_push_subscriptions ─────────────────────────────────────────────────
create table if not exists hub_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references hub_users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  unique(user_id, endpoint)
);

alter table hub_push_subscriptions enable row level security;

create policy "Users manage own push subscriptions" on hub_push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Admins view push subscriptions" on hub_push_subscriptions
  for select to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));

-- ── is_hub_admin helper function ───────────────────────────────────────────
create or replace function is_hub_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from hub_users
    where id = auth.uid() and role in ('admin', 'owner', 'hr')
  );
$$;
