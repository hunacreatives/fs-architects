-- C-01: The "Users can view all hub users" policy used USING (true), so any
-- authenticated contractor could SELECT every column of every user — including
-- salary (hourly_rate, monthly_rate, project_percentage) and full bank details.
-- RLS is row-level only and cannot hide columns, so we remove direct read access
-- to the sensitive financial/banking columns and serve them through an
-- authorization-checked SECURITY DEFINER RPC (own row always; all rows for
-- admin/owner/hr). Non-sensitive directory columns stay broadly readable so the
-- many `hub_users(full_name, avatar_url, …)` embeds keep working unchanged.
--
-- The frontend reads finance through get_user_finance() and merges it in, so it
-- works whether or not this migration has been applied yet (forward-compatible).

revoke select on hub_users from authenticated;
revoke select on hub_users from anon;

grant select (
  id, full_name, email, role, avatar_url, phone, birthday, address,
  emergency_contact, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
  slack_username, slack_id, department, start_date, status, onboarding_completed,
  is_developer, shift_start, shift_end, work_days, annual_pto_days, annual_sick_days,
  contract_expiry_date, dev_toolbar_hidden, currency, payment_type, created_at, updated_at
) on hub_users to authenticated;

-- Finance for the users the caller is allowed to see. Pass a list of ids, or null
-- for "all I'm allowed to see". Contractors only ever get their own row back.
create or replace function public.get_user_finance(p_ids uuid[] default null)
returns table (
  id uuid,
  payment_type text,
  hourly_rate numeric,
  monthly_rate numeric,
  currency text,
  payment_method text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_account_type text,
  project_percentage numeric,
  notes text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;
  v_admin := exists (select 1 from hub_users where id = v_uid and role in ('admin', 'owner', 'hr'));

  return query
    select u.id, u.payment_type, u.hourly_rate, u.monthly_rate, u.currency,
           u.payment_method, u.bank_name, u.bank_account_name, u.bank_account_number,
           u.bank_account_type, u.project_percentage, u.notes
    from hub_users u
    where (v_admin or u.id = v_uid)
      and (p_ids is null or u.id = any (p_ids));
end;
$$;

revoke all on function public.get_user_finance(uuid[]) from public, anon;
grant execute on function public.get_user_finance(uuid[]) to authenticated;
