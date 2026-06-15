-- Full SOP replacement for FS Architects
-- Deletes all existing SOPs and replaces with FS Architects-specific content

delete from hub_sops;

insert into hub_sops (title, category, content, published, created_at) values

('Getting Started with Sentro Hub', 'Onboarding',
'Welcome to Sentro Hub — your workspace for projects, attendance, payroll, and team communication at FS Architects.

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
• Go to My Profile and confirm your name, department, and contact details are correct.
• Contact HR if anything looks wrong.

STEP 5 — UNDERSTAND YOUR PAY PERIOD:
• Read the "Payroll Period & Payment Schedule" SOP.
• Know when your next cutoff date is.

KEY SECTIONS IN THE HUB:
• Dashboard — your overview and recent team activity
• My Attendance — your logged hours for each day
• My Payouts — payslips, submission, and payment history
• Time Off — submit and track leave requests
• Overtime — log and track overtime hours
• Documents — contracts and documents for signing
• SOP Library — guides and procedures like this one

NEED HELP?
• Message HR on Slack.
• Check the SOP Library for step-by-step guides.', true, now()),

('Installing Sentro Hub on Your Phone', 'Onboarding',
'Sentro Hub is a Progressive Web App (PWA) — install it on your phone or desktop like a native app. No App Store needed.

ON iPHONE (Safari):
1. Open Safari and go to fsarchitects.ph/hub/login.
2. Log in to your account.
3. Tap the Share button (box with an arrow pointing up).
4. Scroll down and tap "Add to Home Screen".
5. Tap "Add" in the top right.
6. The app now appears on your home screen.

ON ANDROID (Chrome):
1. Open Chrome and go to fsarchitects.ph/hub/login.
2. Tap the three-dot menu (⋮) in the top right.
3. Tap "Add to Home Screen" or "Install App".
4. Tap "Install".
5. The app appears on your home screen like a native app.

ON MAC OR WINDOWS (Chrome):
1. Open Chrome and go to fsarchitects.ph/hub/login.
2. Look for an install icon in the address bar (a small monitor with a down arrow).
3. Click it and select "Install".
4. The app opens in its own window and appears in your dock or taskbar.

NOTE:
• The app opens directly to the hub with no browser bar.
• You will need to log in once after installing.
• Push notifications from the hub work once the app is installed.', true, now()),

('Daily Time-In / Time-Out Process', 'Attendance',
'All team members must log attendance daily through the FS Architects Slack channel.

HOW TO CLOCK IN:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. The FS Bot will record your clock-in time.

HOW TO CLOCK OUT:
• Fixed-rate employees: type "off" in the channel when your shift ends.
• Hourly employees: reply to your "on" message in the thread with just the number of hours worked (e.g. "5" or "7.5"). Do NOT type "off" in the main channel.

IMPORTANT NOTES:
• Clock in no later than 9:15 AM on your scheduled workdays.
• If you forget to log in, message HR immediately with the date and reason.
• Inaccurate attendance directly affects your payslip calculation.
• Do not log for days you did not actually work.', true, now()),

('Slack Attendance — Fixed-Rate Employees', 'Attendance',
'This SOP applies to fixed monthly rate employees. Your pay is not based on hours, but attendance is still tracked for records and compliance.

HOW TO LOG ATTENDANCE:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. Type "off" when your shift ends.

No need to reply in a thread or enter hours — the FS Bot records your start and end times automatically and calculates total hours for the day.

WHY IT STILL MATTERS:
• Attendance records confirm you are active and available during working hours.
• Unexplained absences may affect your contract status.
• Overtime (hours beyond your standard shift) is tracked separately via the Overtime section.

OVERTIME:
• Working beyond your standard hours does not automatically count as overtime.
• You must submit an overtime request in Hub → Overtime after the fact or in advance.

IF YOU FORGET TO LOG:
• Contact HR on the same day with your actual start and end times.
• Do not leave days blank without communicating.', true, now()),

('Slack Attendance — Hourly Employees', 'Attendance',
'This SOP applies to hourly-rate employees. Your pay is calculated from the hours you log — accuracy is critical.

HOW TO LOG HOURS:
1. Go to the #attendance Slack channel.
2. Type "on" when you start your shift.
3. When you finish, reply IN THE THREAD of your "on" message with just the number of hours worked.
   • Example: worked 7.5 hours → reply "7.5" in the thread.
   • Do NOT type "off" as a separate message in the channel.

WHY THIS MATTERS:
• The FS Bot reads your thread reply to record your hours for that day.
• If you type "off" in the main channel or reply to the wrong thread, the system cannot match your hours and they will show as 0.

COMMON MISTAKES TO AVOID:
• ❌ Typing "off" in the main channel instead of replying in your "on" thread
• ❌ Replying to a different day''s thread
• ❌ Typing "8 hours" instead of just "8"
• ❌ Forgetting to reply — your hours will not be logged

IF YOU MADE A MISTAKE:
• Contact HR immediately with the correct hours and the date.
• HR can manually correct your attendance record in the Hub.', true, now()),

('How to Submit a Payslip', 'Payroll',
'Your payslip is submitted at the end of each cutoff period. There are two cutoff periods per month:
• 1st – 15th of the month
• 16th – last working day of the month

HOW TO SUBMIT:
1. Go to Hub → My Payouts.
2. Select the correct pay period.
3. Review your attendance, hours, and total payout amount.
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
5. You will receive a Slack notification and email confirmation when payment is sent.', true, now()),

('Payroll Period & Payment Schedule', 'Payroll',
'Understanding how payroll periods and payments work at FS Architects.

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

COMPENSATION TYPES:
• Hourly employees: paid based on logged billable hours × hourly rate.
• Fixed-rate employees: paid a flat amount per period (monthly rate ÷ 2).
• Overtime is added on top and computed using your applicable rate.

ADJUSTMENTS:
• Bonuses, deductions, or advances may appear as adjustments in your payslip.
• If you see an unexpected adjustment, contact HR or file a dispute.', true, now()),

('How to Dispute a Payslip', 'Payroll',
'If you believe your payslip is incorrect, file a dispute before it is finalized.

WHEN TO DISPUTE:
• Your hours are incorrect (more or fewer than you actually worked).
• Overtime was not reflected or is wrong.
• Deductions or adjustments are unexplained.

HOW TO DISPUTE:
1. Go to Hub → My Payouts.
2. Select the affected pay period.
3. Click "Dispute" on your submitted payslip.
4. Write a clear, specific reason (e.g., "My June 3 hours show 6h but I only worked 5h").
5. Submit — HR will review within 2 business days.

WHAT HAPPENS NEXT:
• HR reviews your Slack attendance logs and the dispute.
• You will receive a Slack notification with the resolution.
• If the dispute is approved, your payslip is corrected before payment is sent.

TIPS:
• Be specific about which dates or amounts are wrong.
• Your Slack attendance logs are the source of truth — check them before disputing.
• Disputes must be filed before the payslip is marked "Paid".', true, now()),

('How to Log Overtime', 'HR',
'Overtime work must be submitted through the Hub, either in advance or promptly after the fact.

WHEN OVERTIME APPLIES:
• Any hours worked beyond your standard shift on a scheduled workday.
• Work done on rest days or weekends (with prior approval).

HOW TO SUBMIT:
1. Go to Hub → Overtime.
2. Click "Log Overtime".
3. Enter the date, number of extra hours, and a brief description of the work done.
4. Submit — HR or admin will review and approve.

APPROVAL PROCESS:
• HR approves or declines within 1–2 business days.
• Approved overtime is automatically added to your next payslip.
• You will receive a Slack notification with the decision.

NOTES:
• Do not log overtime more than 3 days after the work was done without a valid reason.
• Recurring unannounced overtime may not be approved.
• If you expect a project to require overtime, inform your team lead before it happens.', true, now()),

('Requesting Time Off', 'HR',
'All time-off requests must be submitted through the Sentro Hub.

HOW TO REQUEST:
1. Go to Hub → Time Off.
2. Click "New Request".
3. Select your leave type: Paid Time Off, Sick Leave, Emergency, or Unpaid Leave.
4. Choose your start and end dates.
5. Add a reason or notes.
6. Submit — HR will review and you will be notified via Slack.

LEAD TIME REQUIREMENTS:
• Planned leaves (PTO, vacation): submit at least 3 business days in advance.
• Sick leave: submit on the same day. A medical certificate may be required for 2+ consecutive sick days.
• Emergency leave: notify HR via Slack first, then file in the Hub for documentation.

APPROVAL:
• You will receive a Slack notification when your request is approved or declined.
• Declined requests will include a note — reach out to HR to discuss.

NOTE:
• Approved leave days are reflected in your attendance records automatically.', true, now()),

('Working Hours & Availability', 'HR',
'Standard working hours and availability expectations for all FS Architects team members.

STANDARD HOURS:
• Monday – Friday, 9:00 AM – 6:00 PM PHT (Philippine Time).
• Some roles may have adjusted schedules — refer to your contract for specifics.

ATTENDANCE EXPECTATIONS:
• Be available and responsive during your scheduled shift.
• Clock in via the #attendance Slack channel by 9:15 AM on workdays.
• Notify HR via Slack if you will be late or need to leave early.

REST DAYS:
• Saturday and Sunday are standard rest days.
• Working on rest days requires prior approval and may qualify for overtime pay.

REMOTE WORK:
• All team members work remotely. Maintain a focused, professional work environment during scheduled hours.
• Be reachable on Slack during working hours unless you have approved time off.

RESPONSE TIME:
• Respond to Slack messages from teammates within 30 minutes during working hours.
• Communicate proactively if you need to step away.', true, now()),

('Client Communication Standards', 'Operations',
'All client-facing communication must be professional, clear, and timely.

RESPONSE TIME:
• Respond to client messages within 4 hours during business hours (9 AM – 6 PM PHT, Mon–Fri).
• If you cannot respond in time, notify your Project Manager (PM) immediately.

EMAIL STANDARDS:
• Always CC your Project Manager on all client emails.
• Use a professional tone. Avoid slang, emojis, or overly casual language.
• Keep subject lines clear: [Project Name] — [Topic].

MESSAGING PLATFORMS:
• Only use client-approved channels (email, Viber, or designated tools).
• Do not share pricing, contract terms, or sensitive project details without PM approval.
• Never commit to deadlines or deliverables without confirming with the team first.

FEEDBACK & REVISIONS:
• Acknowledge receipt of feedback promptly.
• Clarify ambiguous feedback before starting revisions.
• Document all feedback in the project workspace for team visibility.

PRESENTATIONS & DESIGN REVIEWS:
• All design presentations must be reviewed by the Project Lead before being shown to the client.
• Do not share work-in-progress drawings or renders without sign-off.', true, now()),

('File Naming Conventions', 'Operations',
'Consistent file naming keeps our Drive organized and makes handoffs smooth.

STANDARD FORMAT:
[ProjectCode]_[Deliverable]_[Version]_[YYYYMMDD]

EXAMPLE:
FSA001_FloorPlan_v2_20260615.pdf

PROJECT CODES:
• Use FSA + 3-digit number (e.g., FSA001, FSA002) — find the code in the project workspace.

DELIVERABLE TYPES:
• FloorPlan, SitePlan, Elevation, Section, Perspective, 3DModel, BudgetEstimate, ContractDocs

VERSIONING:
• v1, v2, v3 — for major revisions shared with clients
• v1a, v1b — for internal iterations before sharing

FILE STORAGE:
• All project files go in the designated Google Drive folder linked in the project workspace.
• Follow the folder structure: /FS Architects > Projects > [Project Name] > [Phase or Deliverable]
• Do not save final deliverables on personal drives.
• Archive old versions in a /Archive subfolder — do not delete them.', true, now()),

('How to Use the Project Workspace', 'Projects',
'The Project Workspace is your central hub for everything related to an active project at FS Architects.

ACCESSING YOUR PROJECTS:
1. Go to Hub → My Projects.
2. Click on a project tile to open it.
3. Click "Open Workspace" to enter the full project workspace.

WHAT YOU CAN DO IN THE WORKSPACE:

Tasks:
• Click "+ Add Task" to create a new task.
• Click any task to open its detail panel — add comments, attachments, assignees, and dates.
• Update task status by clicking the circle icon: To Do → In Progress → Done.
• Assign tasks to one or more team members.

Timeline / Calendar:
• The calendar shows all tasks with due dates across the period.
• Tasks with a date range appear as bars spanning multiple days.
• Click a day to see what is due.

Comments & Collaboration:
• Leave comments in the task detail panel.
• @mention a teammate to send them a Slack DM notification automatically.

Files (Google Drive):
• If your admin has linked a Drive folder, it appears in the project header.
• Click "Open Drive" to access the full folder in your browser.

PHASES:
• Architectural projects are typically organized by phase: Schematic Design, Design Development, Construction Documents, and Construction Administration.
• Your PM will organize tasks by phase within the workspace.', true, now()),

('@Mentions in Task Comments', 'Projects',
'Tag teammates in task comments to notify them directly via Slack.

HOW TO MENTION:
1. Open a task in the workspace.
2. In the comment box, type @ followed by a teammate''s first name.
3. A dropdown will appear — click their name to select them.
4. Submit the comment.

WHAT HAPPENS:
• The mentioned person receives a Slack DM from the FS Bot with your comment and task context.
• They also receive an in-app notification in the bell icon.
• The mention appears highlighted in the comment thread.

BEST PRACTICES:
• Use @mentions when you need a specific person to take action or review something.
• Include what you need and any relevant deadline in your comment.
• Avoid @mentioning for non-urgent updates — use direct Slack messages instead.
• Check your notification bell regularly for mentions.', true, now()),

('Requesting Documents or Credentials', 'Operations',
'Use the Requests feature in the Hub to ask for documents, access, or credentials you need for your work.

HOW TO SUBMIT A REQUEST:
1. Go to Hub → Requests.
2. Click "New Request".
3. Select the request type:
   • Document Request — employment certificates, reference letters, contract copies
   • Credential Access — logins for client tools, design platforms, or internal systems
   • General — anything else that does not fit the above
4. Describe what you need and why.
5. Submit — HR and admin are notified automatically.

RESPONSE TIME:
• HR aims to respond within 1–2 business days.
• Urgent requests: message HR on Slack first, then file in the Hub for records.

CREDENTIAL HANDLING:
• Never share credentials outside the team.
• Use platform access only within the scope of your assigned project.
• Report lost access or suspicious activity to your PM immediately.', true, now()),

('Using Google Drive for Project Files', 'Projects',
'All FS Architects project files are stored in Google Drive, organized by project phase and deliverable.

FOLDER STRUCTURE:
FS Architects > Projects > [Project Name] > [Phase or Deliverable Type]

ACCESSING PROJECT FILES:
• The Google Drive folder linked to your project appears in the project workspace header.
• Click "Open Drive" to open the folder in your browser.

UPLOADING FILES:
• Upload deliverables to the correct project subfolder.
• Follow the file naming convention: [ProjectCode]_[Deliverable]_[Version]_[YYYYMMDD]
• Do not upload files directly to the root Projects folder — go into the specific project subfolder.

SHARING WITH CLIENTS:
• Share only specific files, never entire project folders.
• Use "View only" or "Comment" access unless the client needs to upload.
• Always confirm with your PM before sharing anything with a client.

PERMISSIONS:
• You will be granted access to the Drive folders for your assigned projects.
• If you cannot find a folder you need, submit a Credential/Document Request in the Hub.', true, now());
