-- Allow users to update their own hub_users row
DROP POLICY IF EXISTS "Users can update own profile" ON hub_users;
CREATE POLICY "Users can update own profile" ON hub_users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
