-- Remove wrong rate history entry seeded for Angela (monthly 27,000 was incorrect)
DELETE FROM hub_rate_history
WHERE contractor_id = (
  SELECT id FROM hub_users WHERE full_name ILIKE '%angela%' LIMIT 1
)
AND monthly_rate = 27000;
