-- Full SOP update — updates existing + adds all new ones
-- Uses title as the unique key for upserts

-- Update existing SOPs
update hub_sops set
  content = 'All team members must log attendance daily through the Sentro Hub Slack channel.

HOW TO CLOCK IN:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. The Huna Bot will record your clock-in time.

HOW TO CLOCK OUT:
• Hourly contractors: reply to your "on" message in the thread with just the number of hours worked (e.g. "5" or "7.5"). Do NOT type "off" — your hours will not be recorded correctly.
• Fixed-rate contractors: type "off" in the channel when your shift ends.

IMPORTANT NOTES:
• Clock in no later than 9:15 AM on scheduled workdays.
• If you forget to log in, message your admin or HR immediately with the reason.
• Inaccurate attendance affects your payslip calculation.
• Do not log for days you did not actually work.',
  updated_at = now()
where title = 'Daily Time-In / Time-Out Process';

update hub_sops set
  content = 'Your payslip is submitted at the end of each cutoff period. There are two cutoff periods per month:
• 1st – 15th of the month
• 16th – last working day of the month

HOW TO SUBMIT:
1. Go to Hub → My Payouts.
2. Select the correct pay period.
3. Review your hours, overtime, and total payout.
4. Click "Submit for Payment" on or before the cutoff day.
5. You will receive a confirmation once HR processes your payslip.

RULES:
• Only submit if you have actual hours for the period.
• Make sure all your Slack attendance is logged before submitting.
• Once submitted, your payslip is locked. Use the Dispute feature if you find an error.
• Late submissions may be moved to the next period.

PAYMENT TIMELINE:
• HR reviews and approves within 1–2 business days after cutoff.
• Owner approves the fund transfer.
• Payment is sent within 1–2 business days after owner approval.',
  updated_at = now()
where title = 'How to Submit a Payslip';

update hub_sops set
  content = 'Time-off requests must be submitted through the Sentro Hub.

HOW TO REQUEST:
1. Go to Hub → Time Off.
2. Click "New Request".
3. Select leave type: Paid Time Off, Sick Leave, Emergency, or Unpaid.
4. Choose your start and end dates.
5. Add a reason or notes.
6. Submit — HR and the owner will review.

LEAD TIME REQUIREMENTS:
• Planned leaves (PTO, vacation): submit at least 3 business days in advance.
• Sick leave: can be submitted on the same day. A medical certificate may be required for absences of 2+ consecutive days.
• Emergency leave: notify your admin via Slack first, then submit in the Hub.

APPROVAL:
• You will receive a Slack notification when your request is approved or declined.
• Approved time off is automatically reflected in your attendance.
• Denied requests will include a note — reach out to HR to discuss.',
  updated_at = now()
where title = 'Requesting Time Off';

update hub_sops set
  content = 'All client-facing communication must be professional, clear, and timely.

RESPONSE TIME:
• Respond to client messages within 4 hours during business hours (9 AM – 6 PM PHT, Mon–Fri).
• If you cannot respond in time, notify your project manager immediately.

EMAIL STANDARDS:
• Always CC your Project Manager (PM) on all client emails.
• Use a professional tone. Avoid slang, emojis, or overly casual language in written communication.
• Keep subject lines clear: [Project Name] — [Topic].

MESSAGING PLATFORMS:
• Only use client-approved channels (email, Slack, or designated tools).
• Do not share pricing, contract terms, or sensitive information without PM approval.
• Never promise deadlines or deliverables without confirming with the team first.

FEEDBACK & REVISIONS:
• Acknowledge receipt of feedback promptly.
• Clarify ambiguous feedback before starting revisions.
• Document all feedback in the project workspace for team visibility.',
  updated_at = now()
where title = 'Client Communication Standards';

update hub_sops set
  content = 'Consistent file naming keeps our Drive organized and makes handoffs smooth.

STANDARD FORMAT:
[ProjectCode]_[Deliverable]_[Version]_[YYYYMMDD]

EXAMPLE:
PCR001_BrandGuide_v3_20260530.pdf

PROJECT CODES:
• Use 3-letter client abbreviation + 3-digit number (e.g., PCR001 = Peak Coffee Roasters 001)
• Find the project code in the project workspace

VERSIONING:
• v1, v2, v3 — for major revisions shared with clients
• v1a, v1b — for internal iterations before sharing

FILE STORAGE:
• All project files go in the designated Google Drive folder linked in the project workspace.
• Follow the folder structure: /Client Name/Project Name/[Phase or Deliverable]
• Do not save final deliverables on personal drives or desktop.
• Archive old versions in a /Archive subfolder — do not delete them.',
  updated_at = now()
where title = 'File Naming Conventions';

-- Insert new SOPs (skip if title already exists)
insert into hub_sops (title, category, content, published, created_at) values

('How to Log Overtime', 'HR',
'Overtime must be pre-approved or submitted promptly after the fact.

WHEN OVERTIME APPLIES:
• Any hours worked beyond your standard shift on a scheduled workday.
• Work done on weekends or rest days (with prior approval).

HOW TO SUBMIT:
1. Go to Hub → Overtime.
2. Click "Log Overtime".
3. Enter the date, number of hours, and a brief description of the work done.
4. Submit — HR will review and approve.

APPROVAL PROCESS:
• HR approves or declines within 1–2 business days.
• Approved overtime is added to your next payslip automatically.
• You will receive a Slack notification with the decision.

NOTES:
• Do not log overtime retroactively more than 3 days after the work was done without a valid reason.
• Recurring overtime without prior notice may not be approved.
• If you expect a project to require overtime, inform your PM before it happens.',
true, now()),

('How to Dispute a Payslip', 'Payroll',
'If you believe your payslip is incorrect, you can file a dispute before it is finalized.

WHEN TO DISPUTE:
• Your hours are incorrect (more or fewer than you actually worked).
• Overtime was not included or is wrong.
• Deductions or adjustments are unexplained.

HOW TO DISPUTE:
1. Go to Hub → My Payouts.
2. Select the affected pay period.
3. Click "Dispute" on the submitted payslip.
4. Write a clear, specific reason (e.g., "My May 27 hours show 6.11h but I only logged 5h").
5. Submit — HR will review within 2 business days.

WHAT HAPPENS NEXT:
• HR reviews your attendance records and the dispute.
• You will receive a Slack notification with the resolution.
• If approved, your payslip will be corrected before payment is sent.

TIPS:
• Be specific about which days or amounts are incorrect.
• Check your Slack attendance logs before disputing — they are the source of truth.
• Disputes must be filed before the payslip is marked "Paid".',
true, now()),

('How to Use the Project Workspace', 'Projects',
'The Project Workspace is your central hub for everything related to a specific project.

ACCESSING THE WORKSPACE:
1. Go to Hub → My Projects.
2. Click on a project tile to open it.
3. Click "Open Workspace" to enter the full workspace.

WHAT YOU CAN DO IN THE WORKSPACE:

Tasks:
• Add tasks using the "+ Add Task" button.
• Click a task to view details, leave comments, or update the status.
• Cycle a task status by clicking the circle icon: To Do → In Progress → Done.
• Assign tasks to team members.
• Set start and due dates — tasks appear on the timeline calendar.

Timeline / Calendar:
• The calendar shows all tasks with due dates.
• Click a day to see tasks due on that date.
• Tasks with a date range appear as bars across multiple days.

Comments & Collaboration:
• Click any task to open the task detail panel.
• Leave comments at the bottom of the panel.
• @mention a teammate to notify them via Slack DM.

Files (Google Drive):
• If your admin has linked a Drive folder, it appears in the project header.
• Click "Open Drive" to access the full folder.

Search:
• Use the Search bar in the header to find sections (Timeline, Tasks, Payout, etc.).
• Searching a section name focuses the workspace on that section only.',
true, now()),

('@Mentions in Task Comments', 'Projects',
'You can tag teammates in comments to notify them directly.

HOW TO MENTION:
1. Open a task in the workspace.
2. In the comment box, type @ followed by a teammate''s first name.
3. A dropdown will appear — click their name to insert the mention.
4. Send the comment.

WHAT HAPPENS:
• The mentioned person receives a Slack DM from the Huna Bot with your comment.
• They also receive an in-app notification in the bell icon.
• The mention appears highlighted in blue in the comment thread.

BEST PRACTICES:
• Use @mentions when you need a specific person to take action.
• Keep your message clear — include what you need and by when.
• Do not spam @mentions for non-urgent updates.
• Check your notification bell regularly for mentions directed at you.',
true, now()),

('Payroll Period & Payment Schedule', 'Payroll',
'Understanding how payroll periods and payments work at Huna Creatives.

PAY PERIODS:
• Period 1: 1st – 15th of the month
• Period 2: 16th – last working day of the month (Friday before end of month if month ends on weekend)

CUTOFF DATES:
• The cutoff is the last day of each period.
• You must submit your payslip by end of shift on the cutoff day.
• The Huna Bot will send a Slack reminder on cutoff days.

PAYMENT TIMELINE:
1. You submit your payslip by cutoff.
2. HR reviews and approves (1–2 business days).
3. Owner approves the fund transfer batch.
4. Payment is sent to your account (1–2 business days after owner approval).

RATES:
• Hourly contractors: paid based on logged hours × hourly rate.
• Fixed-rate contractors: paid a flat amount per period (monthly rate ÷ 2).
• Overtime is added on top, using your derived hourly rate.

ADJUSTMENTS:
• Bonuses, incentives, deductions, or advances may appear in your payslip as adjustments.
• If you see an unexpected adjustment, contact HR or file a dispute.',
true, now()),

('Installing Sentro Hub on Your Phone', 'Onboarding',
'Sentro Hub is a Progressive Web App (PWA) — you can install it on your phone or desktop like a native app. No App Store needed.

ON iPHONE (iOS 16.4+):
1. Open Safari and go to www.hunacreatives.com/hub/login.
2. Log in to your account.
3. Tap the Share button (box with an arrow pointing up).
4. Scroll down and tap "Add to Home Screen".
5. Tap "Add" in the top right.
6. The app now appears on your home screen.

ON ANDROID (Chrome):
1. Open Chrome and go to www.hunacreatives.com/hub/login.
2. Tap the three-dot menu (⋮) in the top right.
3. Tap "Add to Home Screen" or "Install App".
4. Tap "Install".
5. The app appears on your home screen like a native app.

ON MAC OR WINDOWS (Chrome):
1. Open Chrome and go to www.hunacreatives.com/hub/login.
2. Look for an install icon in the address bar (a small monitor with a down arrow).
3. Click it and select "Install".
4. The app opens in its own window and appears in your dock or taskbar.

NOTE:
• The app opens directly to the hub — no browser chrome, no URL bar.
• You will need to log in once after installing.
• Notifications from the hub work when the app is installed.',
true, now()),

('Requesting Documents or Credentials', 'Operations',
'Use the Requests feature in the Hub to ask for documents, tools, or access you need for your work.

HOW TO SUBMIT A REQUEST:
1. Go to Hub → and look for the Requests section (or contact HR via Slack if the form is unavailable).
2. Select the request type:
   • Document Request — contracts, certificates, reference letters
   • Credential Access — login credentials for client tools, platforms, or internal systems
3. Describe what you need clearly and why.
4. Submit — HR and admin are notified automatically.

RESPONSE TIME:
• HR aims to respond within 1–2 business days.
• Urgent requests: message HR directly on Slack first, then submit in the Hub for documentation.

CREDENTIAL HANDLING:
• Never share credentials with people outside the team.
• If you receive access to a client platform, use it only for the scope of the project.
• Report any suspicious activity or lost access to your PM immediately.',
true, now()),

('Working Hours and Availability', 'HR',
'Standard working hours and availability expectations for all Huna Creatives team members.

STANDARD HOURS:
• Monday – Friday, 9:00 AM – 6:00 PM PHT (Philippine Time).
• Some roles may have adjusted shifts — refer to your contract for specifics.

ATTENDANCE EXPECTATIONS:
• Be available and responsive during your scheduled shift hours.
• Log in to Slack at the start of your shift.
• Clock in via the #attendance Slack channel by 9:15 AM.
• Notify your PM via Slack if you will be late or need to leave early.

REST DAYS:
• Saturday and Sunday are standard rest days unless your contract specifies otherwise.
• Working on rest days requires prior approval and may qualify for overtime pay.

REMOTE WORK:
• All contractors are fully remote. Maintain a productive, distraction-free work environment during scheduled hours.
• Be reachable via Slack during working hours unless you have approved time off.

RESPONSE TIME:
• Respond to Slack messages from the team within 30 minutes during working hours.
• Longer delays must be communicated proactively.',
true, now()),

('Using Google Drive for Project Files', 'Projects',
'All project files are stored in the Huna Creatives Google Drive folder, organized by client and project.

FOLDER STRUCTURE:
Huna Creatives > Client Folders > [Local or International] > [Client Name] > [Project Name]

• Philippine clients go under "Local"
• International clients go under "International"

ACCESSING PROJECT FILES:
• The Google Drive folder linked to your project appears in the project workspace header.
• Click "Open Drive" to open the full folder in your browser.
• You can also browse files directly in the workspace if your admin has linked the folder.

UPLOADING FILES:
• Upload deliverables to the correct project folder.
• Follow the file naming convention: [ProjectCode]_[Deliverable]_[Version]_[YYYYMMDD]
• Do not upload files to the root "Client Folders" level — always go into the specific project subfolder.

SHARING:
• Share files from Google Drive using the "Share" button with view or comment access.
• Do not share entire client folders externally — only share specific files as needed.
• Always check with your PM before sharing anything with a client directly.

PERMISSIONS:
• You will be granted access to the Drive folders relevant to your projects.
• If you need access to a folder you cannot see, submit a Credential/Document Request in the Hub.',
true, now()),

('Getting Started with Sentro Hub', 'Onboarding',
'Welcome to Sentro Hub — your workspace for projects, attendance, payroll, and team communication at Huna Creatives.

STEP 1 — LOG IN:
• Go to www.hunacreatives.com/hub/login using the email and password from your invite.
• If you have not received an invite, contact HR.

STEP 2 — INSTALL ON YOUR PHONE (recommended):
• Add the Hub to your home screen as an app. See the "Installing Sentro Hub on Your Phone" SOP for instructions.

STEP 3 — SET UP SLACK:
• Join the Huna Creatives Slack workspace if you have not already.
• You will use Slack for daily attendance, overtime logging, and team communication.
• Make sure your Slack name matches your full name in the Hub.

STEP 4 — REVIEW YOUR PROFILE:
• Check that your name, department, and contract details are correct.
• Contact HR if anything looks wrong.

STEP 5 — UNDERSTAND YOUR PAY PERIOD:
• Read the "Payroll Period & Payment Schedule" SOP.
• Know when your next cutoff date is.

KEY SECTIONS IN THE HUB:
• Dashboard — your overview, active projects, and recent updates
• My Projects — all projects you are assigned to, with tasks and files
• My Payouts — your payslips, submission, and payment history
• Time Off — submit and track leave requests
• Overtime — log and track overtime hours
• Documents — contracts and documents to sign

NEED HELP?
• Message HR or your PM on Slack.
• Check the SOPs section in the Hub for step-by-step guides.',
true, now()),

('Slack Attendance — Hourly Contractors', 'Attendance',
'This SOP applies specifically to hourly-rate contractors. Your pay is based on the hours you log, so accuracy is critical.

HOW TO LOG HOURS:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. When you finish, reply IN THE THREAD of your "on" message with just the number of hours worked.
   • Example: You worked 7.5 hours → reply "7.5" in the thread.
   • Do NOT type "off" as a separate message — your hours will not be captured.

WHY THIS MATTERS:
• The Huna Bot reads your thread reply to record your hours for that day.
• If you type "off" separately or reply in the wrong thread, the system cannot match it to your clock-in, and your hours may show as 0 or incorrect.

COMMON MISTAKES TO AVOID:
• ❌ Typing "off" in the main channel instead of replying in the thread
• ❌ Replying to a different day''s "on" message
• ❌ Typing "8 hours" instead of just "8"
• ❌ Forgetting to reply — your hours will not be logged

IF YOU MADE A MISTAKE:
• Contact HR immediately with the correct hours and the date.
• HR can manually correct your attendance record.',
true, now()),

('Slack Attendance — Fixed-Rate Contractors', 'Attendance',
'This SOP applies to fixed-rate (monthly salary) contractors. Your pay is not based on hours, but attendance is still tracked for monitoring and compliance.

HOW TO LOG ATTENDANCE:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. Type "off" when your shift ends.

THAT''S IT — no need to reply with hours in the thread. The system records your start and end times, and calculates your total hours for the day.

WHY IT STILL MATTERS:
• Attendance records confirm you are active and available during working hours.
• Consistent no-shows or unexplained absences may affect your contract status.
• Overtime (hours beyond your standard shift) is still tracked separately.

OVERTIME:
• If you work beyond your standard hours on a given day, submit an overtime request in the Hub → Overtime section separately.
• Attendance logging alone does not automatically count as overtime.

IF YOU FORGET:
• Contact HR the same day with your actual start and end times.
• Do not leave days blank without communicating.',
true, now())

on conflict (title) do nothing;
