-- Add adjustments column to hub_payouts for bonus/reimbursement line items
ALTER TABLE hub_payouts
  ADD COLUMN IF NOT EXISTS adjustments JSONB DEFAULT '[]';
