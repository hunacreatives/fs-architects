-- ===== 20260520000001_hub_users_self_update.sql =====
-- Allow users to update their own hub_users row
DROP POLICY IF EXISTS "Users can update own profile" ON hub_users;
CREATE POLICY "Users can update own profile" ON hub_users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ===== 20260520000002_hub_admin_invites.sql =====
CREATE TABLE IF NOT EXISTS hub_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hub_admin_invites ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for signup validation with anon key)
CREATE POLICY "Public can read admin invites" ON hub_admin_invites
  FOR SELECT USING (true);

-- ===== 20260520000004_admin_invites_rls.sql =====
-- Admins/owners can insert new invites
CREATE POLICY "Admins can create invites" ON hub_admin_invites
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM hub_users
      WHERE hub_users.id = auth.uid()
      AND hub_users.role IN ('admin', 'owner')
    )
  );

-- Any authenticated user can mark an invite as used (happens during signup after auth.signUp)
CREATE POLICY "Authenticated can mark invite used" ON hub_admin_invites
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ===== 20260520000006_hub_credentials.sql =====
CREATE TABLE hub_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  platform text NOT NULL,
  account_email text,
  password text,
  login_type text NOT NULL DEFAULT 'email_password',
  otp_contact text,
  additional_info text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES hub_users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE hub_credential_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid REFERENCES hub_credentials(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES hub_users(id),
  reason text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES hub_users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hub_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_credential_requests ENABLE ROW LEVEL SECURITY;

-- All authenticated hub users can SELECT (UI controls what columns are shown; password never fetched for unauthorized users)
CREATE POLICY "Hub members can view credentials" ON hub_credentials
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admin/owner can insert, update, delete
CREATE POLICY "Admins manage credentials" ON hub_credentials
  FOR ALL USING (
    EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

-- Admin/owner see and manage all requests
CREATE POLICY "Admins manage requests" ON hub_credential_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

-- Contractors manage their own requests
CREATE POLICY "Contractors manage own requests" ON hub_credential_requests
  FOR ALL USING (contractor_id = auth.uid());

-- ===== 20260520000008_hub_rate_history.sql =====
-- Rate history: tracks every rate change per contractor with effective date
CREATE TABLE IF NOT EXISTS hub_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES hub_users(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  payment_type text NOT NULL CHECK (payment_type IN ('hourly', 'fixed')),
  hourly_rate numeric,
  monthly_rate numeric,
  currency text NOT NULL DEFAULT 'PHP',
  note text,
  created_by uuid REFERENCES hub_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hub_rate_history ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view rate history
CREATE POLICY "Authenticated can view rate history"
  ON hub_rate_history FOR SELECT TO authenticated USING (true);

-- Only admin/owner can insert/update/delete
CREATE POLICY "Admins can manage rate history"
  ON hub_rate_history FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner'))
  );

-- Index for fast lookup by contractor + date
CREATE INDEX IF NOT EXISTS hub_rate_history_contractor_date
  ON hub_rate_history(contractor_id, effective_date);

-- ===== 20260520000009_hub_payroll_batches.sql =====
-- Payroll batches: fund transfer requests from HR to owner
CREATE TABLE IF NOT EXISTS hub_payroll_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  contractor_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_owner' CHECK (status IN ('pending_owner', 'owner_approved')),
  requested_by uuid REFERENCES hub_users(id),
  approved_by uuid REFERENCES hub_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  note text
);

ALTER TABLE hub_payroll_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view batches"
  ON hub_payroll_batches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage batches"
  ON hub_payroll_batches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner')));

-- Add batch_id to hub_payouts + ensure status covers full workflow
ALTER TABLE hub_payouts
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES hub_payroll_batches(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Broaden status check to include all workflow states
ALTER TABLE hub_payouts DROP CONSTRAINT IF EXISTS hub_payouts_status_check;
ALTER TABLE hub_payouts ADD CONSTRAINT hub_payouts_status_check
  CHECK (status IN ('pending', 'submitted', 'hr_approved', 'paid'));

-- Allow contractors to insert/update their own payout (for submit)
CREATE POLICY "Contractors can submit own payout"
  ON hub_payouts FOR INSERT TO authenticated
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractors can update own pending payout"
  ON hub_payouts FOR UPDATE TO authenticated
  USING (contractor_id = auth.uid() AND status = 'pending')
  WITH CHECK (contractor_id = auth.uid());

-- ===== 20260520000011_payout_adjustments.sql =====
-- Add adjustments column to hub_payouts for bonus/reimbursement line items
ALTER TABLE hub_payouts
  ADD COLUMN IF NOT EXISTS adjustments JSONB DEFAULT '[]';

-- ===== 20260521000002_hub_payslip_disputes.sql =====
create table if not exists public.hub_payslip_disputes (
  id uuid primary key default gen_random_uuid(),
  payout_id bigint references public.hub_payouts(id) on delete cascade,
  contractor_id uuid references public.hub_users(id) on delete cascade,
  reason text not null,
  status text not null default 'open', -- open, resolved
  admin_notes text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

alter table public.hub_payslip_disputes enable row level security;

create policy "Contractors can view own disputes" on public.hub_payslip_disputes for select using (contractor_id = auth.uid());
create policy "Contractors can insert own disputes" on public.hub_payslip_disputes for insert with check (contractor_id = auth.uid());
create policy "Admins can manage all disputes" on public.hub_payslip_disputes for all using (exists (select 1 from public.hub_users where id = auth.uid() and role in ('admin', 'owner')));

-- ===== 20260521000003_hub_overtime_requests.sql =====
create table if not exists public.hub_overtime_requests (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references public.hub_users(id) on delete cascade,
  date date not null,
  hours numeric(5,2) not null,
  reason text,
  status text not null default 'pending', -- pending, approved, rejected
  reviewed_by uuid references public.hub_users(id),
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.hub_overtime_requests enable row level security;

create policy "Contractors can view own ot requests"
  on public.hub_overtime_requests for select
  using (contractor_id = auth.uid());

create policy "Contractors can insert own ot requests"
  on public.hub_overtime_requests for insert
  with check (contractor_id = auth.uid());

create policy "Admins can manage all ot requests"
  on public.hub_overtime_requests for all
  using (exists (
    select 1 from public.hub_users where id = auth.uid() and role in ('admin', 'owner')
  ));

-- ===== 20260521000004_hub_onboarding.sql =====
alter table public.hub_users
  add column if not exists onboarding_completed boolean default false;

-- Existing active users are already onboarded
update public.hub_users
  set onboarding_completed = true
  where status = 'active';

-- ===== 20260521000005_hub_sign_documents.sql =====
create table if not exists public.hub_sign_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_url text not null,
  file_name text not null,
  uploaded_by uuid references public.hub_users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.hub_sign_assignments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.hub_sign_documents(id) on delete cascade,
  contractor_id uuid not null references public.hub_users(id) on delete cascade,
  status text not null default 'pending', -- pending, signed
  signed_at timestamptz,
  signed_name text,
  created_at timestamptz default now(),
  unique(document_id, contractor_id)
);

alter table public.hub_sign_documents enable row level security;
alter table public.hub_sign_assignments enable row level security;

-- Admins/owners can do everything
create policy "Admins manage sign documents"
  on public.hub_sign_documents for all
  using (exists (
    select 1 from public.hub_users where id = auth.uid() and role in ('admin', 'owner')
  ));

-- Contractors can view documents assigned to them
create policy "Contractors view assigned documents"
  on public.hub_sign_documents for select
  using (exists (
    select 1 from public.hub_sign_assignments
    where document_id = hub_sign_documents.id and contractor_id = auth.uid()
  ));

-- Admins manage all assignments
create policy "Admins manage sign assignments"
  on public.hub_sign_assignments for all
  using (exists (
    select 1 from public.hub_users where id = auth.uid() and role in ('admin', 'owner')
  ));

-- Contractors view and update own assignments
create policy "Contractors view own assignments"
  on public.hub_sign_assignments for select
  using (contractor_id = auth.uid());

create policy "Contractors sign own assignments"
  on public.hub_sign_assignments for update
  using (contractor_id = auth.uid())
  with check (contractor_id = auth.uid());

-- ===== 20260521000006_hub_sign_documents_content.sql =====
alter table public.hub_sign_documents add column if not exists content text;
alter table public.hub_sign_documents add column if not exists is_generated boolean default false;

-- ===== 20260521000007_hub_sign_documents_meta.sql =====
alter table public.hub_sign_documents add column if not exists amendment_type text default 'initial';
-- initial, rate_amendment, scope_change, renewal, other
alter table public.hub_sign_documents add column if not exists rate_snapshot numeric;

-- ===== 20260522000001_hub_schedules.sql =====
alter table public.hub_users
  add column if not exists shift_start time,
  add column if not exists shift_end time,
  add column if not exists work_days text[] default '{}';

-- ===== 20260523000001_hub_payroll_cache.sql =====
CREATE TABLE IF NOT EXISTS hub_payroll_cache (
  period_start date PRIMARY KEY,
  computed_total numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hub_payroll_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view payroll cache"
  ON hub_payroll_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage payroll cache"
  ON hub_payroll_cache FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner')));

-- ===== 20260523000002_remind_attendance_cron.sql =====
-- Schedule attendance reminders every 15 minutes via pg_cron + pg_net


-- ===== 20260523000003_hub_users_slack_id.sql =====
-- Add slack_id column to hub_users for direct Slack user ID storage
alter table hub_users add column if not exists slack_id text;

-- Seed known Slack IDs for active contractors
update hub_users set slack_id = 'U09NUQFTZL6' where email = 'angelalouiseando@gmail.com';
update hub_users set slack_id = 'U083FB0N0PL' where email = 'nellaskatleen@gmail.com';
update hub_users set slack_id = 'U091BL9PQ77' where email = 'duterteabigaile@gmail.com';
update hub_users set slack_id = 'U0ADHQPTR25' where email = 'claudettemaytahil@gmail.com';
update hub_users set slack_id = 'U08SRTTLLF9' where email = 'janreesepj@gmail.com';
update hub_users set slack_id = 'U0838LWSY4E' where email = 'ffroble@icloud.com';

-- ===== 20260523000005_anniversary_cron.sql =====
-- Schedule work anniversary check daily at 8 AM PHT (midnight UTC)


-- ===== 20260523000006_hub_audit_log.sql =====
create table if not exists hub_audit_log (
  id bigserial primary key,
  actor_id uuid references hub_users(id) on delete set null,
  actor_name text,
  action text not null,
  entity_type text,
  entity_id text,
  description text,
  metadata jsonb,
  created_at timestamptz default now()
);

alter table hub_audit_log enable row level security;

-- Admins and owners can read all logs
create policy "hub_audit_log_read" on hub_audit_log
  for select using (
    exists (
      select 1 from hub_users
      where id = auth.uid()
      and role in ('admin', 'owner')
    )
  );

-- Any authenticated hub user can insert (so contractor actions also get logged if needed)
create policy "hub_audit_log_insert" on hub_audit_log
  for insert with check (auth.uid() is not null);

-- ===== 20260523000008_announcement_scheduled_at.sql =====
alter table hub_announcements add column if not exists scheduled_at timestamptz;

-- ===== 20260523000009_scheduled_announcements_cron.sql =====


-- ===== 20260528000005_sign_assignment_drive.sql =====
alter table hub_sign_assignments
  add column if not exists drive_file_id text;

-- ===== 20260528000110_project_contractor_roles.sql =====
alter table hub_project_contractors
  add column if not exists project_role text;

-- ===== 20260529000001_payroll_reminder_cron.sql =====
-- Fire payroll cutoff reminder daily at 9:00 AM PHT (01:00 UTC)
-- Function checks internally if today is actually a cutoff day


-- ===== 20260529000002_payslip_sent_at.sql =====
alter table hub_payouts add column if not exists payslip_sent_at timestamptz;

-- ===== 20260529000010_project_tasks.sql =====
create table if not exists hub_project_tasks (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assignee_id uuid references hub_users(id) on delete set null,
  due_date date,
  created_by uuid references hub_users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists hub_project_activity (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  actor_id uuid references hub_users(id) on delete set null,
  actor_name text not null,
  description text not null,
  created_at timestamptz default now()
);

alter table hub_project_tasks enable row level security;
alter table hub_project_activity enable row level security;

create policy "Auth users read tasks" on hub_project_tasks for select to authenticated using (true);
create policy "Admins manage tasks" on hub_project_tasks for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));

create policy "Auth users read activity" on hub_project_activity for select to authenticated using (true);
create policy "Admins manage activity" on hub_project_activity for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));

-- ===== 20260529000020_hub_payouts_rls.sql =====
-- Fix missing SELECT policy on hub_payouts
-- Without this, admins can't see submitted payouts and contractors can't read back their own

-- Contractors can read their own payouts
create policy "Contractors can view own payouts"
  on hub_payouts for select to authenticated
  using (contractor_id = auth.uid());

-- Admins and owners can read all payouts
create policy "Admins can view all payouts"
  on hub_payouts for select to authenticated
  using (
    exists (
      select 1 from hub_users
      where id = auth.uid() and role in ('admin', 'owner')
    )
  );

-- Admins and owners can update any payout (approve, mark paid, cancel, etc.)
create policy "Admins can update all payouts"
  on hub_payouts for update to authenticated
  using (
    exists (
      select 1 from hub_users
      where id = auth.uid() and role in ('admin', 'owner')
    )
  );

-- Admins and owners can insert payouts (bulk approve, manual entry)
create policy "Admins can insert payouts"
  on hub_payouts for insert to authenticated
  with check (
    exists (
      select 1 from hub_users
      where id = auth.uid() and role in ('admin', 'owner')
    )
  );

-- Admins and owners can delete payouts (cancel)
create policy "Admins can delete payouts"
  on hub_payouts for delete to authenticated
  using (
    exists (
      select 1 from hub_users
      where id = auth.uid() and role in ('admin', 'owner')
    )
  );

-- ===== 20260529000021_fix_payout_update_policy.sql =====
-- Fix contractor UPDATE policy — old one only allowed updating when status='pending',
-- which blocked submission when a seed row existed with status='paid'.
-- Contractors should be able to submit/update their own unlocked rows.
drop policy if exists "Contractors can update own pending payout" on hub_payouts;

create policy "Contractors can update own payout"
  on hub_payouts for update to authenticated
  using (contractor_id = auth.uid() and coalesce(locked, false) = false)
  with check (contractor_id = auth.uid());

-- Delete incorrectly seeded 'paid' row for the current open period
-- so Angela (and any contractor) can submit fresh for May 16-29
delete from hub_payouts
where cutoff_start = '2026-05-16'
  and status = 'paid'
  and locked = true
  and contractor_id in (
    select id from hub_users where full_name ilike '%angela%'
  );

-- ===== 20260529000022_payouts_overtime_pay.sql =====
alter table hub_payouts add column if not exists overtime_pay numeric default 0;

-- ===== 20260529000023_project_task_start_date.sql =====
alter table hub_project_tasks add column if not exists start_date date;

-- ===== 20260529000030_task_comments.sql =====
create table if not exists hub_project_task_comments (
  id bigserial primary key,
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  user_id uuid not null references hub_users(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

alter table hub_project_task_comments enable row level security;

create policy "Auth users read task comments"
  on hub_project_task_comments for select to authenticated using (true);

create policy "Auth users insert task comments"
  on hub_project_task_comments for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users delete own comments or admins delete any"
  on hub_project_task_comments for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner'))
  );

-- ===== 20260529000031_project_activity_log.sql =====
create table if not exists hub_project_activity (
  id bigserial primary key,
  project_id bigint not null references hub_projects(id) on delete cascade,
  user_id uuid references hub_users(id) on delete set null,
  action text not null, -- 'task_created', 'task_status_changed', 'task_assigned', 'comment_added', 'task_deleted'
  entity_type text not null default 'task',
  entity_id bigint,
  entity_title text,
  meta jsonb,
  created_at timestamptz default now()
);

alter table hub_project_activity enable row level security;

create policy "Auth users read project activity"
  on hub_project_activity for select to authenticated using (true);

create policy "Auth users insert project activity"
  on hub_project_activity for insert to authenticated
  with check (user_id = auth.uid());

-- ===== 20260529000032_project_drive_url.sql =====
alter table hub_projects add column if not exists drive_url text;

-- ===== 20260529000033_project_type.sql =====
alter table hub_projects
  add column if not exists project_type text not null default 'client'
  check (project_type in ('client', 'internal'));

-- ===== 20260529000120_internal_project_type.sql =====
alter table hub_projects
  add column if not exists project_type text not null default 'client'
  check (project_type in ('client', 'internal'));

update hub_projects
set project_type = 'client'
where project_type is null;

-- ===== 20260530000001_task_due_reminder_cron.sql =====
-- Fire task due reminder daily at 9:00 AM PHT (01:00 UTC)
-- Function queries tasks due today or tomorrow and notifies assignees


-- ===== 20260530000002_hub_notifications.sql =====
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

-- ===== 20260530000003_dev_toolbar_hidden.sql =====
alter table hub_users add column if not exists dev_toolbar_hidden boolean default false;

-- ===== 20260530000004_payroll_close_period.sql =====
-- Add closed state to payroll batches
alter table hub_payroll_batches
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references hub_users(id) on delete set null;

-- Allow 'closed' as a valid status
alter table hub_payroll_batches
  drop constraint if exists hub_payroll_batches_status_check;

alter table hub_payroll_batches
  add constraint hub_payroll_batches_status_check
  check (status in ('pending_owner', 'owner_approved', 'closed'));

-- ===== 20260530000005_sops_full_update.sql =====
-- Full SOP update — updates existing + adds all new ones
-- Uses title as the unique key for upserts

-- Update existing SOPs
update hub_sops set
  content = 'All team members must log attendance daily through the Sentro Hub Slack channel.

HOW TO CLOCK IN:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. The Huna Bot will record your clock-in time.

HOW TO CLOCK OUT:
• Hourly contractors: reply to your "on" message in the thread with just the number of hours worked (e.g. "5" or "7.5"). Do NOT type "off" — your hours will not be recorded correctly.
• Fixed-rate contractors: type "off" in the channel when your shift ends.

IMPORTANT NOTES:
• Clock in no later than 9:15 AM on scheduled workdays.
• If you forget to log in, message your admin or HR immediately with the reason.
• Inaccurate attendance affects your payslip calculation.
• Do not log for days you did not actually work.',
  updated_at = now()
where title = 'Daily Time-In / Time-Out Process';

update hub_sops set
  content = 'Your payslip is submitted at the end of each cutoff period. There are two cutoff periods per month:
• 1st – 15th of the month
• 16th – last working day of the month

HOW TO SUBMIT:
1. Go to Hub → My Payouts.
2. Select the correct pay period.
3. Review your hours, overtime, and total payout.
4. Click "Submit for Payment" on or before the cutoff day.
5. You will receive a confirmation once HR processes your payslip.

RULES:
• Only submit if you have actual hours for the period.
• Make sure all your Slack attendance is logged before submitting.
• Once submitted, your payslip is locked. Use the Dispute feature if you find an error.
• Late submissions may be moved to the next period.

PAYMENT TIMELINE:
• HR reviews and approves within 1–2 business days after cutoff.
• Owner approves the fund transfer.
• Payment is sent within 1–2 business days after owner approval.',
  updated_at = now()
where title = 'How to Submit a Payslip';

update hub_sops set
  content = 'Time-off requests must be submitted through the Sentro Hub.

HOW TO REQUEST:
1. Go to Hub → Time Off.
2. Click "New Request".
3. Select leave type: Paid Time Off, Sick Leave, Emergency, or Unpaid.
4. Choose your start and end dates.
5. Add a reason or notes.
6. Submit — HR and the owner will review.

LEAD TIME REQUIREMENTS:
• Planned leaves (PTO, vacation): submit at least 3 business days in advance.
• Sick leave: can be submitted on the same day. A medical certificate may be required for absences of 2+ consecutive days.
• Emergency leave: notify your admin via Slack first, then submit in the Hub.

APPROVAL:
• You will receive a Slack notification when your request is approved or declined.
• Approved time off is automatically reflected in your attendance.
• Denied requests will include a note — reach out to HR to discuss.',
  updated_at = now()
where title = 'Requesting Time Off';

update hub_sops set
  content = 'All client-facing communication must be professional, clear, and timely.

RESPONSE TIME:
• Respond to client messages within 4 hours during business hours (9 AM – 6 PM PHT, Mon–Fri).
• If you cannot respond in time, notify your project manager immediately.

EMAIL STANDARDS:
• Always CC your Project Manager (PM) on all client emails.
• Use a professional tone. Avoid slang, emojis, or overly casual language in written communication.
• Keep subject lines clear: [Project Name] — [Topic].

MESSAGING PLATFORMS:
• Only use client-approved channels (email, Slack, or designated tools).
• Do not share pricing, contract terms, or sensitive information without PM approval.
• Never promise deadlines or deliverables without confirming with the team first.

FEEDBACK & REVISIONS:
• Acknowledge receipt of feedback promptly.
• Clarify ambiguous feedback before starting revisions.
• Document all feedback in the project workspace for team visibility.',
  updated_at = now()
where title = 'Client Communication Standards';

update hub_sops set
  content = 'Consistent file naming keeps our Drive organized and makes handoffs smooth.

STANDARD FORMAT:
[ProjectCode]_[Deliverable]_[Version]_[YYYYMMDD]

EXAMPLE:
PCR001_BrandGuide_v3_20260530.pdf

PROJECT CODES:
• Use 3-letter client abbreviation + 3-digit number (e.g., PCR001 = Peak Coffee Roasters 001)
• Find the project code in the project workspace

VERSIONING:
• v1, v2, v3 — for major revisions shared with clients
• v1a, v1b — for internal iterations before sharing

FILE STORAGE:
• All project files go in the designated Google Drive folder linked in the project workspace.
• Follow the folder structure: /Client Name/Project Name/[Phase or Deliverable]
• Do not save final deliverables on personal drives or desktop.
• Archive old versions in a /Archive subfolder — do not delete them.',
  updated_at = now()
where title = 'File Naming Conventions';

-- Insert new SOPs (skip if title already exists)
insert into hub_sops (title, category, content, published, created_at) values

('How to Log Overtime', 'HR',
'Overtime must be pre-approved or submitted promptly after the fact.

WHEN OVERTIME APPLIES:
• Any hours worked beyond your standard shift on a scheduled workday.
• Work done on weekends or rest days (with prior approval).

HOW TO SUBMIT:
1. Go to Hub → Overtime.
2. Click "Log Overtime".
3. Enter the date, number of hours, and a brief description of the work done.
4. Submit — HR will review and approve.

APPROVAL PROCESS:
• HR approves or declines within 1–2 business days.
• Approved overtime is added to your next payslip automatically.
• You will receive a Slack notification with the decision.

NOTES:
• Do not log overtime retroactively more than 3 days after the work was done without a valid reason.
• Recurring overtime without prior notice may not be approved.
• If you expect a project to require overtime, inform your PM before it happens.',
true, now()),

('How to Dispute a Payslip', 'Payroll',
'If you believe your payslip is incorrect, you can file a dispute before it is finalized.

WHEN TO DISPUTE:
• Your hours are incorrect (more or fewer than you actually worked).
• Overtime was not included or is wrong.
• Deductions or adjustments are unexplained.

HOW TO DISPUTE:
1. Go to Hub → My Payouts.
2. Select the affected pay period.
3. Click "Dispute" on the submitted payslip.
4. Write a clear, specific reason (e.g., "My May 27 hours show 6.11h but I only logged 5h").
5. Submit — HR will review within 2 business days.

WHAT HAPPENS NEXT:
• HR reviews your attendance records and the dispute.
• You will receive a Slack notification with the resolution.
• If approved, your payslip will be corrected before payment is sent.

TIPS:
• Be specific about which days or amounts are incorrect.
• Check your Slack attendance logs before disputing — they are the source of truth.
• Disputes must be filed before the payslip is marked "Paid".',
true, now()),

('How to Use the Project Workspace', 'Projects',
'The Project Workspace is your central hub for everything related to a specific project.

ACCESSING THE WORKSPACE:
1. Go to Hub → My Projects.
2. Click on a project tile to open it.
3. Click "Open Workspace" to enter the full workspace.

WHAT YOU CAN DO IN THE WORKSPACE:

Tasks:
• Add tasks using the "+ Add Task" button.
• Click a task to view details, leave comments, or update the status.
• Cycle a task status by clicking the circle icon: To Do → In Progress → Done.
• Assign tasks to team members.
• Set start and due dates — tasks appear on the timeline calendar.

Timeline / Calendar:
• The calendar shows all tasks with due dates.
• Click a day to see tasks due on that date.
• Tasks with a date range appear as bars across multiple days.

Comments & Collaboration:
• Click any task to open the task detail panel.
• Leave comments at the bottom of the panel.
• @mention a teammate to notify them via Slack DM.

Files (Google Drive):
• If your admin has linked a Drive folder, it appears in the project header.
• Click "Open Drive" to access the full folder.

Search:
• Use the Search bar in the header to find sections (Timeline, Tasks, Payout, etc.).
• Searching a section name focuses the workspace on that section only.',
true, now()),

('@Mentions in Task Comments', 'Projects',
'You can tag teammates in comments to notify them directly.

HOW TO MENTION:
1. Open a task in the workspace.
2. In the comment box, type @ followed by a teammate''s first name.
3. A dropdown will appear — click their name to insert the mention.
4. Send the comment.

WHAT HAPPENS:
• The mentioned person receives a Slack DM from the Huna Bot with your comment.
• They also receive an in-app notification in the bell icon.
• The mention appears highlighted in blue in the comment thread.

BEST PRACTICES:
• Use @mentions when you need a specific person to take action.
• Keep your message clear — include what you need and by when.
• Do not spam @mentions for non-urgent updates.
• Check your notification bell regularly for mentions directed at you.',
true, now()),

('Payroll Period & Payment Schedule', 'Payroll',
'Understanding how payroll periods and payments work at Huna Creatives.

PAY PERIODS:
• Period 1: 1st – 15th of the month
• Period 2: 16th – last working day of the month (Friday before end of month if month ends on weekend)

CUTOFF DATES:
• The cutoff is the last day of each period.
• You must submit your payslip by end of shift on the cutoff day.
• The Huna Bot will send a Slack reminder on cutoff days.

PAYMENT TIMELINE:
1. You submit your payslip by cutoff.
2. HR reviews and approves (1–2 business days).
3. Owner approves the fund transfer batch.
4. Payment is sent to your account (1–2 business days after owner approval).

RATES:
• Hourly contractors: paid based on logged hours × hourly rate.
• Fixed-rate contractors: paid a flat amount per period (monthly rate ÷ 2).
• Overtime is added on top, using your derived hourly rate.

ADJUSTMENTS:
• Bonuses, incentives, deductions, or advances may appear in your payslip as adjustments.
• If you see an unexpected adjustment, contact HR or file a dispute.',
true, now()),

('Installing Sentro Hub on Your Phone', 'Onboarding',
'Sentro Hub is a Progressive Web App (PWA) — you can install it on your phone or desktop like a native app. No App Store needed.

ON iPHONE (iOS 16.4+):
1. Open Safari and go to www.hunacreatives.com/hub/login.
2. Log in to your account.
3. Tap the Share button (box with an arrow pointing up).
4. Scroll down and tap "Add to Home Screen".
5. Tap "Add" in the top right.
6. The app now appears on your home screen.

ON ANDROID (Chrome):
1. Open Chrome and go to www.hunacreatives.com/hub/login.
2. Tap the three-dot menu (⋮) in the top right.
3. Tap "Add to Home Screen" or "Install App".
4. Tap "Install".
5. The app appears on your home screen like a native app.

ON MAC OR WINDOWS (Chrome):
1. Open Chrome and go to www.hunacreatives.com/hub/login.
2. Look for an install icon in the address bar (a small monitor with a down arrow).
3. Click it and select "Install".
4. The app opens in its own window and appears in your dock or taskbar.

NOTE:
• The app opens directly to the hub — no browser chrome, no URL bar.
• You will need to log in once after installing.
• Notifications from the hub work when the app is installed.',
true, now()),

('Requesting Documents or Credentials', 'Operations',
'Use the Requests feature in the Hub to ask for documents, tools, or access you need for your work.

HOW TO SUBMIT A REQUEST:
1. Go to Hub → and look for the Requests section (or contact HR via Slack if the form is unavailable).
2. Select the request type:
   • Document Request — contracts, certificates, reference letters
   • Credential Access — login credentials for client tools, platforms, or internal systems
3. Describe what you need clearly and why.
4. Submit — HR and admin are notified automatically.

RESPONSE TIME:
• HR aims to respond within 1–2 business days.
• Urgent requests: message HR directly on Slack first, then submit in the Hub for documentation.

CREDENTIAL HANDLING:
• Never share credentials with people outside the team.
• If you receive access to a client platform, use it only for the scope of the project.
• Report any suspicious activity or lost access to your PM immediately.',
true, now()),

('Working Hours and Availability', 'HR',
'Standard working hours and availability expectations for all Huna Creatives team members.

STANDARD HOURS:
• Monday – Friday, 9:00 AM – 6:00 PM PHT (Philippine Time).
• Some roles may have adjusted shifts — refer to your contract for specifics.

ATTENDANCE EXPECTATIONS:
• Be available and responsive during your scheduled shift hours.
• Log in to Slack at the start of your shift.
• Clock in via the #attendance Slack channel by 9:15 AM.
• Notify your PM via Slack if you will be late or need to leave early.

REST DAYS:
• Saturday and Sunday are standard rest days unless your contract specifies otherwise.
• Working on rest days requires prior approval and may qualify for overtime pay.

REMOTE WORK:
• All contractors are fully remote. Maintain a productive, distraction-free work environment during scheduled hours.
• Be reachable via Slack during working hours unless you have approved time off.

RESPONSE TIME:
• Respond to Slack messages from the team within 30 minutes during working hours.
• Longer delays must be communicated proactively.',
true, now()),

('Using Google Drive for Project Files', 'Projects',
'All project files are stored in the Huna Creatives Google Drive folder, organized by client and project.

FOLDER STRUCTURE:
Huna Creatives > Client Folders > [Local or International] > [Client Name] > [Project Name]

• Philippine clients go under "Local"
• International clients go under "International"

ACCESSING PROJECT FILES:
• The Google Drive folder linked to your project appears in the project workspace header.
• Click "Open Drive" to open the full folder in your browser.
• You can also browse files directly in the workspace if your admin has linked the folder.

UPLOADING FILES:
• Upload deliverables to the correct project folder.
• Follow the file naming convention: [ProjectCode]_[Deliverable]_[Version]_[YYYYMMDD]
• Do not upload files to the root "Client Folders" level — always go into the specific project subfolder.

SHARING:
• Share files from Google Drive using the "Share" button with view or comment access.
• Do not share entire client folders externally — only share specific files as needed.
• Always check with your PM before sharing anything with a client directly.

PERMISSIONS:
• You will be granted access to the Drive folders relevant to your projects.
• If you need access to a folder you cannot see, submit a Credential/Document Request in the Hub.',
true, now()),

('Getting Started with Sentro Hub', 'Onboarding',
'Welcome to Sentro Hub — your workspace for projects, attendance, payroll, and team communication at Huna Creatives.

STEP 1 — LOG IN:
• Go to www.hunacreatives.com/hub/login using the email and password from your invite.
• If you have not received an invite, contact HR.

STEP 2 — INSTALL ON YOUR PHONE (recommended):
• Add the Hub to your home screen as an app. See the "Installing Sentro Hub on Your Phone" SOP for instructions.

STEP 3 — SET UP SLACK:
• Join the Huna Creatives Slack workspace if you have not already.
• You will use Slack for daily attendance, overtime logging, and team communication.
• Make sure your Slack name matches your full name in the Hub.

STEP 4 — REVIEW YOUR PROFILE:
• Check that your name, department, and contract details are correct.
• Contact HR if anything looks wrong.

STEP 5 — UNDERSTAND YOUR PAY PERIOD:
• Read the "Payroll Period & Payment Schedule" SOP.
• Know when your next cutoff date is.

KEY SECTIONS IN THE HUB:
• Dashboard — your overview, active projects, and recent updates
• My Projects — all projects you are assigned to, with tasks and files
• My Payouts — your payslips, submission, and payment history
• Time Off — submit and track leave requests
• Overtime — log and track overtime hours
• Documents — contracts and documents to sign

NEED HELP?
• Message HR or your PM on Slack.
• Check the SOPs section in the Hub for step-by-step guides.',
true, now()),

('Slack Attendance — Hourly Contractors', 'Attendance',
'This SOP applies specifically to hourly-rate contractors. Your pay is based on the hours you log, so accuracy is critical.

HOW TO LOG HOURS:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. When you finish, reply IN THE THREAD of your "on" message with just the number of hours worked.
   • Example: You worked 7.5 hours → reply "7.5" in the thread.
   • Do NOT type "off" as a separate message — your hours will not be captured.

WHY THIS MATTERS:
• The Huna Bot reads your thread reply to record your hours for that day.
• If you type "off" separately or reply in the wrong thread, the system cannot match it to your clock-in, and your hours may show as 0 or incorrect.

COMMON MISTAKES TO AVOID:
• ❌ Typing "off" in the main channel instead of replying in the thread
• ❌ Replying to a different day''s "on" message
• ❌ Typing "8 hours" instead of just "8"
• ❌ Forgetting to reply — your hours will not be logged

IF YOU MADE A MISTAKE:
• Contact HR immediately with the correct hours and the date.
• HR can manually correct your attendance record.',
true, now()),

('Slack Attendance — Fixed-Rate Contractors', 'Attendance',
'This SOP applies to fixed-rate (monthly salary) contractors. Your pay is not based on hours, but attendance is still tracked for monitoring and compliance.

HOW TO LOG ATTENDANCE:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. Type "off" when your shift ends.

THAT''S IT — no need to reply with hours in the thread. The system records your start and end times, and calculates your total hours for the day.

WHY IT STILL MATTERS:
• Attendance records confirm you are active and available during working hours.
• Consistent no-shows or unexplained absences may affect your contract status.
• Overtime (hours beyond your standard shift) is still tracked separately.

OVERTIME:
• If you work beyond your standard hours on a given day, submit an overtime request in the Hub → Overtime section separately.
• Attendance logging alone does not automatically count as overtime.

IF YOU FORGET:
• Contact HR the same day with your actual start and end times.
• Do not leave days blank without communicating.',
true, now())

on conflict (title) do nothing;

-- ===== 20260601000001_task_detail_upgrade.sql =====
-- ── Task status: add in_review and blocked ───────────────────────────────────
alter table hub_project_tasks drop constraint if exists hub_project_tasks_status_check;
alter table hub_project_tasks add constraint hub_project_tasks_status_check
  check (status in ('todo', 'in_progress', 'in_review', 'blocked', 'done'));

-- ── Add start_date and checklist to tasks ─────────────────────────────────────
alter table hub_project_tasks add column if not exists start_date date;
alter table hub_project_tasks add column if not exists checklist jsonb default '[]'::jsonb;

-- ── Task attachments ──────────────────────────────────────────────────────────
create table if not exists hub_project_task_attachments (
  id bigserial primary key,
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  uploaded_by uuid references hub_users(id) on delete set null,
  name text not null,
  url text not null,
  size bigint,
  mime_type text,
  created_at timestamptz default now()
);

alter table hub_project_task_attachments enable row level security;

create policy "read task attachments"
  on hub_project_task_attachments for select to authenticated using (true);

create policy "upload task attachments"
  on hub_project_task_attachments for insert to authenticated with check (true);

create policy "delete task attachments"
  on hub_project_task_attachments for delete to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner'))
  );

-- ── Task watchers ─────────────────────────────────────────────────────────────
create table if not exists hub_project_task_watchers (
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  user_id uuid not null references hub_users(id) on delete cascade,
  primary key (task_id, user_id)
);

alter table hub_project_task_watchers enable row level security;

create policy "manage task watchers"
  on hub_project_task_watchers for all to authenticated using (true) with check (true);

-- ── Per-task activity log ─────────────────────────────────────────────────────
create table if not exists hub_project_task_activity (
  id bigserial primary key,
  task_id bigint not null references hub_project_tasks(id) on delete cascade,
  actor_id uuid references hub_users(id) on delete set null,
  actor_name text not null,
  type text not null,
  description text not null,
  created_at timestamptz default now()
);

alter table hub_project_task_activity enable row level security;

create policy "read task activity"
  on hub_project_task_activity for select to authenticated using (true);

create policy "log task activity"
  on hub_project_task_activity for insert to authenticated with check (true);

-- ── Storage bucket for task attachments ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 26214400, null)
on conflict (id) do nothing;

create policy "upload task attachment files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'task-attachments');

create policy "read task attachment files"
  on storage.objects for select to authenticated
  using (bucket_id = 'task-attachments');

create policy "delete task attachment files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'task-attachments');

-- ===== 20260601000002_sops_update.sql =====
-- SOP update — reflects task detail panel, push notifications, Drive for task attachments

-- 1. Project Workspace — updated for task detail panel, new statuses, checklist, attachments, watchers
update hub_sops set
  content = 'The Project Workspace is your central hub for everything related to a specific project.

ACCESSING THE WORKSPACE:
1. Go to Hub → My Projects.
2. Click on a project tile to open it.
3. Click "Open Workspace" to enter the full workspace.

TASK LIST:
• Tasks are grouped by status: Overdue, In Progress, To Do, Done.
• Click the status icon on a task card to quickly cycle its status.
• Click anywhere else on a task card to open the full Task Detail Panel.

TASK STATUSES:
• To Do — not started yet
• In Progress — actively being worked on
• In Review — work is done, waiting for feedback or approval
• Blocked — cannot proceed due to a dependency or issue
• Done — completed

TASK DETAIL PANEL:
When you click a task, a panel slides in from the right showing:
• Title, status, priority, assignee, start date, due date
• Watchers — toggle team members who should be notified when this task changes
• Description — full notes or context for the task
• Checklist — break the task into smaller steps; each item can be checked off
• Attachments — upload files or images directly to the task (stored in Google Drive)
• Comments — leave updates or questions; @mention a teammate to notify them
• Activity log — automatic record of every status change, assignment, and comment

ADDING A TASK:
1. Click "+ Add Task" in the task section header.
2. Fill in the title, status, priority, assignee, and dates in the panel.
3. Click "Create Task".

EDITING A TASK:
1. Click the task card to open the detail panel.
2. Click the edit (pencil) icon in the panel header.
3. Make your changes and click "Save Changes".

CHECKLIST:
• In the task panel, type an item in the checklist field and press Enter or click "Add".
• Click the circle icon next to an item to mark it done.
• A progress bar tracks completion percentage.

ATTACHMENTS:
• Click "Upload" in the Attachments section of the task panel.
• Files are automatically saved to Google Drive under Task Attachments / [Project Name].
• Click a file name to open it directly in Google Drive.

WATCHERS:
• In the task panel, click team member names in the Watchers section to toggle them on or off.
• Watchers receive push notifications and Slack messages when the task is updated.

TIMELINE / CALENDAR:
• The calendar shows all tasks with due dates.
• Click a day to see tasks due on that date.
• Tasks with a date range appear as bars across multiple days.

COMMENTS & @MENTIONS:
• Leave comments at the bottom of the task panel.
• Type @ followed by a teammate''s first name to mention them.
• They will receive a push notification and a Slack DM.

SEARCH:
• Use the Search bar in the workspace header to find sections (Timeline, Tasks, etc.).
• Searching a section name focuses the workspace on that section only.',
  updated_at = now()
where title = 'How to Use the Project Workspace';


-- 2. @Mentions — add push notification alongside Slack
update hub_sops set
  content = 'You can tag teammates in comments to notify them directly.

HOW TO MENTION:
1. Open a task by clicking on it in the workspace.
2. In the comment box at the bottom of the task panel, type @ followed by a teammate''s first name.
3. A dropdown will appear — click their name to insert the mention.
4. Press Enter or click the send button.

WHAT HAPPENS:
• The mentioned person receives a push notification on their phone (if they have the Hub installed and notifications enabled).
• They also receive a Slack DM from the Huna Bot with your comment.
• The mention appears highlighted in orange in the comment thread.
• An in-app notification also appears in the bell icon.

BEST PRACTICES:
• Use @mentions when you need a specific person to take action or respond.
• Keep your message clear — include what you need and by when.
• Do not spam @mentions for non-urgent updates.
• Check your notification bell regularly for mentions directed at you.',
  updated_at = now()
where title = '@Mentions in Task Comments';


-- 3. Installing Sentro Hub — add push notification step
update hub_sops set
  content = 'Sentro Hub is a Progressive Web App (PWA) — you can install it on your phone or desktop like a native app. No App Store needed.

ON iPHONE (iOS 16.4+):
1. Open Safari and go to www.hunacreatives.com/hub/login.
2. Log in to your account.
3. Tap the Share button (box with an arrow pointing up).
4. Scroll down and tap "Add to Home Screen".
5. Tap "Add" in the top right.
6. The app now appears on your home screen.

ON ANDROID (Chrome):
1. Open Chrome and go to www.hunacreatives.com/hub/login.
2. Tap the three-dot menu (⋮) in the top right.
3. Tap "Add to Home Screen" or "Install App".
4. Tap "Install".
5. The app appears on your home screen like a native app.

ON MAC OR WINDOWS (Chrome):
1. Open Chrome and go to www.hunacreatives.com/hub/login.
2. Look for an install icon in the address bar (a small monitor with a down arrow).
3. Click it and select "Install".
4. The app opens in its own window and appears in your dock or taskbar.

ENABLING PUSH NOTIFICATIONS:
• After installing and logging in, the Hub will ask for permission to send notifications.
• Tap "Allow" when prompted.
• Once allowed, you will receive real-time push notifications for:
  - Payslip approvals and disputes
  - Task assignments and due date reminders
  - Time-off decisions
  - @mentions in task comments
  - Payroll updates
• If you missed the prompt, go to your phone Settings → Safari / Chrome → Notifications and enable them for hunacreatives.com.

NOTES:
• The app opens directly to the Hub — no browser chrome, no URL bar.
• You will need to log in once after installing.
• iOS requires version 16.4 or later for push notifications to work.',
  updated_at = now()
where title = 'Installing Sentro Hub on Your Phone';


-- 4. Google Drive SOP — add task attachments section
update hub_sops set
  content = 'All project files are stored in the Huna Creatives Google Drive folder, organized by client and project.

FOLDER STRUCTURE:
Sentro OS Drive > [Section] > [Subfolder]

Examples:
• Sentro OS Drive > Task Attachments > [Project Name] > [file]
• Sentro OS Drive > Payroll 2026 > Receipts > [file]
• Sentro OS Drive > Clients Active > [file]

ACCESSING PROJECT FILES:
• The Google Drive folder linked to your project appears in the project workspace header.
• Click "Open Drive" to open the full folder in your browser.

TASK ATTACHMENTS:
• When you upload a file to a task in the Project Workspace, it is automatically saved to Google Drive.
• Files go to: Sentro OS Drive > Task Attachments > [Project Name] > [file]
• You do not need to manually upload to Drive — the Hub does it for you.
• Click the file name in the task panel to open it directly in Google Drive.

UPLOADING PROJECT DELIVERABLES:
• Upload deliverables directly to the relevant Google Drive project folder.
• Follow the file naming convention: [ProjectCode]_[Deliverable]_[Version]_[YYYYMMDD]
• Do not upload files to the root level — always go into the specific project subfolder.

SHARING:
• Share files from Google Drive using the "Share" button with view or comment access.
• Do not share entire client folders externally — only share specific files as needed.
• Always check with your PM before sharing anything with a client directly.

PERMISSIONS:
• You will be granted access to the Drive folders relevant to your projects.
• If you need access to a folder you cannot see, submit a Credential/Document Request in the Hub.',
  updated_at = now()
where title = 'Using Google Drive for Project Files';


-- 5. Getting Started — update Step 2 to mention notifications
update hub_sops set
  content = 'Welcome to Sentro Hub — your workspace for projects, attendance, payroll, and team communication at Huna Creatives.

STEP 1 — LOG IN:
• Go to www.hunacreatives.com/hub/login using the email and password from your invite.
• If you have not received an invite, contact HR.

STEP 2 — INSTALL ON YOUR PHONE (recommended):
• Add the Hub to your home screen as an app. See the "Installing Sentro Hub on Your Phone" SOP for instructions.
• When prompted, tap "Allow" for push notifications — this is how you get real-time alerts for tasks, payslips, and approvals.

STEP 3 — SET UP SLACK:
• Join the Huna Creatives Slack workspace if you have not already.
• You will use Slack for daily attendance, overtime logging, and team communication.
• Make sure your Slack name matches your full name in the Hub.

STEP 4 — REVIEW YOUR PROFILE:
• Check that your name, department, and contract details are correct.
• Contact HR if anything looks wrong.

STEP 5 — UNDERSTAND YOUR PAY PERIOD:
• Read the "Payroll Period & Payment Schedule" SOP.
• Know when your next cutoff date is.

KEY SECTIONS IN THE HUB:
• Dashboard — your overview, active projects, and recent updates
• My Projects — all projects you are assigned to, with tasks, files, and comments
• My Payouts — your payslips, submission, and payment history
• Time Off — submit and track leave requests
• Overtime — log and track overtime hours
• Documents — contracts and documents to sign

NEED HELP?
• Message HR or your PM on Slack.
• Check the SOPs section in the Hub for step-by-step guides.',
  updated_at = now()
where title = 'Getting Started with Sentro Hub';

-- ===== 20260601000004_project_type_retainer.sql =====
-- Ensure project_type allows 'retainer'
alter table hub_projects drop constraint if exists hub_projects_project_type_check;
alter table hub_projects add constraint hub_projects_project_type_check
  check (project_type in ('client', 'internal', 'retainer'));

-- Add monthly_rate_currency for USD retainer clients
alter table hub_projects add column if not exists monthly_rate_currency text not null default 'PHP';

