-- Angela: fixed monthly ₱27,000 with explicit OT rate of ₱166/hr
UPDATE hub_users
SET
  payment_type = 'fixed',
  monthly_rate = 27000,
  hourly_rate = 166,
  currency = 'PHP'
WHERE full_name ILIKE '%angela%'
  AND role IN ('contractor', 'admin');
