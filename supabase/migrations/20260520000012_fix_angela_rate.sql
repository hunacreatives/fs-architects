-- Fix Angela's payment type and rate
UPDATE hub_users
SET
  payment_type = 'fixed',
  monthly_rate = 27000,
  hourly_rate = NULL,
  currency = 'PHP'
WHERE full_name ILIKE '%angela%'
  AND role IN ('contractor', 'admin');
