-- Add is_rest_day and admin_created to hub_overtime_requests
-- is_rest_day: null = auto-detect from date, true = rest day (30%), false = weekday (25%)
-- admin_created: true = inserted directly from payroll edit panel (bypasses request flow)
ALTER TABLE hub_overtime_requests
  ADD COLUMN IF NOT EXISTS is_rest_day boolean,
  ADD COLUMN IF NOT EXISTS admin_created boolean DEFAULT false;
