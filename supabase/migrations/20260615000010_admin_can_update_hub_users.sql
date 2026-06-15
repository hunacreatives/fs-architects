-- Allow admins and owners to update any hub_users row (e.g. changing another user's avatar)
DROP POLICY IF EXISTS "Admins can update any profile" ON hub_users;
CREATE POLICY "Admins can update any profile" ON hub_users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM hub_users AS me
      WHERE me.id = auth.uid()
        AND me.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hub_users AS me
      WHERE me.id = auth.uid()
        AND me.role IN ('admin', 'owner')
    )
  );

-- Allow admins/owners to upload to any path in the avatars bucket
-- (storage policies are managed in Supabase dashboard under Storage > Policies)
-- Run the following in the Supabase dashboard SQL editor if the storage upload also fails:
--
-- INSERT INTO storage.policies (name, bucket_id, operation, definition)
-- VALUES (
--   'Admins can upload any avatar',
--   'avatars',
--   'INSERT',
--   'exists (select 1 from hub_users where id = auth.uid() and role in (''admin'', ''owner''))'
-- )
-- ON CONFLICT DO NOTHING;
