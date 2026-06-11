-- SOP update — reflects task detail panel, push notifications, Drive for task attachments

-- 1. Project Workspace — updated for task detail panel, new statuses, checklist, attachments, watchers
update hub_sops set
  content = 'The Project Workspace is your central hub for everything related to a specific project.

ACCESSING THE WORKSPACE:
1. Go to Hub → My Projects.
2. Click on a project tile to open it.
3. Click "Open Workspace" to enter the full workspace.

TASK LIST:
• Tasks are grouped by status: Overdue, In Progress, To Do, Done.
• Click the status icon on a task card to quickly cycle its status.
• Click anywhere else on a task card to open the full Task Detail Panel.

TASK STATUSES:
• To Do — not started yet
• In Progress — actively being worked on
• In Review — work is done, waiting for feedback or approval
• Blocked — cannot proceed due to a dependency or issue
• Done — completed

TASK DETAIL PANEL:
When you click a task, a panel slides in from the right showing:
• Title, status, priority, assignee, start date, due date
• Watchers — toggle team members who should be notified when this task changes
• Description — full notes or context for the task
• Checklist — break the task into smaller steps; each item can be checked off
• Attachments — upload files or images directly to the task (stored in Google Drive)
• Comments — leave updates or questions; @mention a teammate to notify them
• Activity log — automatic record of every status change, assignment, and comment

ADDING A TASK:
1. Click "+ Add Task" in the task section header.
2. Fill in the title, status, priority, assignee, and dates in the panel.
3. Click "Create Task".

EDITING A TASK:
1. Click the task card to open the detail panel.
2. Click the edit (pencil) icon in the panel header.
3. Make your changes and click "Save Changes".

CHECKLIST:
• In the task panel, type an item in the checklist field and press Enter or click "Add".
• Click the circle icon next to an item to mark it done.
• A progress bar tracks completion percentage.

ATTACHMENTS:
• Click "Upload" in the Attachments section of the task panel.
• Files are automatically saved to Google Drive under Task Attachments / [Project Name].
• Click a file name to open it directly in Google Drive.

WATCHERS:
• In the task panel, click team member names in the Watchers section to toggle them on or off.
• Watchers receive push notifications and Slack messages when the task is updated.

TIMELINE / CALENDAR:
• The calendar shows all tasks with due dates.
• Click a day to see tasks due on that date.
• Tasks with a date range appear as bars across multiple days.

COMMENTS & @MENTIONS:
• Leave comments at the bottom of the task panel.
• Type @ followed by a teammate''s first name to mention them.
• They will receive a push notification and a Slack DM.

SEARCH:
• Use the Search bar in the workspace header to find sections (Timeline, Tasks, etc.).
• Searching a section name focuses the workspace on that section only.',
  updated_at = now()
where title = 'How to Use the Project Workspace';


-- 2. @Mentions — add push notification alongside Slack
update hub_sops set
  content = 'You can tag teammates in comments to notify them directly.

HOW TO MENTION:
1. Open a task by clicking on it in the workspace.
2. In the comment box at the bottom of the task panel, type @ followed by a teammate''s first name.
3. A dropdown will appear — click their name to insert the mention.
4. Press Enter or click the send button.

WHAT HAPPENS:
• The mentioned person receives a push notification on their phone (if they have the Hub installed and notifications enabled).
• They also receive a Slack DM from the Huna Bot with your comment.
• The mention appears highlighted in orange in the comment thread.
• An in-app notification also appears in the bell icon.

BEST PRACTICES:
• Use @mentions when you need a specific person to take action or respond.
• Keep your message clear — include what you need and by when.
• Do not spam @mentions for non-urgent updates.
• Check your notification bell regularly for mentions directed at you.',
  updated_at = now()
where title = '@Mentions in Task Comments';


-- 3. Installing Sentro Hub — add push notification step
update hub_sops set
  content = 'Sentro Hub is a Progressive Web App (PWA) — you can install it on your phone or desktop like a native app. No App Store needed.

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

ENABLING PUSH NOTIFICATIONS:
• After installing and logging in, the Hub will ask for permission to send notifications.
• Tap "Allow" when prompted.
• Once allowed, you will receive real-time push notifications for:
  - Payslip approvals and disputes
  - Task assignments and due date reminders
  - Time-off decisions
  - @mentions in task comments
  - Payroll updates
• If you missed the prompt, go to your phone Settings → Safari / Chrome → Notifications and enable them for hunacreatives.com.

NOTES:
• The app opens directly to the Hub — no browser chrome, no URL bar.
• You will need to log in once after installing.
• iOS requires version 16.4 or later for push notifications to work.',
  updated_at = now()
where title = 'Installing Sentro Hub on Your Phone';


-- 4. Google Drive SOP — add task attachments section
update hub_sops set
  content = 'All project files are stored in the Huna Creatives Google Drive folder, organized by client and project.

FOLDER STRUCTURE:
Sentro OS Drive > [Section] > [Subfolder]

Examples:
• Sentro OS Drive > Task Attachments > [Project Name] > [file]
• Sentro OS Drive > Payroll 2026 > Receipts > [file]
• Sentro OS Drive > Clients Active > [file]

ACCESSING PROJECT FILES:
• The Google Drive folder linked to your project appears in the project workspace header.
• Click "Open Drive" to open the full folder in your browser.

TASK ATTACHMENTS:
• When you upload a file to a task in the Project Workspace, it is automatically saved to Google Drive.
• Files go to: Sentro OS Drive > Task Attachments > [Project Name] > [file]
• You do not need to manually upload to Drive — the Hub does it for you.
• Click the file name in the task panel to open it directly in Google Drive.

UPLOADING PROJECT DELIVERABLES:
• Upload deliverables directly to the relevant Google Drive project folder.
• Follow the file naming convention: [ProjectCode]_[Deliverable]_[Version]_[YYYYMMDD]
• Do not upload files to the root level — always go into the specific project subfolder.

SHARING:
• Share files from Google Drive using the "Share" button with view or comment access.
• Do not share entire client folders externally — only share specific files as needed.
• Always check with your PM before sharing anything with a client directly.

PERMISSIONS:
• You will be granted access to the Drive folders relevant to your projects.
• If you need access to a folder you cannot see, submit a Credential/Document Request in the Hub.',
  updated_at = now()
where title = 'Using Google Drive for Project Files';


-- 5. Getting Started — update Step 2 to mention notifications
update hub_sops set
  content = 'Welcome to Sentro Hub — your workspace for projects, attendance, payroll, and team communication at Huna Creatives.

STEP 1 — LOG IN:
• Go to www.hunacreatives.com/hub/login using the email and password from your invite.
• If you have not received an invite, contact HR.

STEP 2 — INSTALL ON YOUR PHONE (recommended):
• Add the Hub to your home screen as an app. See the "Installing Sentro Hub on Your Phone" SOP for instructions.
• When prompted, tap "Allow" for push notifications — this is how you get real-time alerts for tasks, payslips, and approvals.

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
• My Projects — all projects you are assigned to, with tasks, files, and comments
• My Payouts — your payslips, submission, and payment history
• Time Off — submit and track leave requests
• Overtime — log and track overtime hours
• Documents — contracts and documents to sign

NEED HELP?
• Message HR or your PM on Slack.
• Check the SOPs section in the Hub for step-by-step guides.',
  updated_at = now()
where title = 'Getting Started with Sentro Hub';
