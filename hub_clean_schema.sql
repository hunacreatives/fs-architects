-- ============================================================
-- SENTRO OS HUB — CLEAN SCHEMA (single-run, ordered correctly)
-- ============================================================

-- ── USERS ────────────────────────────────────────────────────
create table if not exists hub_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'contractor' check (role in ('owner','admin','hr','contractor')),
  avatar_url text, phone text, birthday date, address text,
  emergency_contact text, emergency_contact_name text,
  emergency_contact_relationship text, emergency_contact_phone text,
  slack_username text, slack_id text, department text,
  start_date date, status text not null default 'active' check (status in ('active','inactive')),
  payment_type text default 'hourly' check (payment_type in ('hourly','fixed','fixed_flexible','project_based')),
  hourly_rate numeric, monthly_rate numeric, currency text default 'PHP',
  payment_method text, bank_name text, bank_account_name text,
  bank_account_number text, bank_account_type text, notes text,
  onboarding_completed boolean default false, is_developer boolean default false,
  shift_start time, shift_end time, work_days text[] default '{}',
  annual_pto_days integer default 15, annual_sick_days integer default 10,
  contract_expiry_date date, project_percentage numeric(5,2),
  dev_toolbar_hidden boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table hub_users enable row level security;
create policy "hub_users_select" on hub_users for select to authenticated using (true);
create policy "hub_users_update_own" on hub_users for update using (auth.uid()=id) with check (auth.uid()=id);
create policy "hub_users_admin" on hub_users for all to authenticated
  using (exists (select 1 from hub_users where id=auth.uid() and role in ('admin','owner')))
  with check (exists (select 1 from hub_users where id=auth.uid() and role in ('admin','owner')));

-- ── HELPER ───────────────────────────────────────────────────
create or replace function is_hub_admin() returns boolean language sql security definer as $$
  select exists (select 1 from hub_users where id=auth.uid() and role in ('admin','owner','hr'));
$$;

-- ── ADMIN INVITES ─────────────────────────────────────────────
create table if not exists hub_admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null, token text not null unique,
  used boolean default false, created_at timestamptz default now()
);
alter table hub_admin_invites enable row level security;
create policy "hub_invites_read" on hub_admin_invites for select using (true);
create policy "hub_invites_insert" on hub_admin_invites for insert with check (
  exists (select 1 from hub_users where id=auth.uid() and role in ('admin','owner')));
create policy "hub_invites_update" on hub_admin_invites for update using (auth.uid() is not null);

-- ── DAILY HOURS ───────────────────────────────────────────────
create table if not exists hub_daily_hours (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references hub_users(id) on delete cascade,
  date date not null, hours_raw numeric not null default 0,
  hours_capped numeric not null default 0, overtime_hours numeric default 0,
  first_on timestamptz, last_off timestamptz,
  is_manual boolean default false, override_reason text,
  original_hours_raw numeric, original_hours_capped numeric,
  updated_at timestamptz default now(), unique(user_id,date)
);
alter table hub_daily_hours enable row level security;
create policy "hub_daily_hours_admin" on hub_daily_hours for all to authenticated
  using (is_hub_admin());
create policy "hub_daily_hours_own" on hub_daily_hours for select to authenticated
  using (user_id=auth.uid());

-- ── PAYOUTS ───────────────────────────────────────────────────
create table if not exists hub_payouts (
  id bigserial primary key,
  contractor_id uuid references hub_users(id) on delete cascade,
  cutoff_start date not null, cutoff_end date not null,
  approved_hours numeric default 0, hourly_rate numeric default 0,
  base_pay numeric default 0, bonus numeric default 0,
  incentives numeric default 0, reimbursements numeric default 0,
  deductions numeric default 0, advances numeric default 0,
  penalties numeric default 0, overtime_pay numeric default 0,
  final_payout numeric default 0,
  status text default 'pending' check (status in ('pending','submitted','hr_approved','paid')),
  locked boolean default false, adjustments jsonb default '[]',
  batch_id uuid, submitted_at timestamptz, approved_at timestamptz,
  paid_at timestamptz, payslip_sent_at timestamptz, notes text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique(contractor_id, cutoff_start)
);
alter table hub_payouts enable row level security;
create policy "hub_payouts_own_view" on hub_payouts for select to authenticated using (contractor_id=auth.uid());
create policy "hub_payouts_admin_view" on hub_payouts for select to authenticated
  using (exists (select 1 from hub_users where id=auth.uid() and role in ('admin','owner')));
create policy "hub_payouts_admin_all" on hub_payouts for all to authenticated
  using (exists (select 1 from hub_users where id=auth.uid() and role in ('admin','owner')));
create policy "hub_payouts_own_insert" on hub_payouts for insert to authenticated with check (contractor_id=auth.uid());
create policy "hub_payouts_own_update" on hub_payouts for update to authenticated
  using (contractor_id=auth.uid() and coalesce(locked,false)=false) with check (contractor_id=auth.uid());

-- ── PAYROLL BATCHES ───────────────────────────────────────────
create table if not exists hub_payroll_batches (
  id uuid primary key default gen_random_uuid(),
  period_start date not null, period_end date not null, period_label text not null,
  total_amount numeric not null default 0, contractor_count int not null default 0,
  status text not null default 'pending_owner'
    check (status in ('pending_owner','owner_approved','closed')),
  requested_by uuid references hub_users(id), approved_by uuid references hub_users(id),
  closed_by uuid references hub_users(id),
  created_at timestamptz not null default now(), approved_at timestamptz,
  closed_at timestamptz, note text
);
alter table hub_payroll_batches enable row level security;
create policy "hub_batches_read" on hub_payroll_batches for select to authenticated using (true);
create policy "hub_batches_admin" on hub_payroll_batches for all to authenticated
  using (is_hub_admin()) with check (is_hub_admin());

alter table hub_payouts add column if not exists batch_id_fk uuid references hub_payroll_batches(id);

-- ── PAYROLL CACHE ─────────────────────────────────────────────
create table if not exists hub_payroll_cache (
  period_start date primary key, computed_total numeric not null,
  updated_at timestamptz not null default now()
);
alter table hub_payroll_cache enable row level security;
create policy "hub_payroll_cache_read" on hub_payroll_cache for select to authenticated using (true);
create policy "hub_payroll_cache_admin" on hub_payroll_cache for all to authenticated
  using (is_hub_admin()) with check (is_hub_admin());

-- ── RATE HISTORY ──────────────────────────────────────────────
create table if not exists hub_rate_history (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references hub_users(id) on delete cascade,
  effective_date date not null,
  payment_type text not null check (payment_type in ('hourly','fixed')),
  hourly_rate numeric, monthly_rate numeric, currency text not null default 'PHP',
  note text, created_by uuid references hub_users(id),
  created_at timestamptz not null default now()
);
alter table hub_rate_history enable row level security;
create policy "hub_rate_history_read" on hub_rate_history for select to authenticated using (true);
create policy "hub_rate_history_admin" on hub_rate_history for all to authenticated
  using (is_hub_admin()) with check (is_hub_admin());
create index if not exists hub_rate_history_idx on hub_rate_history(contractor_id, effective_date);

-- ── PENDING RATES ─────────────────────────────────────────────
create table if not exists hub_pending_rates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references hub_users(id) on delete cascade,
  new_hourly_rate numeric, new_monthly_rate numeric, new_payment_type text,
  effective_date date, status text default 'pending', created_at timestamptz default now()
);
alter table hub_pending_rates enable row level security;
create policy "hub_pending_rates_admin" on hub_pending_rates for all to authenticated
  using (is_hub_admin()) with check (is_hub_admin());

-- ── PAYSLIP DISPUTES ──────────────────────────────────────────
create table if not exists hub_payslip_disputes (
  id uuid primary key default gen_random_uuid(),
  payout_id bigint references hub_payouts(id) on delete cascade,
  contractor_id uuid references hub_users(id) on delete cascade,
  reason text not null, status text not null default 'open',
  admin_notes text, created_at timestamptz default now(), resolved_at timestamptz
);
alter table hub_payslip_disputes enable row level security;
create policy "hub_disputes_own" on hub_payslip_disputes for select using (contractor_id=auth.uid());
create policy "hub_disputes_insert" on hub_payslip_disputes for insert with check (contractor_id=auth.uid());
create policy "hub_disputes_admin" on hub_payslip_disputes for all
  using (is_hub_admin());

-- ── OVERTIME ──────────────────────────────────────────────────
create table if not exists hub_overtime_requests (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references hub_users(id) on delete cascade,
  date date not null, hours numeric(5,2) not null, reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references hub_users(id), admin_notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table hub_overtime_requests enable row level security;
create policy "hub_ot_own" on hub_overtime_requests for select using (contractor_id=auth.uid());
create policy "hub_ot_insert" on hub_overtime_requests for insert with check (contractor_id=auth.uid());
create policy "hub_ot_admin" on hub_overtime_requests for all using (is_hub_admin());

-- ── TIME OFF ──────────────────────────────────────────────────
create table if not exists hub_time_off (
  id bigserial primary key,
  contractor_id uuid references hub_users(id) on delete cascade,
  type text not null check (type in ('pto','vacation','sick','emergency','unpaid','other')),
  start_date date not null, end_date date not null, reason text,
  status text default 'pending' check (status in ('pending','approved','denied')),
  reviewed_by uuid references hub_users(id), admin_notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table hub_time_off enable row level security;
create policy "hub_timeoff_own" on hub_time_off for select using (contractor_id=auth.uid());
create policy "hub_timeoff_insert" on hub_time_off for insert with check (contractor_id=auth.uid());
create policy "hub_timeoff_admin" on hub_time_off for all using (is_hub_admin());

-- ── REQUESTS ──────────────────────────────────────────────────
create table if not exists hub_requests (
  id bigserial primary key,
  contractor_id uuid references hub_users(id) on delete cascade,
  type text not null, title text not null, description text,
  status text default 'open' check (status in ('open','in_review','resolved','closed')),
  admin_notes text, reviewed_by uuid references hub_users(id),
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table hub_requests enable row level security;
create policy "hub_requests_own" on hub_requests for select using (contractor_id=auth.uid());
create policy "hub_requests_insert" on hub_requests for insert with check (contractor_id=auth.uid());
create policy "hub_requests_admin" on hub_requests for all using (is_hub_admin());

-- ── ANNOUNCEMENTS ─────────────────────────────────────────────
create table if not exists hub_announcements (
  id bigserial primary key, title text not null, body text not null,
  priority text default 'normal' check (priority in ('normal','important','urgent')),
  category text default 'general', published boolean default false,
  scheduled_at timestamptz, created_by uuid references hub_users(id),
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table hub_announcements enable row level security;
create policy "hub_ann_read" on hub_announcements for select to authenticated using (published=true);
create policy "hub_ann_admin" on hub_announcements for all to authenticated
  using (is_hub_admin()) with check (is_hub_admin());

-- ── CREDENTIALS ───────────────────────────────────────────────
create table if not exists hub_credentials (
  id uuid primary key default gen_random_uuid(),
  client_name text not null, platform text not null,
  account_email text, password text, login_type text not null default 'email_password',
  otp_contact text, additional_info text, status text not null default 'active',
  notes text, created_by uuid references hub_users(id),
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists hub_credential_requests (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid references hub_credentials(id) on delete cascade,
  contractor_id uuid references hub_users(id), reason text,
  status text not null default 'pending', reviewed_by uuid references hub_users(id),
  reviewed_at timestamptz, created_at timestamptz default now()
);
alter table hub_credentials enable row level security;
alter table hub_credential_requests enable row level security;
create policy "hub_cred_read" on hub_credentials for select using (auth.uid() is not null);
create policy "hub_cred_admin" on hub_credentials for all using (is_hub_admin());
create policy "hub_credreq_admin" on hub_credential_requests for all using (is_hub_admin());
create policy "hub_credreq_own" on hub_credential_requests for all using (contractor_id=auth.uid());

-- ── DOCUMENTS / SIGNING ───────────────────────────────────────
create table if not exists hub_sign_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, file_url text not null,
  file_name text not null, content text, is_generated boolean default false,
  amendment_type text default 'initial', rate_snapshot numeric,
  uploaded_by uuid references hub_users(id) on delete set null,
  created_at timestamptz default now()
);
create table if not exists hub_sign_assignments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references hub_sign_documents(id) on delete cascade,
  contractor_id uuid not null references hub_users(id) on delete cascade,
  status text not null default 'pending', signed_at timestamptz,
  signed_name text, drive_file_id text,
  created_at timestamptz default now(), unique(document_id, contractor_id)
);
alter table hub_sign_documents enable row level security;
alter table hub_sign_assignments enable row level security;
create policy "hub_signdoc_admin" on hub_sign_documents for all using (is_hub_admin());
create policy "hub_signdoc_assigned" on hub_sign_documents for select
  using (exists (select 1 from hub_sign_assignments where document_id=hub_sign_documents.id and contractor_id=auth.uid()));
create policy "hub_signass_admin" on hub_sign_assignments for all using (is_hub_admin());
create policy "hub_signass_own_read" on hub_sign_assignments for select using (contractor_id=auth.uid());
create policy "hub_signass_own_update" on hub_sign_assignments for update
  using (contractor_id=auth.uid()) with check (contractor_id=auth.uid());

-- ── PERFORMANCE REVIEWS ───────────────────────────────────────
create table if not exists hub_performance_reviews (
  id bigserial primary key,
  contractor_id uuid not null references hub_users(id) on delete cascade,
  reviewer_id uuid references hub_users(id) on delete set null,
  period_label text not null,
  overall_rating integer check (overall_rating between 1 and 5),
  attendance_rating integer check (attendance_rating between 1 and 5),
  quality_rating integer check (quality_rating between 1 and 5),
  communication_rating integer check (communication_rating between 1 and 5),
  initiative_rating integer check (initiative_rating between 1 and 5),
  strengths text, improvements text, notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table hub_performance_reviews enable row level security;
create policy "hub_perf_admin_or_own" on hub_performance_reviews for all to authenticated
  using (is_hub_admin() or contractor_id=auth.uid())
  with check (is_hub_admin());

-- ── AUDIT LOG ─────────────────────────────────────────────────
create table if not exists hub_audit_log (
  id bigserial primary key,
  actor_id uuid references hub_users(id) on delete set null,
  actor_name text, action text not null, entity_type text,
  entity_id text, description text, metadata jsonb,
  created_at timestamptz default now()
);
alter table hub_audit_log enable row level security;
create policy "hub_audit_read" on hub_audit_log for select using (is_hub_admin());
create policy "hub_audit_insert" on hub_audit_log for insert with check (auth.uid() is not null);

-- ── SETTINGS ──────────────────────────────────────────────────
create table if not exists hub_settings (
  key text primary key, value text not null, updated_at timestamptz default now()
);
insert into hub_settings (key, value) values ('usd_rate','56') on conflict (key) do nothing;
alter table hub_settings enable row level security;
create policy "hub_settings_admin" on hub_settings for all to authenticated
  using (is_hub_admin()) with check (is_hub_admin());
create policy "hub_settings_read" on hub_settings for select to authenticated using (true);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
create table if not exists hub_notifications (
  id bigserial primary key,
  user_id uuid not null references hub_users(id) on delete cascade,
  type text not null, title text not null, body text not null,
  link text, read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists hub_notif_user on hub_notifications(user_id);
create index if not exists hub_notif_read on hub_notifications(user_id, read);
alter table hub_notifications enable row level security;
create policy "hub_notif_own" on hub_notifications for select to authenticated using (user_id=auth.uid());
create policy "hub_notif_insert" on hub_notifications for insert to authenticated with check (true);
create policy "hub_notif_update" on hub_notifications for update to authenticated using (user_id=auth.uid());

-- ── PUSH SUBSCRIPTIONS ────────────────────────────────────────
create table if not exists hub_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references hub_users(id) on delete cascade,
  endpoint text not null, p256dh text not null, auth text not null,
  created_at timestamptz default now(), unique(user_id, endpoint)
);
alter table hub_push_subscriptions enable row level security;
create policy "hub_push_own" on hub_push_subscriptions for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

-- ── SOPs ──────────────────────────────────────────────────────
create table if not exists hub_sops (
  id bigserial primary key, title text not null unique,
  category text default 'General', content text not null,
  published boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table hub_sops enable row level security;
create policy "hub_sops_read" on hub_sops for select to authenticated using (published=true);
create policy "hub_sops_admin" on hub_sops for all to authenticated
  using (is_hub_admin()) with check (is_hub_admin());

-- ── CLIENTS ───────────────────────────────────────────────────
create table if not exists hub_clients (
  id bigserial primary key, client_name text not null,
  platform text, status text default 'active' check (status in ('active','paused','ended')),
  notes text, contract_value numeric(10,2),
  contract_currency text not null default 'PHP' check (contract_currency in ('PHP','USD')),
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table hub_clients enable row level security;
create policy "hub_clients_read" on hub_clients for select to authenticated using (true);
create policy "hub_clients_admin" on hub_clients for all to authenticated
  using (is_hub_admin()) with check (is_hub_admin());

create table if not exists hub_client_assignments (
  id bigserial primary key,
  client_id bigint not null references hub_clients(id) on delete cascade,
  contractor_id uuid not null references hub_users(id) on delete cascade,
  role text, created_at timestamptz default now(),
  unique(client_id, contractor_id)
);
alter table hub_client_assignments enable row level security;
create policy "hub_clientass_read" on hub_client_assignments for select to authenticated using (true);
create policy "hub_clientass_admin" on hub_client_assignments for all to authenticated
  using (is_hub_admin()) with check (is_hub_admin());

-- ── PROJECTS ──────────────────────────────────────────────────
create table if not exists hub_projects (
  id bigserial primary key,
  client_name text not null, project_name text not null,
  service text, contract_price numeric(12,2) not null default 0,
  monthly_rate numeric, monthly_rate_currency text not null default 'PHP',
  status text not null default 'ongoing' check (status in ('ongoing','completed','paused','cancelled')),
  project_type text not null default 'client' check (project_type in ('client','internal','retainer')),
  start_date date, deadline date, notes text, contact_email text, drive_url text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists hub_project_payments (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  amount numeric(12,2) not null, paid_at date not null default current_date,
  notes text, receipt_url text, created_at timestamptz default now()
);
create table if not exists hub_project_costs (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  label text not null, amount numeric(12,2) not null,
  date date not null default current_date, notes text, created_at timestamptz default now()
);
create table if not exists hub_project_contractors (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  contractor_id uuid not null references hub_users(id) on delete cascade,
  percentage numeric(5,2) not null default 0,
  payout_type text not null default 'percentage' check (payout_type in ('percentage','fixed')),
  fixed_amount numeric(10,2),
  payout_status text not null default 'pending' check (payout_status in ('pending','approved','paid')),
  project_role text, paid_at timestamptz, notes text,
  created_at timestamptz default now(), unique(project_id, contractor_id)
);
create table if not exists hub_project_contractor_payouts (
  id serial primary key,
  project_contractor_id integer not null references hub_project_contractors(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  paid_at date not null default current_date, notes text, receipt_url text,
  created_at timestamptz default now()
);
create table if not exists hub_payment_reminders (
  id serial primary key,
  project_id bigint references hub_projects(id) on delete cascade,
  send_date date not null, amount_due numeric(12,2), notes text,
  status text default 'pending', sent_at timestamptz, created_at timestamptz default now()
);

alter table hub_projects enable row level security;
alter table hub_project_payments enable row level security;
alter table hub_project_costs enable row level security;
alter table hub_project_contractors enable row level security;
alter table hub_project_contractor_payouts enable row level security;
alter table hub_payment_reminders enable row level security;

create policy "hub_proj_read" on hub_projects for select to authenticated using (true);
create policy "hub_proj_admin" on hub_projects for all to authenticated using (is_hub_admin()) with check (is_hub_admin());
create policy "hub_projpay_read" on hub_project_payments for select to authenticated using (true);
create policy "hub_projpay_admin" on hub_project_payments for all to authenticated using (is_hub_admin()) with check (is_hub_admin());
create policy "hub_projcost_read" on hub_project_costs for select to authenticated using (true);
create policy "hub_projcost_admin" on hub_project_costs for all to authenticated using (is_hub_admin()) with check (is_hub_admin());
create policy "hub_projcon_read" on hub_project_contractors for select to authenticated using (true);
create policy "hub_projcon_admin" on hub_project_contractors for all to authenticated using (is_hub_admin()) with check (is_hub_admin());
create policy "hub_projconpay_admin" on hub_project_contractor_payouts for all to authenticated using (is_hub_admin()) with check (is_hub_admin());
create policy "hub_projconpay_own" on hub_project_contractor_payouts for select to authenticated
  using (exists (select 1 from hub_project_contractors pc where pc.id=project_contractor_id and pc.contractor_id=auth.uid()));
create policy "hub_reminders_admin" on hub_payment_reminders for all to authenticated using (is_hub_admin()) with check (is_hub_admin());

-- ── TASKS ─────────────────────────────────────────────────────
create table if not exists hub_project_tasks (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  title text not null, description text,
  status text not null default 'todo'
    check (status in ('todo','in_progress','in_review','blocked','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  assigned_to uuid references hub_users(id) on delete set null,
  due_date date, start_date date, checklist jsonb default '[]',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists hub_project_task_comments (
  id bigserial primary key,
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  user_id uuid not null references hub_users(id) on delete cascade,
  body text not null, created_at timestamptz default now()
);
create table if not exists hub_project_task_attachments (
  id bigserial primary key,
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  uploaded_by uuid references hub_users(id) on delete set null,
  name text not null, url text not null, size bigint, mime_type text,
  created_at timestamptz default now()
);
create table if not exists hub_project_task_watchers (
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  user_id uuid not null references hub_users(id) on delete cascade,
  primary key (task_id, user_id)
);
create table if not exists hub_project_task_activity (
  id bigserial primary key,
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  actor_id uuid references hub_users(id) on delete set null,
  actor_name text not null, type text not null, description text not null,
  created_at timestamptz default now()
);
create table if not exists hub_project_activity (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  user_id uuid references hub_users(id) on delete set null,
  action text not null, entity_type text not null default 'task',
  entity_id bigint, entity_title text, meta jsonb,
  created_at timestamptz default now()
);

alter table hub_project_tasks enable row level security;
alter table hub_project_task_comments enable row level security;
alter table hub_project_task_attachments enable row level security;
alter table hub_project_task_watchers enable row level security;
alter table hub_project_task_activity enable row level security;
alter table hub_project_activity enable row level security;

create policy "hub_tasks_read" on hub_project_tasks for select to authenticated using (true);
create policy "hub_tasks_write" on hub_project_tasks for all to authenticated using (true) with check (true);
create policy "hub_taskcomments_read" on hub_project_task_comments for select to authenticated using (true);
create policy "hub_taskcomments_insert" on hub_project_task_comments for insert to authenticated with check (user_id=auth.uid());
create policy "hub_taskcomments_delete" on hub_project_task_comments for delete to authenticated
  using (user_id=auth.uid() or is_hub_admin());
create policy "hub_taskatt_read" on hub_project_task_attachments for select to authenticated using (true);
create policy "hub_taskatt_insert" on hub_project_task_attachments for insert to authenticated with check (true);
create policy "hub_taskatt_delete" on hub_project_task_attachments for delete to authenticated
  using (uploaded_by=auth.uid() or is_hub_admin());
create policy "hub_taskwatchers" on hub_project_task_watchers for all to authenticated using (true) with check (true);
create policy "hub_taskact_read" on hub_project_task_activity for select to authenticated using (true);
create policy "hub_taskact_insert" on hub_project_task_activity for insert to authenticated with check (true);
create policy "hub_projact_read" on hub_project_activity for select to authenticated using (true);
create policy "hub_projact_insert" on hub_project_activity for insert to authenticated with check (user_id=auth.uid());

-- ── INVOICES ──────────────────────────────────────────────────
create table if not exists hub_invoice_log (
  id serial primary key, invoice_number text not null,
  project_id bigint references hub_projects(id) on delete set null,
  client_name text not null, project_name text not null,
  sent_to text not null, sent_cc text, subject text,
  contract_price numeric(12,2), total_paid numeric(12,2), balance numeric(12,2),
  line_items jsonb, show_payments boolean default true, sent_at timestamptz default now()
);
create table if not exists hub_scheduled_invoices (
  id serial primary key,
  project_id bigint references hub_projects(id) on delete set null,
  invoice_number text not null, to_email text not null, cc_email text, subject text,
  client_name text not null, project_name text not null, service text,
  contract_price numeric(12,2), start_date date, due_date date, payments jsonb,
  show_payments boolean default true, line_items jsonb, notes text,
  bill_to_name text, bill_to_address text, reference text, payment_terms text,
  message text, amount_requested numeric(12,2),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','cancelled','failed')),
  sent_at timestamptz, cancelled_at timestamptz, last_error text,
  created_at timestamptz default now()
);
create table if not exists hub_invoice_payment_links (
  id uuid primary key default gen_random_uuid(),
  token uuid unique not null default gen_random_uuid(),
  project_id bigint references hub_projects(id) on delete set null,
  invoice_number text not null, client_name text not null, project_name text not null,
  to_email text not null, amount_due numeric(12,2) not null, due_date date,
  line_items jsonb, payment_terms text, reference text,
  status text not null default 'open', submitted_at timestamptz,
  created_at timestamptz default now()
);
create table if not exists hub_payment_proof_submissions (
  id serial primary key,
  payment_link_id uuid not null references hub_invoice_payment_links(id) on delete cascade,
  project_id bigint references hub_projects(id) on delete set null,
  invoice_number text not null, client_name text not null, project_name text not null,
  payer_name text not null, payer_email text, payment_channel text not null,
  amount numeric(12,2), reference_number text, notes text, proof_url text,
  status text not null default 'submitted', submitted_at timestamptz default now()
);
create table if not exists hub_payment_receipt_log (
  id serial primary key, project_id bigint references hub_projects(id) on delete set null,
  client_name text not null, project_name text not null,
  payment_amount numeric(12,2) not null, paid_at date, sent_to text not null,
  total_paid numeric(12,2), balance numeric(12,2), receipt_url text,
  sent_at timestamptz default now()
);

alter table hub_invoice_log enable row level security;
alter table hub_scheduled_invoices enable row level security;
alter table hub_invoice_payment_links enable row level security;
alter table hub_payment_proof_submissions enable row level security;
alter table hub_payment_receipt_log enable row level security;

create policy "hub_invlog_admin" on hub_invoice_log for all to authenticated using (is_hub_admin()) with check (is_hub_admin());
create policy "hub_schedinv_admin" on hub_scheduled_invoices for all to authenticated using (is_hub_admin()) with check (is_hub_admin());
create policy "hub_paylink_admin" on hub_invoice_payment_links for all to authenticated using (is_hub_admin()) with check (is_hub_admin());
create policy "hub_payproof_admin" on hub_payment_proof_submissions for all to authenticated using (is_hub_admin()) with check (is_hub_admin());
create policy "hub_receiptlog_admin" on hub_payment_receipt_log for all to authenticated using (is_hub_admin()) with check (is_hub_admin());

-- ── QUESTIONNAIRES ────────────────────────────────────────────
create table if not exists hub_questionnaires (
  id bigint primary key generated always as identity,
  service_type text not null, client_name text not null, client_email text not null,
  token uuid default gen_random_uuid() unique not null,
  status text default 'draft' check (status in ('draft','sent','submitted')),
  questions jsonb not null default '[]', answers jsonb, intro_message text,
  submitted_at timestamptz, created_by uuid references hub_users(id),
  created_at timestamptz default now()
);
alter table hub_questionnaires enable row level security;
create policy "hub_quest_admin" on hub_questionnaires for all using (is_hub_admin());
create policy "hub_quest_anon_read" on hub_questionnaires for select to anon using (true);
create policy "hub_quest_anon_submit" on hub_questionnaires for update to anon
  using (status='sent') with check (status='submitted');

-- ── STORAGE BUCKETS ───────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments','task-attachments',false,26214400,null)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'payment-proofs','payment-proofs',true,10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
where not exists (select 1 from storage.buckets where id='payment-proofs');

create policy "storage_taskatt_upload" on storage.objects for insert to authenticated
  with check (bucket_id='task-attachments');
create policy "storage_taskatt_read" on storage.objects for select to authenticated
  using (bucket_id='task-attachments');
create policy "storage_taskatt_delete" on storage.objects for delete to authenticated
  using (bucket_id='task-attachments');
