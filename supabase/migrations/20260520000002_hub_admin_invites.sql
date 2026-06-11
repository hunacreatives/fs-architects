CREATE TABLE IF NOT EXISTS hub_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hub_admin_invites ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for signup validation with anon key)
CREATE POLICY "Public can read admin invites" ON hub_admin_invites
  FOR SELECT USING (true);
