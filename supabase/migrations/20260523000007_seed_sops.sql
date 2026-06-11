create table if not exists hub_sop (
  id bigserial primary key,
  title text not null,
  category text not null default 'general',
  content text,
  video_url text,
  published boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_sop enable row level security;

create policy "hub_sop_read" on hub_sop
  for select using (auth.uid() is not null and published = true);

create policy "hub_sop_admin" on hub_sop
  for all using (
    exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner'))
  );

insert into hub_sop (title, category, content, published) values

-- PAYROLL SOPs (for Abigail)
(
  'How to Run Payroll for a Period',
  'reporting',
  'Overview
Payroll is processed twice a month — 1st–15th and 16th–end of month. As admin, you are responsible for reviewing hours, approving individual payouts, and requesting the fund transfer to the owner for final approval.

Step-by-Step

1. Go to Hub → Payroll.
2. Select the correct period using the period selector at the top.
3. Review each contractor''s hours and computed pay in the table. You can expand a row to see the daily breakdown.
4. If a contractor''s pay needs to be adjusted (e.g., they filed overtime, had deductions, or had a dispute), click Edit Row and update the override.
5. Once you''ve reviewed a contractor, click Approve to mark their payout as HR Approved.
6. When all contractors are approved, click Request Fund Transfer. This sends the total to Francis for owner approval.
7. Francis will review and approve. Once approved, funds are released.

Notes
- Only approve payouts after the period has ended.
- If a contractor submitted their payslip early, you can delete it in the Supabase table editor — payslip submission is now server-side guarded.
- Disputes submitted by contractors will appear at the bottom of their row. Resolve them before approving.',
  true
),

(
  'How to Approve or Reject a Contractor Payslip',
  'reporting',
  'What is a Payslip?
Contractors submit their payslip through their Hub account after each pay period ends. This confirms they''ve reviewed their earnings and agree to the amount.

Steps to Approve

1. Go to Hub → Payouts (admin view).
2. Select the pay period.
3. Contractors who have submitted their payslip will show a "Submitted" status.
4. Review the submission. If everything looks correct, click Approve.
5. The contractor will receive a confirmation email.

Steps to Reject

1. If there''s an issue (wrong hours, dispute, etc.), click Reject and leave a note explaining why.
2. The contractor will be notified and can resubmit after the issue is resolved.

Important
- Do not approve payslips before verifying hours in the Attendance tab of the contractor''s profile.
- If a contractor disputes their payout, handle the dispute first before approving.',
  true
),

(
  'Payroll Period Schedule',
  'reporting',
  'Huna Creatives runs a semi-monthly payroll.

Period 1: 1st – 15th of the month
Period 2: 16th – end of the month

Timeline
- Period ends → Contractors submit payslip within 1–2 days.
- Admin (Abigail) reviews and approves all payouts.
- Admin requests fund transfer to owner (Francis).
- Francis approves and releases funds.
- Target payout: within 3–5 days after period end.

Contractor Pay Types
- Fixed monthly: split evenly across the two periods.
- Hourly: based on hours_capped from the attendance system.
- Fixed flexible: like hourly but with a set monthly cap.

Overtime
- Logged via Slack (type "Overtime" and reply with hours).
- Overtime hours appear in the payroll row and are added to the computed pay.',
  true
),

(
  'How to Handle a Payslip Dispute',
  'reporting',
  'If a contractor believes their payout is incorrect, they can flag a dispute through the Hub.

Steps

1. Go to Hub → Payroll and select the relevant period.
2. Expand the contractor''s row — disputes will appear at the bottom with the contractor''s message.
3. Review the dispute:
   - Check their attendance log in their profile → Attendance tab.
   - Check if overtime was logged correctly.
   - Check if any manual adjustments were made.
4. If the dispute is valid, click Edit Row and update the pay override.
5. Click Resolve Dispute to mark it as handled.
6. Re-approve the payout if needed.

If the dispute is not valid
- Click Resolve and leave a note explaining why the original amount stands.
- The contractor will see the resolution in their Hub.',
  true
),

-- HUB USAGE SOPs (for all contractors)
(
  'How to Log Attendance on Slack',
  'slack',
  'Attendance at Huna Creatives is tracked through Slack. You do not need to use a separate time-tracking app.

Clocking In
Type On in the #attendance Slack channel when you start work.

Clocking Out
Type Off in the #attendance Slack channel when you end your shift.

Logging Overtime
1. Type Overtime in the #attendance channel.
2. Reply to that message (in the thread) with the number of hours (e.g., 2).
3. Overtime will appear in your attendance record within a few minutes.

Important Notes
- You must type exactly On or Off (not "on break", not "online") for the system to recognize it.
- If you forget to clock out, your hours may be capped or marked incomplete. Always type Off before ending your day.
- Attendance syncs to the Hub every minute. You can view your daily log in Hub → Attendance.
- Reminders are sent automatically via Slack DM if you haven''t clocked in by your scheduled start time.',
  true
),

(
  'How to File for Vacation Leave (VL) or Sick Leave (SL)',
  'general',
  'Leave Entitlements
- Vacation Leave (VL): 6 days per year — available 6 months after your start date.
- Sick Leave (SL): 4 days per year — available 6 months after your start date.

How to File
1. Go to Hub → Time Off.
2. Click Request Leave.
3. Select the type: Vacation Leave (VL) or Sick Leave (SL).
4. Choose your dates. For a half-day, check the Half Day option.
5. Add a reason (optional for VL, required for SL).
6. Submit. HR will review and respond within 1 business day.

Checking Your Balance
Your remaining VL and SL days are displayed on the Time Off page — you can see how many days you''ve used and how many are left.

Important Notes
- Leave requests during blackout dates will be blocked (HR sets these during critical project periods).
- Emergency leave can still be filed during blackout dates.
- Approved leave reduces your available balance automatically.',
  true
),

(
  'How to Submit Your Payslip',
  'general',
  'At the end of each pay period, you need to review and submit your payslip through the Hub.

When to Submit
Payslip submission opens after the pay period ends. You cannot submit early.

Steps
1. Go to Hub → Payouts.
2. Select the correct pay period.
3. Review your computed earnings:
   - Hours worked (for hourly/flexible contractors)
   - Overtime logged
   - Any adjustments
4. If everything looks correct, click Submit Payslip.
5. You''ll receive a confirmation email once your payslip is processed.

If Something Looks Wrong
Do not submit if your hours or pay look incorrect. Instead:
1. Scroll down to the Dispute section.
2. Describe the issue and submit a dispute.
3. HR will review and correct it before you resubmit.

Important
- Once submitted, you cannot edit your payslip. Contact HR if you need to make changes.',
  true
),

(
  'How to Request an Official Document',
  'general',
  'If you need an official document from Huna Creatives (e.g., for visa applications, bank requirements, or government submissions), you can request it through the Hub.

Steps
1. Go to Hub → Document Center.
2. Click the Doc Requests tab.
3. Click Request Document.
4. Select the document type from the list:
   - Certificate of Engagement
   - Agreement Copy
   - NDA Copy
   - Payment Summary
   - Work Completion Certificate
   - Client Assignment Letter
   - Clearance Certificate
   - Other
5. Add a note explaining the purpose (e.g., "For SSS loan application").
6. Submit. HR will process it within 1–3 business days.

Tracking Your Request
Your request history shows the status (Pending, In Progress, Completed). Once completed, a download link will appear.',
  true
),

(
  'How to Sign a Contract in the Hub',
  'general',
  'When HR sends you a contract to sign, it will appear in your Document Center.

Steps
1. Go to Hub → Document Center.
2. The To Sign tab will show a red badge if there''s a document waiting.
3. Under Needs Your Signature, click View to read the document first.
4. Once you''ve reviewed it, click Sign Document.
5. Type your full legal name in the signature field.
6. Click Confirm Signature.

After Signing
- A signed copy with your cursive signature and date will be emailed to you.
- The document moves to the Signed section. You can view it anytime — your name and signing date will appear on the contract.',
  true
);
