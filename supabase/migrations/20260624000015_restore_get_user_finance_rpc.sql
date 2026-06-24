-- Repair for the C-01 finance-column lockdown rollout.
-- The frontend now depends on get_user_finance() for salary and bank fields.
-- If only the revoke/grant step was run, payroll can no longer read monthly_rate
-- and fixed-rate employees fall through to zero. Recreate the RPC idempotently.

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

  v_admin := exists (
    select 1
    from public.hub_users
    where id = v_uid
      and role in ('admin', 'owner', 'hr')
  );

  return query
    select
      u.id,
      u.payment_type,
      u.hourly_rate,
      u.monthly_rate,
      u.currency,
      u.payment_method,
      u.bank_name,
      u.bank_account_name,
      u.bank_account_number,
      u.bank_account_type,
      u.project_percentage,
      u.notes
    from public.hub_users u
    where (v_admin or u.id = v_uid)
      and (p_ids is null or u.id = any (p_ids));
end;
$$;

revoke all on function public.get_user_finance(uuid[]) from public, anon;
grant execute on function public.get_user_finance(uuid[]) to authenticated;
