-- Payroll batches: fund transfer requests from HR to owner
CREATE TABLE IF NOT EXISTS hub_payroll_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  contractor_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_owner' CHECK (status IN ('pending_owner', 'owner_approved')),
  requested_by uuid REFERENCES hub_users(id),
  approved_by uuid REFERENCES hub_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  note text
);

ALTER TABLE hub_payroll_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view batches"
  ON hub_payroll_batches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage batches"
  ON hub_payroll_batches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM hub_users WHERE id = auth.uid() AND role IN ('admin', 'owner')));

-- Add batch_id to hub_payouts + ensure status covers full workflow
ALTER TABLE hub_payouts
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES hub_payroll_batches(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Broaden status check to include all workflow states
ALTER TABLE hub_payouts DROP CONSTRAINT IF EXISTS hub_payouts_status_check;
ALTER TABLE hub_payouts ADD CONSTRAINT hub_payouts_status_check
  CHECK (status IN ('pending', 'submitted', 'hr_approved', 'paid'));

-- Allow contractors to insert/update their own payout (for submit)
CREATE POLICY "Contractors can submit own payout"
  ON hub_payouts FOR INSERT TO authenticated
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractors can update own pending payout"
  ON hub_payouts FOR UPDATE TO authenticated
  USING (contractor_id = auth.uid() AND status = 'pending')
  WITH CHECK (contractor_id = auth.uid());
