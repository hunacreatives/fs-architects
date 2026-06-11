-- Zero out Angela's overtime on days where she didn't actually log OT
-- (keeps the punch hours, just clears bad OT values from before the timezone fix)
UPDATE hub_daily_hours
SET overtime_hours = 0
WHERE user_id = (SELECT id FROM hub_users WHERE full_name ILIKE '%angela%' LIMIT 1)
  AND date >= '2026-05-16'
  AND date < '2026-05-20'; -- only pre-today days; today's value is correct from Slack
