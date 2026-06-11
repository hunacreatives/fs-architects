-- Revert Angela to hourly ₱166/hr (previous migration was wrong)
UPDATE hub_users
SET
  payment_type = 'hourly',
  hourly_rate = 166,
  monthly_rate = NULL,
  currency = 'PHP'
WHERE full_name ILIKE '%angela%'
  AND role IN ('contractor', 'admin');

-- Delete her pending payout record so she shows as a clean Pending row
-- (same as Claudette, Abigail, Reese who have no record at all)
DELETE FROM hub_payouts
WHERE contractor_id = (
  SELECT id FROM hub_users WHERE full_name ILIKE '%angela%' LIMIT 1
)
AND status = 'pending';
