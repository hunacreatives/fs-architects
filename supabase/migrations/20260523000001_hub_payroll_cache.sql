CREATE TABLE IF NOT EXISTS hub_payroll_cache (
  period_start date PRIMARY KEY,
  computed_total numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hub_payroll_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view payroll cache"
  ON hub_payroll_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage payroll cache"
  ON hub_payroll_cache FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner')));
