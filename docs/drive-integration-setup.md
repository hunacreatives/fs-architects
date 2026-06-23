# FS Architects Hub — Google Drive Integration Setup

**Goal:** Wire the FS Architects hub's file uploads to FS Architects' *own* Google
Drive, instead of Huna Creatives' Drive (which the copied code currently points at).

**This is a configuration/migration task, not a build.** All the code already
exists in this repo. The only real work is: create FS's Drive folders, swap the
hardcoded Huna folder IDs for FS's, set the Google OAuth secrets on FS's Supabase
project, and deploy.

---

## Current state (verified)

What's already in this repo and working at the code level:

- `src/lib/driveUpload.ts` — client helper `uploadFileToDrive(file, type, meta)`
- `src/lib/taskAttachments.ts` — wraps it for task attachments
- `supabase/functions/upload-to-drive/index.ts` — the central uploader
- `supabase/functions/delete-from-drive/index.ts` — deletes a file by ID
- `supabase/functions/sync-contract-to-drive/index.ts` — contract sync
- Frontend call sites: `admin/projects`, `admin/payroll`, `admin/attendance`,
  `components/TaskDetailPanel` (task attachments), `employee/projects`

**The problem — `supabase/functions/upload-to-drive/index.ts` still contains
Huna's Drive identifiers:**

```
SENTRO_ROOT = '1XQzc0U_pQrhCtivjR4SsgE_WTG9DpvYd'   // Huna's root folder
FOLDERS = { attendance_weekly: '1U-pv4ha…', invoices_2025: '1jz5FDLT…', … }  // 13 Huna folder IDs
```

These must all be replaced with FS Architects' folder IDs.

**Not yet ported:** `create-project-drive-folder` (the per-project Drive folder
feature). The hub references `drive_url` on projects but nothing creates those
folders yet. Porting it is **optional** — see Part D.

**Project refs:**
- FS Architects Supabase: `yerjcnxyjlmtimvuufch`
- Huna (reference only — do NOT deploy here): `aaqpwobmfofztcbbsonw`

---

## STEP 0 — Decision: which Google account? → **DECIDED: Option B**

We have direct access to **FS Architects' own Google account**, and that's the
Drive they want to use. So everything (root folder, subfolders, OAuth app, refresh
token) is created **signed in as FS Architects' Google account**. FS owns all
their files. **Part A.2 is required.** Do NOT reuse Huna's `GOOGLE_*` credentials.

<details><summary>(Rejected alternative — Option A, same account as Huna)</summary>

Reuse Huna's OAuth app + a new root folder. Simpler but FS's files would live in
Huna's Google account. Not chosen because we have FS's own account.
</details>

---

## PART A — Google Drive side

### A.1 — Create the folder structure

In the chosen Google account's Drive, create this tree. Mirror Huna's layout so
the `type → folder` routing in the edge function maps cleanly:

```
FS Architects OS/                 ← root (this is the new SENTRO_ROOT replacement)
├── Attendance Reports/
│   ├── Weekly/
│   ├── Monthly/
│   └── Yearly/
├── Invoices/
│   ├── 2025/
│   └── 2026/
├── Payroll/
│   ├── 2025/
│   └── 2026/
├── Team/                         ← "Contractors" in Huna; rename to fit FS terminology
│   ├── Agreements/
│   ├── IDs/
│   └── Rates/
└── Clients/
    ├── Active/
    └── Completed/
```

Subfolders that the code creates on-demand (do NOT pre-create, but know they'll
appear): `Task Attachments/{project}`, `Payroll/{year}/Receipts`,
`Clients/Active/Payment Proofs/{year}`, `Careers/{year}`,
`Client Questionnaires/{client}`, and (if Part D) `Projects/{client}/{project}`.

### A.2 — OAuth app + refresh token (required — FS's account)

Do all of this **signed in as the FS Architects Google account.**

1. Google Cloud Console → new project (or existing FS project) → enable
   **Google Drive API**.
2. **APIs & Services → Credentials → Create OAuth client ID → Web application.**
   Add `https://developers.google.com/oauthplayground` as an authorized redirect
   URI. Save the **Client ID** and **Client secret**.
3. Go to **OAuth Playground** (developers.google.com/oauthplayground) → gear icon
   → check "Use your own OAuth credentials" → paste Client ID + secret.
4. Authorize scope `https://www.googleapis.com/auth/drive`. Sign in as the FS
   Architects Google account. Exchange the code → copy the **refresh token**.

### A.3 — Collect the folder IDs

For each folder created in A.1, open it in Drive and copy the ID from the URL:
`https://drive.google.com/drive/folders/<THIS_IS_THE_ID>`. Record them:

| Folder | ID |
|---|---|
| FS Architects OS (root) | `FILL_ME` |
| Attendance / Weekly | `FILL_ME` |
| Attendance / Monthly | `FILL_ME` |
| Attendance / Yearly | `FILL_ME` |
| Invoices / 2025 | `FILL_ME` |
| Invoices / 2026 | `FILL_ME` |
| Payroll / 2025 | `FILL_ME` |
| Payroll / 2026 | `FILL_ME` |
| Team / Agreements | `FILL_ME` |
| Team / IDs | `FILL_ME` |
| Team / Rates | `FILL_ME` |
| Clients / Active | `FILL_ME` |
| Clients / Completed | `FILL_ME` |

---

## PART B — Code change (the only file to edit)

Edit `supabase/functions/upload-to-drive/index.ts`. Replace the root constant and
the `FOLDERS` map with the IDs from A.3. **Change nothing else** — the routing
logic, multipart upload, and `ensureReadablePreview` all stay identical.

```ts
// ── Root FS Architects Drive folder ──────────────────────────────────────────
const SENTRO_ROOT = '<FS_ARCHITECTS_OS_ROOT_ID>';

const FOLDERS = {
  attendance_weekly:       '<FS_ATTENDANCE_WEEKLY_ID>',
  attendance_monthly:      '<FS_ATTENDANCE_MONTHLY_ID>',
  attendance_yearly:       '<FS_ATTENDANCE_YEARLY_ID>',
  invoices_2025:           '<FS_INVOICES_2025_ID>',
  invoices_2026:           '<FS_INVOICES_2026_ID>',
  payroll_2025:            '<FS_PAYROLL_2025_ID>',
  payroll_2026:            '<FS_PAYROLL_2026_ID>',
  contractors_agreements:  '<FS_TEAM_AGREEMENTS_ID>',
  contractors_ids:         '<FS_TEAM_IDS_ID>',
  contractors_rates:       '<FS_TEAM_RATES_ID>',
  clients_active:          '<FS_CLIENTS_ACTIVE_ID>',
  clients_completed:       '<FS_CLIENTS_COMPLETED_ID>',
};
```

> Optional cleanup: rename `SENTRO_ROOT` → `FS_ROOT` for clarity. If you do,
> update both references in this file (`upload-to-drive/index.ts`) — there are
> two (`Task Attachments` and `Careers` folder lookups). No other file uses it.

If you ported `create-project-drive-folder` (Part D), it also hardcodes
`SENTRO_ROOT` — update it there too.

---

## PART C — Supabase secrets (FS project)

Set these on the FS Architects Supabase project (`yerjcnxyjlmtimvuufch`):

```bash
supabase secrets set GOOGLE_CLIENT_ID="<...>" --project-ref yerjcnxyjlmtimvuufch
supabase secrets set GOOGLE_CLIENT_SECRET="<...>" --project-ref yerjcnxyjlmtimvuufch
supabase secrets set GOOGLE_REFRESH_TOKEN="<...>" --project-ref yerjcnxyjlmtimvuufch
# CORS lock-down (also used by all other edge functions):
supabase secrets set ALLOWED_ORIGIN="https://<fs-architects-production-domain>" --project-ref yerjcnxyjlmtimvuufch
```

Use the **new values from A.2** (FS's own OAuth app + refresh token). Do not copy
Huna's credentials.

> Do not paste real secret values into this file, commits, or chat. Set them via
> the CLI or the Supabase Dashboard Secrets UI only.

---

## PART D — (Optional) Port per-project Drive folders

Only if FS wants an auto-created Drive folder per project (the `drive_url` the hub
already shows). Source: Huna's
`/Users/francisfielroble/Huna-Creatives/supabase/functions/create-project-drive-folder/index.ts`.

1. Copy that file to `supabase/functions/create-project-drive-folder/index.ts` here.
2. Replace its `SENTRO_ROOT` with the FS root ID from A.3.
3. Confirm the FS `hub_projects` table has a `drive_url` column (the hub reads it).
   Add a migration if missing: `alter table hub_projects add column if not exists drive_url text;`
4. Find where Huna invokes it (admin project create flow) and replicate that
   call in FS's `src/pages/hub/admin/projects/page.tsx`.
5. Deploy it (Part E).

---

## PART E — Deploy & verify

```bash
cd /Users/francisfielroble/fs-architects

# Deploy the Drive functions to FS's project
supabase functions deploy upload-to-drive   --project-ref yerjcnxyjlmtimvuufch
supabase functions deploy delete-from-drive  --project-ref yerjcnxyjlmtimvuufch
# (and create-project-drive-folder if Part D was done)

# Type-check the frontend
npx tsc --noEmit
```

### Verification checklist

- [ ] In the FS hub, open a project task → attach a small image. It uploads with
      no error and the thumbnail renders.
- [ ] Check FS's Drive: the file landed in `FS Architects OS/Task Attachments/{project}`,
      **not** in Huna's Drive.
- [ ] The attachment link opens without a Google sign-in prompt (anyone-with-link
      reader permission is set by `ensureReadablePreview`).
- [ ] Delete that attachment in the hub → confirm it's removed from Drive.
- [ ] Upload a payout receipt (admin → projects/payroll) → lands in
      `Payroll/{year}/Receipts`.
- [ ] Run an attendance PDF export → lands in `Attendance Reports/Monthly` (or the
      matching period).
- [ ] Sanity check the edge function logs in Supabase for any
      `Unknown upload type` or `Failed to get access token` errors.

### Common failure modes

- **`Failed to get access token`** → the `GOOGLE_*` secrets are missing/wrong on
  the FS project, or (Option B) the refresh token was generated against a
  different client ID/secret.
- **Files land in Huna's Drive** → Part B wasn't applied, or the function wasn't
  redeployed after editing.
- **`File not found` / 404 on upload** → a folder ID in `FOLDERS` is wrong or the
  folder isn't owned by / shared with the OAuth account.
- **CORS error in browser** → `ALLOWED_ORIGIN` doesn't match the FS production
  domain (or is unset and defaulting to `*` but blocked elsewhere).

---

## One-line summary for the executing agent

> In `/Users/francisfielroble/fs-architects`, replace the Huna `SENTRO_ROOT` and
> `FOLDERS` IDs in `supabase/functions/upload-to-drive/index.ts` with FS
> Architects' own Drive folder IDs (create the folder tree first), set the
> `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` and `ALLOWED_ORIGIN` secrets on Supabase
> project `yerjcnxyjlmtimvuufch`, deploy `upload-to-drive` + `delete-from-drive`,
> then verify a task-attachment upload lands in FS's Drive.
