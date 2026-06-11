-- Delete batches that have no associated payouts
DELETE FROM hub_payroll_batches
WHERE id NOT IN (
  SELECT DISTINCT batch_id FROM hub_payouts WHERE batch_id IS NOT NULL
);
