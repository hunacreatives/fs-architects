-- FS Architects Appraisal Form (Fretz's paper form, rev1) as a staged workflow:
-- rater (immediate head) fills 8 factors × 3 criteria → employee reads,
-- comments, acknowledges → HR reviews and completes. Scores follow the form:
-- total = sum of the 8 factor averages (max 40), final % = total × 2.5,
-- performance level = total / 8 matched to the rubric bands.
-- Supersedes the dev-only hub_performance_reviews quick-review stub.

create table if not exists hub_appraisals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hub_users(id) on delete cascade,
  rater_id uuid references hub_users(id) on delete set null,
  job_title text,
  period_covered text not null,
  month_appraised text not null,
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_employee', 'awaiting_hr', 'completed')),
  -- { factor_key: { levels: [int|null × 3], remarks: text } }
  ratings jsonb not null default '{}'::jsonb,
  total_score numeric,
  final_rating_pct numeric,
  performance_level numeric,
  comments_recommendations text,
  decision text check (decision in ('regularization', 'end_of_contract')),
  below_satisfactory_action text check (below_satisfactory_action in ('monitoring', 'pip')),
  employee_comments text,
  employee_acknowledged_at timestamptz,
  hr_reviewer_id uuid references hub_users(id) on delete set null,
  hr_comments text,
  hr_reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_appraisals enable row level security;

create policy "admins manage appraisals" on hub_appraisals
  for all to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')))
  with check (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')));

-- Employees see their own appraisal only once the rater sends it (never drafts).
create policy "employees view own appraisals" on hub_appraisals
  for select to authenticated
  using (employee_id = auth.uid() and status <> 'draft');

-- Employees can't update the row directly (they'd be able to touch ratings);
-- acknowledgment goes through this function, which only sets their comment,
-- the acknowledgment timestamp, and the status hand-off to HR. It also
-- notifies admins/HR, which employee RLS on hub_notifications wouldn't allow.
create or replace function acknowledge_appraisal(p_id uuid, p_comments text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_name text;
begin
  update hub_appraisals
  set employee_comments = nullif(trim(coalesce(p_comments, '')), ''),
      employee_acknowledged_at = now(),
      status = 'awaiting_hr',
      updated_at = now()
  where id = p_id
    and employee_id = auth.uid()
    and status = 'awaiting_employee';

  if not found then
    raise exception 'Appraisal not found or not awaiting your acknowledgment';
  end if;

  select full_name into v_employee_name from hub_users where id = auth.uid();

  insert into hub_notifications (user_id, type, title, body, link, read)
  select u.id, 'appraisal',
         'Appraisal acknowledged',
         coalesce(v_employee_name, 'An employee') || ' acknowledged their performance appraisal — ready for HR review.',
         '/hub/admin/performance', false
  from hub_users u
  where u.role in ('admin', 'owner', 'hr') and u.status = 'active';
end $$;

grant execute on function acknowledge_appraisal(uuid, text) to authenticated;
