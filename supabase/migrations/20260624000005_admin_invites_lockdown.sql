-- C-15: "Public can read admin invites" used USING (true), letting any anonymous
-- caller enumerate every invite token — including unused ones, which could be
-- redeemed to self-register. No frontend code reads this table directly (invite
-- validation happens through Supabase Auth's verifyOtp), and the edge functions
-- that manage invites use the service role, which bypasses RLS. So we can simply
-- remove anonymous read access and restrict any direct reads to admins.

drop policy if exists "Public can read admin invites" on hub_admin_invites;

drop policy if exists "Admins read admin invites" on hub_admin_invites;
create policy "Admins read admin invites"
  on hub_admin_invites for select to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner')));
