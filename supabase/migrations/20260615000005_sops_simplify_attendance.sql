-- Remove the separate fixed-rate attendance SOP — Daily Time-In covers everything
delete from hub_sops where title = 'Slack Attendance — Fixed-Rate Employees';

-- Simplify the daily attendance SOP — one process, everyone
update hub_sops set
  content = 'All team members must log attendance daily through the FS Architects Slack channel.

HOW TO CLOCK IN:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. The FS Bot will record your clock-in time.

HOW TO CLOCK OUT:
1. Type "off" in the #attendance Slack channel when your shift ends.

HALF-DAY RULE:
• If you clock in at or after 12:00 PM noon, that day is automatically counted as a half day.
• A half day is the maximum credit you can receive for that date — regardless of how long you work after noon.
• If you have a valid reason for clocking in late, notify HR and they may make a manual adjustment.

IMPORTANT NOTES:
• Clock in no later than 9:15 AM on your scheduled workdays.
• If you forget to log in, message HR the same day with the date and reason.
• HR can manually correct your attendance record in the Hub.
• Do not log for days you did not actually work.',
  updated_at = now()
where title = 'Daily Time-In / Time-Out Process';

-- Simplify payroll period SOP — fixed rate accrual, one type of employee
update hub_sops set
  content = 'Understanding how payroll periods and payments work at FS Architects.

PAY PERIODS:
• Period 1: 1st – 15th of the month
• Period 2: 16th – last working day of the month

CUTOFF DATES:
• The cutoff is the last day of each period.
• Submit your payslip by end of shift on the cutoff day.
• The FS Bot will send a Slack reminder when the cutoff approaches.

HOW PAY IS CALCULATED:
• All employees are on a fixed monthly rate, paid via accrual.
• Your payout for each period is based on the days you actually worked out of the expected working days in that period.
• Half days (clocking in after 12 PM noon) count as 0.5 days toward your accrual.
• Overtime is added on top when approved.

PAYMENT TIMELINE:
1. Employee submits payslip by the cutoff date.
2. HR reviews and approves within 1–2 business days.
3. Owner approves the fund transfer batch.
4. Payment is sent within 1–2 business days after owner approval.

ADJUSTMENTS:
• Bonuses, deductions, or advances may appear as adjustments in your payslip.
• If you see an unexpected adjustment, contact HR or file a dispute.',
  updated_at = now()
where title = 'Payroll Period & Payment Schedule';

-- Update How to Submit a Payslip to reflect accrual
update hub_sops set
  content = 'Your payslip is submitted at the end of each cutoff period. There are two cutoff periods per month:
• 1st – 15th of the month
• 16th – last working day of the month

HOW TO SUBMIT:
1. Go to Hub → My Payouts.
2. Select the correct pay period.
3. Review your attendance record, days accrued, and total payout.
4. Click "Submit for Payment" on or before the cutoff day.
5. You will receive a confirmation once HR processes your payslip.

RULES:
• Make sure all your Slack attendance is logged before submitting.
• Once submitted, your payslip is locked. Use the Dispute feature if you find an error.
• Late submissions may be held over to the next period.

PAYMENT TIMELINE:
1. You submit your payslip by the cutoff date.
2. HR reviews and approves within 1–2 business days.
3. The owner approves the fund transfer.
4. Payment is sent to your account within 1–2 business days after owner approval.
5. You will receive a Slack notification and email when payment is sent.',
  updated_at = now()
where title = 'How to Submit a Payslip';

-- Update Getting Started to remove payment type references
update hub_sops set
  content = 'Welcome to Sentro Hub — your workspace for attendance, payroll, and team communication at FS Architects.

STEP 1 — LOG IN:
• Go to fsarchitects.ph/hub/login using the email and password from your invite.
• If you have not received an invite, contact HR.

STEP 2 — INSTALL ON YOUR PHONE (recommended):
• Add the Hub to your home screen as an app. See the "Installing Sentro Hub on Your Phone" SOP for instructions.

STEP 3 — SET UP SLACK:
• Join the FS Architects Slack workspace if you have not already.
• You will use Slack for daily attendance and team communication.
• Make sure your Slack display name matches your full name in the Hub.

STEP 4 — REVIEW YOUR PROFILE:
• Go to My Profile and confirm your name and department are correct.
• Contact HR if anything looks wrong.

STEP 5 — UNDERSTAND YOUR PAY PERIOD:
• Read the "Payroll Period & Payment Schedule" SOP.
• Know when your next cutoff date is.

KEY SECTIONS IN THE HUB:
• Dashboard — your overview and recent team activity
• My Attendance — your logged hours and attendance record
• My Payouts — payslips, submission, and payment history
• Time Off — submit and track leave requests
• Overtime — log and track overtime hours
• Documents — contracts and documents for signing
• SOP Library — guides and procedures like this one

NEED HELP?
• Message HR on Slack.
• Check the SOP Library for step-by-step guides.',
  updated_at = now()
where title = 'Getting Started with Sentro Hub';
