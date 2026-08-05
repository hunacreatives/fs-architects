-- The credentials vault was templated from a marketing agency's multi-client
-- version and inherited a "Client Name" concept that doesn't apply here — FS
-- Architects' hub_credentials rows are the firm's own software subscriptions
-- (CAD/BIM tools, project management, finance, etc.), not per-client accounts.
-- This replaces the client_name grouping with a Category field, and removes
-- the client-assignment auto-access path from get_my_credentials (it could
-- never match anything meaningful here — access is now purely
-- request-and-approve, including admin-initiated grants).
--
-- client_name itself is left in place (still NOT NULL) since dropping/altering
-- it isn't necessary — the app just stops reading/writing anything meaningful
-- into it going forward.

alter table hub_credentials
  add column if not exists category text;

update hub_credentials set category = 'other' where category is null;

drop function if exists public.admin_list_credentials();
drop function if exists public.admin_save_credential(uuid, text, text, text, text, text, text, text, text, text);
drop function if exists public.get_my_credentials();

-- ── Admin: list all credentials with decrypted secrets ──────────────────────
create function public.admin_list_credentials()
returns table (
  id uuid, category text, platform text, account_email text, login_type text,
  otp_contact text, status text, notes text, password text, additional_info text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')) then
    raise exception 'Admin access required.';
  end if;
  return query
    select c.id, coalesce(c.category, 'other'), c.platform, c.account_email, c.login_type, c.otp_contact,
           c.status, c.notes,
           case when c.password_enc is not null then pgp_sym_decrypt(c.password_enc, _cred_key()) end::text,
           case when c.additional_info_enc is not null then pgp_sym_decrypt(c.additional_info_enc, _cred_key()) end::text,
           c.created_at, c.updated_at
    from hub_credentials c
    order by c.platform;
end;
$$;

-- ── Admin: insert/update a credential (encrypts secrets) ────────────────────
create function public.admin_save_credential(
  p_id uuid,
  p_category text,
  p_platform text,
  p_account_email text,
  p_login_type text,
  p_otp_contact text,
  p_status text,
  p_notes text,
  p_password text,
  p_additional_info text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_actor uuid := auth.uid();
begin
  if not exists (select 1 from hub_users where id = v_actor and role in ('admin', 'owner')) then
    raise exception 'Admin access required.';
  end if;

  if p_id is null then
    insert into hub_credentials (
      client_name, category, platform, account_email, login_type, otp_contact, status, notes,
      password_enc, additional_info_enc, created_by
    ) values (
      '', coalesce(p_category, 'other'), p_platform, p_account_email, coalesce(p_login_type, 'email_password'),
      p_otp_contact, coalesce(p_status, 'active'), p_notes,
      case when p_password is not null and p_password <> '' then pgp_sym_encrypt(p_password, _cred_key()) end,
      case when p_additional_info is not null and p_additional_info <> '' then pgp_sym_encrypt(p_additional_info, _cred_key()) end,
      v_actor
    )
    returning id into v_id;
  else
    update hub_credentials set
      category = coalesce(p_category, 'other'),
      platform = p_platform,
      account_email = p_account_email,
      login_type = coalesce(p_login_type, 'email_password'),
      otp_contact = p_otp_contact,
      status = coalesce(p_status, 'active'),
      notes = p_notes,
      password_enc = case when p_password is not null and p_password <> '' then pgp_sym_encrypt(p_password, _cred_key()) end,
      additional_info_enc = case when p_additional_info is not null and p_additional_info <> '' then pgp_sym_encrypt(p_additional_info, _cred_key()) end,
      updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- ── Contractor: catalog + secrets only where an approved request exists ─────
-- (no more client-assignment auto-access — every grant, admin-initiated or
-- employee-requested, goes through hub_credential_requests as 'approved')
create function public.get_my_credentials()
returns table (
  id uuid, category text, platform text, login_type text, status text,
  account_email text, otp_contact text, notes text,
  password text, additional_info text, has_access boolean
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
  with my_approved as (
    select credential_id from hub_credential_requests where contractor_id = v_uid and status = 'approved'
  ),
  scoped as (
    select c.*, (c.id in (select credential_id from my_approved)) as access
    from hub_credentials c
  )
  select s.id, coalesce(s.category, 'other'), s.platform, s.login_type, s.status, s.account_email, s.otp_contact, s.notes,
         case when s.access and s.password_enc is not null then pgp_sym_decrypt(s.password_enc, _cred_key()) end::text,
         case when s.access and s.additional_info_enc is not null then pgp_sym_decrypt(s.additional_info_enc, _cred_key()) end::text,
         s.access
  from scoped s
  order by s.platform;
end;
$$;

revoke all on function public.admin_list_credentials() from public, anon;
revoke all on function public.admin_save_credential(uuid, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.get_my_credentials() from public, anon;
grant execute on function public.admin_list_credentials() to authenticated;
grant execute on function public.admin_save_credential(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.get_my_credentials() to authenticated;
