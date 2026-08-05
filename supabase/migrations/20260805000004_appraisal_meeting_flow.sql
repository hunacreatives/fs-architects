-- Rework the appraisal workflow to match the firm's actual process, which
-- splits what used to be one action ("confirm discussed & send") into two
-- separate employee-facing moments:
--   1. Accept/decline the 1-on-1 meeting invite (no ratings visible yet)
--   2. Confirm the outcome, after the leader marks the meeting held and
--      sends the results (ratings become visible only here)
--
-- New status flow:
--   draft -> meeting_scheduled -> meeting_accepted -> awaiting_employee
--                              \-> meeting_declined -/ (leader reschedules,
--                                                        loops back to
--                                                        meeting_scheduled)
--   awaiting_employee -> awaiting_hr -> completed   (unchanged)
--
-- The existing one_on_one_at / "appraisal sent" email triggers
-- (20260713000006, 20260713000005) don't need any changes — they already
-- fire on exactly the column/status transitions this rework moves earlier
-- (meeting scheduling) and later (results actually shared) respectively,
-- and the meeting-scheduled email was already deliberately ratings-free.

alter table hub_appraisals
  add column if not exists decline_reason text,
  add column if not exists results_sent_at timestamptz;

alter table hub_appraisals drop constraint if exists hub_appraisals_status_check;
alter table hub_appraisals add constraint hub_appraisals_status_check
  check (status in (
    'draft', 'meeting_scheduled', 'meeting_accepted', 'meeting_declined',
    'awaiting_employee', 'awaiting_hr', 'completed'
  ));

-- Employees no longer get any direct row access to hub_appraisals — ratings
-- must stay invisible while a meeting is only scheduled/accepted/declined,
-- and RLS can't hide individual columns per-row. All employee reads now go
-- through get_my_appraisals() below, which nulls the ratings-bearing columns
-- until status reaches awaiting_employee or later. (Mirrors the same
-- data-layer lockdown pattern used for hub_credentials.)
drop policy if exists "employees view own appraisals" on hub_appraisals;

create or replace function public.get_my_appraisals()
returns table (
  id uuid,
  job_title text,
  period_covered text,
  month_appraised text,
  status text,
  one_on_one_at timestamptz,
  decline_reason text,
  results_sent_at timestamptz,
  ratings jsonb,
  total_score numeric,
  final_rating_pct numeric,
  performance_level numeric,
  comments_recommendations text,
  decision text,
  below_satisfactory_action text,
  employee_comments text,
  employee_acknowledged_at timestamptz,
  hr_comments text,
  hr_reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  rater_name text,
  hr_reviewer_name text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  return query
    select
      a.id,
      a.job_title,
      a.period_covered,
      a.month_appraised,
      a.status,
      a.one_on_one_at,
      a.decline_reason,
      a.results_sent_at,
      case when a.status in ('awaiting_employee', 'awaiting_hr', 'completed') then a.ratings else '{}'::jsonb end,
      case when a.status in ('awaiting_employee', 'awaiting_hr', 'completed') then a.total_score else null end,
      case when a.status in ('awaiting_employee', 'awaiting_hr', 'completed') then a.final_rating_pct else null end,
      case when a.status in ('awaiting_employee', 'awaiting_hr', 'completed') then a.performance_level else null end,
      case when a.status in ('awaiting_employee', 'awaiting_hr', 'completed') then a.comments_recommendations else null end,
      case when a.status in ('awaiting_employee', 'awaiting_hr', 'completed') then a.decision else null end,
      case when a.status in ('awaiting_employee', 'awaiting_hr', 'completed') then a.below_satisfactory_action else null end,
      a.employee_comments,
      a.employee_acknowledged_at,
      a.hr_comments,
      a.hr_reviewed_at,
      a.created_at,
      a.updated_at,
      rater.full_name,
      hr_reviewer.full_name
    from hub_appraisals a
    left join hub_users rater on rater.id = a.rater_id
    left join hub_users hr_reviewer on hr_reviewer.id = a.hr_reviewer_id
    where a.employee_id = v_uid and a.status <> 'draft'
    order by a.created_at desc;
end;
$$;

revoke all on function public.get_my_appraisals() from public, anon;
grant execute on function public.get_my_appraisals() to authenticated;

-- Employee accepts the scheduled 1-on-1 — meeting_scheduled -> meeting_accepted.
create or replace function public.accept_appraisal_meeting(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_employee_name text;
begin
  update hub_appraisals
  set status = 'meeting_accepted',
      updated_at = now()
  where id = p_id
    and employee_id = auth.uid()
    and status = 'meeting_scheduled';

  if not found then
    raise exception 'Appraisal not found or not awaiting your response';
  end if;

  select full_name into v_employee_name from hub_users where id = auth.uid();

  insert into hub_notifications (user_id, type, title, body, link, read)
  select u.id, 'appraisal',
         'Employee accepted the 1-on-1',
         coalesce(v_employee_name, 'An employee') || ' accepted the scheduled performance discussion.',
         '/hub/admin/performance', false
  from hub_users u
  where u.role in ('admin', 'owner', 'hr') and u.status = 'active';
end;
$$;

-- Employee declines with a required reason — meeting_scheduled -> meeting_declined.
-- Leader reschedules from here (reschedule_appraisal handled client-side by
-- the owner's existing unrestricted update policy, same as scheduling).
create or replace function public.decline_appraisal_meeting(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_employee_name text;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to decline.';
  end if;

  update hub_appraisals
  set status = 'meeting_declined',
      decline_reason = trim(p_reason),
      updated_at = now()
  where id = p_id
    and employee_id = auth.uid()
    and status = 'meeting_scheduled';

  if not found then
    raise exception 'Appraisal not found or not awaiting your response';
  end if;

  select full_name into v_employee_name from hub_users where id = auth.uid();

  insert into hub_notifications (user_id, type, title, body, link, read)
  select u.id, 'appraisal',
         'Employee declined the 1-on-1',
         coalesce(v_employee_name, 'An employee') || ' declined the scheduled performance discussion and requested a reschedule.',
         '/hub/admin/performance', false
  from hub_users u
  where u.role in ('admin', 'owner', 'hr') and u.status = 'active';
end;
$$;

revoke all on function public.accept_appraisal_meeting(uuid) from public, anon;
revoke all on function public.decline_appraisal_meeting(uuid, text) from public, anon;
grant execute on function public.accept_appraisal_meeting(uuid) to authenticated;
grant execute on function public.decline_appraisal_meeting(uuid, text) to authenticated;
