-- Set Angela's slack_username so the attendance function can match her
UPDATE hub_users
SET slack_username = 'angela'
WHERE full_name ILIKE '%angela%'
  AND role IN ('contractor', 'admin');
