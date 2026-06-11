-- Delete Angela's May 16 daily hours record so the attendance function
-- can re-write it correctly with 1hr from her thread reply
DELETE FROM hub_daily_hours
WHERE user_id = (SELECT id FROM hub_users WHERE full_name ILIKE '%angela%' LIMIT 1)
  AND date = '2026-05-16';
