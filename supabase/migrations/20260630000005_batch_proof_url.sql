-- ── Fund transfer proof of payment ───────────────────────────────────────────
-- When the owner approves a payroll fund transfer they can attach a screenshot
-- as proof of the transfer. The image is uploaded to Google Drive (Payroll /
-- Receipts) and its link stored here for the in-hub record.
alter table hub_payroll_batches add column if not exists proof_url text;
