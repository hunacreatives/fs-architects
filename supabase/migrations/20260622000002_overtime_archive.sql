-- Add archived flag to overtime requests
ALTER TABLE hub_overtime_requests ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Archive any existing requests older than 1 year immediately
UPDATE hub_overtime_requests
  SET archived = true
  WHERE created_at < NOW() - INTERVAL '1 year'
    AND archived = false;
