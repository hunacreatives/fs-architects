-- ── SOP update: VL and SL can be filed freely ────────────────────────────────
-- As of 2026-08-18 the Hub no longer restricts how VL and SL are filed. The
-- 6-month tenure gate, the 3-business-day advance-notice rule, the 3-consecutive-
-- day cap and the blackout block were all removed for these two leave types.
-- The only remaining limit is the employee's annual allowance, which HR/admin
-- sets per person (annual_pto_days / annual_sick_days on their profile).
--
-- Targets the 'Requesting Time Off' SOP seeded by 20260615000002_sops_fs_architects.
-- (The earlier 20260523000007_seed_sops 'How to File for Vacation Leave (VL) or
-- Sick Leave (SL)' entry was never seeded into the FS Architects instance.)
-- Also drops the leftover "Sentro Hub" naming from the templated copy.

update hub_sops set
  content = 'All time-off requests must be submitted through the FS Architects Hub.

HOW TO REQUEST:
1. Go to Hub → Time Off.
2. Click "New Request".
3. Select your leave type: Vacation Leave (VL), Sick Leave (SL), Emergency, Unpaid, or one of the statutory leaves.
4. Choose your start and end dates. For a half-day, tick the Half Day option.
5. Add a reason or notes (optional for VL, required for SL).
6. Submit — HR will review and you will be notified via Slack.

FILING VL AND SL:
• VL and SL are available from your first day. There is no waiting period.
• File either one at any time, including same-day, for any number of days.
• There is no advance-notice requirement and no cap on consecutive days.
• Blackout dates do not block VL or SL requests.
• The only limit is your remaining balance for the year. HR sets your annual VL and SL allowance on your profile — if you need more days than you have left, speak to HR and they can adjust it.

OTHER LEAVE TYPES:
• Emergency leave: notify HR via Slack first, then file in the Hub for documentation.
• Statutory leaves (Maternity, Paternity, Solo Parent, Special Leave for Women, VAWC): HR approval required with supporting documentation.
• Blackout dates still apply to leave types other than VL, SL and Emergency.

APPROVAL:
• Filing a request is not the same as approval. HR reviews every request and may still decline based on workload, coverage or timing.
• You will receive a Slack notification when your request is approved or declined.
• Declined requests will include a note — reach out to HR to discuss.

CHECKING YOUR BALANCE:
• Your remaining VL and SL days are shown on the Time Off page.
• Approved leave reduces your balance automatically.

NOTE:
• A medical certificate may still be required for 2+ consecutive sick days.
• Approved leave days are reflected in your attendance records automatically.',
  updated_at = now()
where title = 'Requesting Time Off';
