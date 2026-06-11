-- Add unique constraint so ON CONFLICT works
ALTER TABLE hub_payouts
  DROP CONSTRAINT IF EXISTS hub_payouts_contractor_period_unique;
ALTER TABLE hub_payouts
  ADD CONSTRAINT hub_payouts_contractor_period_unique
  UNIQUE (contractor_id, cutoff_start);

-- Update Angela's current rate
UPDATE hub_users
SET payment_type = 'fixed', monthly_rate = 27000, hourly_rate = 166, currency = 'PHP', updated_at = now()
WHERE full_name ILIKE '%angela%';

-- Seed historical payouts
DO $$
DECLARE angela_id uuid;
BEGIN
  SELECT id INTO angela_id FROM hub_users WHERE full_name ILIKE '%angela%' LIMIT 1;
  IF angela_id IS NULL THEN RETURN; END IF;

  INSERT INTO hub_payouts
    (contractor_id,cutoff_start,cutoff_end,approved_hours,hourly_rate,
     base_pay,bonus,incentives,reimbursements,deductions,advances,penalties,
     final_payout,status,locked,payment_date)
  VALUES
    (angela_id,'2026-01-01','2026-01-15',0,166,10000,0,0,0,0,0,0,10332,'paid',true,'2026-01-15'),
    (angela_id,'2026-01-16','2026-01-31',0,166,10000,0,0,0,0,0,0,10166,'paid',true,'2026-01-31'),
    (angela_id,'2026-02-01','2026-02-15',0,166,12500,0,0,0,0,0,0,13164,'paid',true,'2026-02-15'),
    (angela_id,'2026-02-16','2026-02-28',0,166,14000,0,0,0,0,0,0,14000,'paid',true,'2026-02-28'),
    (angela_id,'2026-03-01','2026-03-15',0,166,13500,0,0,0,0,0,0,13500,'paid',true,'2026-03-15'),
    (angela_id,'2026-03-16','2026-03-31',0,166,13500,0,0,0,0,0,0,13500,'paid',true,'2026-03-31'),
    (angela_id,'2026-04-01','2026-04-15',0,166,13500,0,0,0,0,0,0,13500,'paid',true,'2026-04-15'),
    (angela_id,'2026-04-16','2026-04-30',0,166,13500,0,0,0,0,0,0,13500,'paid',true,'2026-04-30'),
    (angela_id,'2026-05-01','2026-05-15',0,166,13500,0,0,0,0,0,0,15160,'paid',true,'2026-05-15'),
    (angela_id,'2026-05-16','2026-05-31',0,166,13500,0,0,0,0,0,0,13500,'paid',true,'2026-05-31')
  ON CONFLICT (contractor_id, cutoff_start) DO UPDATE SET
    base_pay=EXCLUDED.base_pay, final_payout=EXCLUDED.final_payout,
    hourly_rate=EXCLUDED.hourly_rate, status=EXCLUDED.status,
    locked=EXCLUDED.locked, payment_date=EXCLUDED.payment_date;
END $$;
