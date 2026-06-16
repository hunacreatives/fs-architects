-- Allow admins/owners to upload, update, and delete avatars in any user's folder
-- (previously only the user themselves could write to their own avatar path)
CREATE POLICY "Admins can upload any avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner'))
  );

CREATE POLICY "Admins can update any avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner'))
  );

CREATE POLICY "Admins can delete any avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner'))
  );
