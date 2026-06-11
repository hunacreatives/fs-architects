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
