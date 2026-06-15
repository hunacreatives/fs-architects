-- Remove hourly employee SOP (FS Architects only has fixed-rate employees)
delete from hub_sops where title = 'Slack Attendance — Hourly Employees';

-- Update Daily Time-In / Time-Out to add half-day rule and remove hourly section
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
• A half day is the maximum billable time for that date, regardless of how many hours you work after noon.
• Example: you clock in at 12:30 PM and work until 6 PM — the system records it as a half day, not a full day.

IMPORTANT NOTES:
• Clock in no later than 9:15 AM on your scheduled workdays to avoid being marked late.
• If you forget to log in, message HR immediately with the date and reason.
• HR can manually correct your attendance record in the Hub.
• Do not log for days you did not actually work.',
  updated_at = now()
where title = 'Daily Time-In / Time-Out Process';

-- Update the Fixed-Rate SOP to reinforce the half-day rule and remove hourly references
update hub_sops set
  content = 'This SOP applies to all FS Architects employees on a fixed monthly rate.

HOW TO LOG ATTENDANCE:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. Type "off" when your shift ends.

The FS Bot records your start and end times automatically and calculates total hours for the day.

HALF-DAY RULE:
• If you clock in at or after 12:00 PM noon, that day is automatically counted as a half day.
• A half day is the maximum credit you can receive for that date — even if you work a full 8 hours after noon.
• This rule applies regardless of the reason for the late clock-in. If you have a valid reason, notify HR in advance and they may make a manual adjustment.

WHY ATTENDANCE STILL MATTERS:
• Attendance records confirm you are active and available during working hours.
• Unexplained absences or patterns of late clock-ins may affect your contract status.
• Overtime (hours beyond your standard shift) is tracked separately via Hub → Overtime.

OVERTIME:
• Working late does not automatically count as overtime.
• You must submit an overtime request in Hub → Overtime with the date and hours.

IF YOU FORGET TO LOG:
• Contact HR on the same day with your actual start and end times.
• Do not leave days blank without communicating — missing attendance may result in a deduction.',
  updated_at = now()
where title = 'Slack Attendance — Fixed-Rate Employees';

-- Update How to Submit a Payslip to remove hourly references
update hub_sops set
  content = 'Your payslip is submitted at the end of each cutoff period. There are two cutoff periods per month:
• 1st – 15th of the month
• 16th – last working day of the month

HOW TO SUBMIT:
1. Go to Hub → My Payouts.
2. Select the correct pay period.
3. Review your attendance, days worked, and total payout amount.
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
5. You will receive a Slack notification and email confirmation when payment is sent.',
  updated_at = now()
where title = 'How to Submit a Payslip';

-- Update Payroll Period SOP to remove hourly references
update hub_sops set
  content = 'Understanding how payroll periods and payments work at FS Architects.

PAY PERIODS:
• Period 1: 1st – 15th of the month
• Period 2: 16th – last working day of the month

CUTOFF DATES:
• The cutoff is the last day of each period.
• You must submit your payslip by end of shift on the cutoff day.
• The FS Bot will send a Slack reminder when the cutoff approaches.

PAYMENT TIMELINE:
1. Employee submits payslip by cutoff.
2. HR reviews and approves (1–2 business days).
3. Owner approves the fund transfer batch.
4. Payment is sent (1–2 business days after owner approval).

COMPENSATION:
• All employees are on a fixed monthly rate, disbursed bi-monthly (monthly rate ÷ 2 per period).
• Half days are factored into your payout — days where you clocked in after 12 PM noon count as 0.5 days.
• Overtime is added on top when approved.

ADJUSTMENTS:
• Bonuses, deductions, or advances may appear as adjustments in your payslip.
• If you see an unexpected adjustment, contact HR or file a dispute.',
  updated_at = now()
where title = 'Payroll Period & Payment Schedule';
