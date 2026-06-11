-- Fix Angela's May 16-31 payout that was incorrectly seeded as 'paid'
-- The period hasn't happened yet so it should be 'pending'
UPDATE hub_payouts
SET
  status = 'pending',
  payment_date = NULL,
  paid_at = NULL,
  approved_at = NULL,
  submitted_at = NULL,
  batch_id = NULL
WHERE cutoff_start = '2026-05-16'
  AND contractor_id = (
    SELECT id FROM hub_users WHERE full_name ILIKE '%angela%' LIMIT 1
  );

-- Also fix Claudette's hr_approved status (revert to pending by deleting the record)
DELETE FROM hub_payouts
WHERE cutoff_start = '2026-05-16'
  AND contractor_id = (
    SELECT id FROM hub_users WHERE full_name ILIKE '%claudette%' LIMIT 1
  )
  AND status = 'hr_approved';
