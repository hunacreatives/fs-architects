-- Rate history: tracks every rate change per contractor with effective date
CREATE TABLE IF NOT EXISTS hub_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES hub_users(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  payment_type text NOT NULL CHECK (payment_type IN ('hourly', 'fixed')),
  hourly_rate numeric,
  monthly_rate numeric,
  currency text NOT NULL DEFAULT 'PHP',
  note text,
  created_by uuid REFERENCES hub_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hub_rate_history ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view rate history
CREATE POLICY "Authenticated can view rate history"
  ON hub_rate_history FOR SELECT TO authenticated USING (true);

-- Only admin/owner can insert/update/delete
CREATE POLICY "Admins can manage rate history"
  ON hub_rate_history FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner'))
  );

-- Index for fast lookup by contractor + date
CREATE INDEX IF NOT EXISTS hub_rate_history_contractor_date
  ON hub_rate_history(contractor_id, effective_date);
