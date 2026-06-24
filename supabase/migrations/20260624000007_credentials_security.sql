-- C-08 + C-11: hub_credentials stored passwords/API keys as plaintext and the
-- RLS policy let *any* authenticated user SELECT every row — so a contractor could
-- read every client's password directly via the JS client, regardless of the UI.
--
-- This migration:
--   1. Encrypts the secret columns at rest (pgcrypto, symmetric key from the
--      app.credentials_key database setting).
--   2. Revokes direct client read access to the secret columns entirely.
--   3. Serves secrets only through SECURITY DEFINER RPCs that enforce authorization
--      (admins see all; contractors see only assigned/approved credentials).
--
-- OPERATOR SETUP (run once, before this migration): store the symmetric key as a
-- Supabase Vault secret named 'app_credentials_key':
--   select vault.create_secret('<long-random-secret>', 'app_credentials_key', 'hub_credentials encryption key');
-- The backfill below is skipped (with a notice) if the secret is absent; create it
-- and re-run just the DO block to encrypt existing rows.

create extension if not exists pgcrypto;

alter table hub_credentials
  add column if not exists password_enc bytea,
  add column if not exists additional_info_enc bytea;

-- Returns the encryption key from Supabase Vault, or raises so we never silently
-- encrypt or decrypt with a null key.
create or replace function public._cred_key()
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'app_credentials_key' limit 1;
  if k is null or k = '' then
    raise exception 'Credentials encryption key (vault secret app_credentials_key) is not configured.';
  end if;
  return k;
end;
$$;

-- One-time backfill of existing plaintext into the encrypted columns. Guarded so
-- it never runs (and never corrupts data) when the key is absent.
do $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'app_credentials_key' limit 1;
  if k is null or k = '' then
    raise notice 'vault secret app_credentials_key not set — skipping credential backfill. Create it and re-run this DO block.';
  else
    update hub_credentials
      set password_enc = case when password is not null and password <> '' then pgp_sym_encrypt(password, k) else password_enc end,
          additional_info_enc = case when additional_info is not null and additional_info <> '' then pgp_sym_encrypt(additional_info, k) else additional_info_enc end
      where password_enc is null and additional_info_enc is null;
  end if;
end $$;

-- Remove direct read access to the secret columns. RLS still governs which ROWS
-- are visible for the catalog columns; PostgREST cannot select the secret columns
-- at all because they are not granted. (The plaintext password/additional_info
-- columns are intentionally left in place but ungranted for now; a follow-up
-- migration can drop them once encryption is verified in production.)
revoke select on hub_credentials from authenticated;
revoke select on hub_credentials from anon;
grant select (
  id, client_name, platform, account_email, login_type, otp_contact, status, notes, created_by, created_at, updated_at
) on hub_credentials to authenticated;

-- ── Admin: list all credentials with decrypted secrets ──────────────────────
create or replace function public.admin_list_credentials()
returns table (
  id uuid, client_name text, platform text, account_email text, login_type text,
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
    select c.id, c.client_name, c.platform, c.account_email, c.login_type, c.otp_contact,
           c.status, c.notes,
           case when c.password_enc is not null then pgp_sym_decrypt(c.password_enc, _cred_key()) end::text,
           case when c.additional_info_enc is not null then pgp_sym_decrypt(c.additional_info_enc, _cred_key()) end::text,
           c.created_at, c.updated_at
    from hub_credentials c
    order by c.client_name, c.platform;
end;
$$;

-- ── Admin: insert/update a credential (encrypts secrets) ────────────────────
create or replace function public.admin_save_credential(
  p_id uuid,
  p_client_name text,
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
      client_name, platform, account_email, login_type, otp_contact, status, notes,
      password_enc, additional_info_enc, created_by
    ) values (
      p_client_name, p_platform, p_account_email, coalesce(p_login_type, 'email_password'),
      p_otp_contact, coalesce(p_status, 'active'), p_notes,
      case when p_password is not null and p_password <> '' then pgp_sym_encrypt(p_password, _cred_key()) end,
      case when p_additional_info is not null and p_additional_info <> '' then pgp_sym_encrypt(p_additional_info, _cred_key()) end,
      v_actor
    )
    returning id into v_id;
  else
    update hub_credentials set
      client_name = p_client_name,
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

-- ── Contractor: own credential catalog + secrets only where authorized ──────
create or replace function public.get_my_credentials()
returns table (
  id uuid, client_name text, platform text, login_type text, status text,
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
  with my_clients as (
    select client_name from hub_clients where assigned_contractor_id = v_uid
  ),
  my_approved as (
    select credential_id from hub_credential_requests where contractor_id = v_uid and status = 'approved'
  ),
  scoped as (
    select c.*,
           (c.client_name in (select client_name from my_clients)
            or c.id in (select credential_id from my_approved)) as access
    from hub_credentials c
  )
  select s.id, s.client_name, s.platform, s.login_type, s.status, s.account_email, s.otp_contact, s.notes,
         case when s.access and s.password_enc is not null then pgp_sym_decrypt(s.password_enc, _cred_key()) end::text,
         case when s.access and s.additional_info_enc is not null then pgp_sym_decrypt(s.additional_info_enc, _cred_key()) end::text,
         s.access
  from scoped s
  order by s.client_name, s.platform;
end;
$$;

revoke all on function public.admin_list_credentials() from public, anon;
revoke all on function public.admin_save_credential(uuid, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.get_my_credentials() from public, anon;
grant execute on function public.admin_list_credentials() to authenticated;
grant execute on function public.admin_save_credential(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.get_my_credentials() to authenticated;
