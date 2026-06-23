-- ── SOP updates: clock-out reminder + undertime policy ───────────────────────
-- Documents the two attendance automations added 2026-06-24.

-- 1) Add full-day definition + clock-out reminder to the daily attendance SOP.
update hub_sops set
  content = 'All team members must log attendance daily through the FS Architects Slack channel.

HOW TO CLOCK IN:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. The FS Bot will record your clock-in time.

HOW TO CLOCK OUT:
1. Type "off" in the #attendance Slack channel when your shift ends.

WHAT COUNTS AS A FULL DAY:
• A full workday is 9 hours clocked in — 8 paid hours plus 1 hour of unpaid lunch.
• Logging fewer than 9 clocked hours on a scheduled workday is considered undertime (see the Undertime Policy SOP).

HALF-DAY RULE:
• If you clock in at or after 12:00 PM noon, that day is automatically counted as a half day.
• A half day is the maximum credit you can receive for that date — regardless of how long you work after noon.
• If you have a valid reason for clocking in late, notify HR and they may make a manual adjustment.

CLOCK-OUT REMINDER:
• If you stay clocked in for more than 9 hours and 30 minutes without typing "off", the FS Bot will send you a Slack DM and an email reminding you to clock out.
• If you have already clocked out, you can disregard the reminder.
• If you are genuinely working overtime, file an Overtime (OT) request for that day and the reminder will not be sent.

IMPORTANT NOTES:
• Clock in no later than 9:15 AM on your scheduled workdays.
• Always type "off" when you finish so your hours are recorded correctly.
• If you forget to log in or out, message HR the same day with the date and reason.
• HR can manually correct your attendance record in the Hub.
• Do not log for days you did not actually work.',
  updated_at = now()
where title = 'Daily Time-In / Time-Out Process';

-- 2) New SOP: Undertime Policy.
insert into hub_sops (title, category, content, published)
values (
  'Undertime Policy',
  'Attendance',
  'FS Architects tracks undertime to keep attendance fair and consistent for everyone.

WHAT COUNTS AS UNDERTIME:
• A full workday is 9 hours clocked in (8 paid hours + 1 hour unpaid lunch).
• Clocking in but logging fewer than 9 hours on a scheduled workday counts as one (1) undertime day.
• Days covered by approved time off do NOT count as undertime.
• A full no-show (no clock-in at all) is handled separately as an absence, not undertime.

3-STRIKE NOTIFICATION:
• Pay periods run 1st–15th and 16th–end of month.
• If you reach 3 undertime days within a single pay period, the system automatically notifies you, HR/Admin, and the Owner.
• You will receive a Slack DM and an email asking you to explain the undertime.
• This is a heads-up so it can be addressed early — not an automatic penalty. Please reach out to HR with your explanation.

HOW TO AVOID IT:
• Clock in on time and complete your 9 hours on scheduled workdays.
• If you need to work shorter hours on a given day, coordinate with HR in advance.
• Working extra hours? File an OT request so your time is properly credited.',
  true
)
on conflict (title) do update set
  category = excluded.category,
  content = excluded.content,
  published = excluded.published,
  updated_at = now();
