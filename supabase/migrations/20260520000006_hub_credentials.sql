CREATE TABLE hub_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  platform text NOT NULL,
  account_email text,
  password text,
  login_type text NOT NULL DEFAULT 'email_password',
  otp_contact text,
  additional_info text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES hub_users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE hub_credential_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid REFERENCES hub_credentials(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES hub_users(id),
  reason text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES hub_users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hub_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_credential_requests ENABLE ROW LEVEL SECURITY;

-- All authenticated hub users can SELECT (UI controls what columns are shown; password never fetched for unauthorized users)
CREATE POLICY "Hub members can view credentials" ON hub_credentials
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admin/owner can insert, update, delete
CREATE POLICY "Admins manage credentials" ON hub_credentials
  FOR ALL USING (
    EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

-- Admin/owner see and manage all requests
CREATE POLICY "Admins manage requests" ON hub_credential_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

-- Contractors manage their own requests
CREATE POLICY "Contractors manage own requests" ON hub_credential_requests
  FOR ALL USING (contractor_id = auth.uid());
