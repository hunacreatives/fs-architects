// Shared Google Drive helpers for FS Architects edge functions.
//
// Why this exists: `create-project-drive-folder` and `upload-to-drive` both need
// to resolve "the real Drive folder for project X" (creating it on first use).
// Centralizing that here means every caller sees the same folder, instead of two
// independently-maintained copies drifting apart.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Sentro OS root folder (Drive) — created during Drive integration setup.
export const SENTRO_ROOT = '1fuX6nxXERGIizoVEJRORUmvlO-auezNt';

export async function getGoogleAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('GOOGLE_REFRESH_TOKEN')!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('OAuth failed: ' + JSON.stringify(data));
  return data.access_token;
}

// Create-or-find a folder, sharing it "anyone with the link can view" on creation
// so the in-hub embeddedfolderview iframe renders without a Google sign-in prompt.
// Only for the Projects/{client}/{project} tree (and its subfolders) — the rest of
// upload-to-drive's internal folders (payroll, attendance, contractors, ...) must
// NOT be publicly link-shared, so they keep their own local, unshared helper.
export async function createOrGetSharedFolder(name: string, parentId: string, token: string): Promise<string> {
  const safe = name.replace(/['"\\]/g, '').trim();
  const search = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(safe)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const { files } = await search.json();
  if (files?.length > 0) return files[0].id;

  const create = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: safe, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const created = await create.json();
  if (!created.id) throw new Error(`Folder create failed: ${JSON.stringify(created)}`);

  const perm = await fetch(
    `https://www.googleapis.com/drive/v3/files/${created.id}/permissions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    },
  );
  if (!perm.ok) console.error('Set anyone-reader permission failed:', await perm.text());

  return created.id;
}

// Get the project's real Drive folder id, creating it directly under
// Projects/ (and backfilling hub_projects.drive_url) if it doesn't have one
// yet. Flat by design — no per-client subfolder layer — since every project
// now gets its own unique code (FS-{TYPE}-{YY}-{NNN}), a client-name folder
// is no longer needed to disambiguate projects from each other.
// `folderName` overrides the leaf folder's name (used to name it after the
// project's generated code instead of its project_name) — defaults to
// projectName for callers that don't have a code yet.
export async function getOrCreateProjectFolderId(
  supabase: SupabaseClient,
  token: string,
  projectId: number,
  clientName: string | null,
  projectName: string,
  folderName?: string,
): Promise<{ folderId: string; driveUrl: string }> {
  void clientName; // kept in the signature so existing callers don't need updating
  const { data: project } = await supabase.from('hub_projects').select('drive_url').eq('id', projectId).maybeSingle();
  const existing = project?.drive_url?.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1];
  if (existing) return { folderId: existing, driveUrl: project.drive_url as string };

  const projectsRootId = await createOrGetSharedFolder('Projects', SENTRO_ROOT, token);
  const folderId = await createOrGetSharedFolder(folderName || projectName, projectsRootId, token);
  const driveUrl = `https://drive.google.com/drive/folders/${folderId}`;

  await supabase.from('hub_projects').update({ drive_url: driveUrl }).eq('id', projectId);

  return { folderId, driveUrl };
}

// Move a file/folder to a new parent, removing all of its current parents.
export async function moveDriveFolder(fileId: string, newParentId: string, token: string): Promise<void> {
  const getRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { parents } = await getRes.json();
  const removeParents = (parents ?? []).join(',');
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}${removeParents ? `&removeParents=${removeParents}` : ''}`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive move failed: ${await res.text()}`);
}

// Rename an existing Drive file/folder in place. Safe with respect to
// sharing — Drive's shareable links are keyed by file ID, not name, so this
// never breaks a bookmark someone already has.
export async function renameDriveFolder(fileId: string, newName: string, token: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) throw new Error(`Drive rename failed: ${await res.text()}`);
}

// Get the project's "Task Attachments" subfolder id, cached on hub_projects
// so repeat uploads skip the Drive search entirely after the first one.
export async function getOrCreateTaskAttachmentsFolderId(
  supabase: SupabaseClient,
  token: string,
  projectId: number,
  projectFolderId: string,
): Promise<string> {
  const { data } = await supabase.from('hub_projects').select('task_attachments_folder_id').eq('id', projectId).maybeSingle();
  if (data?.task_attachments_folder_id) return data.task_attachments_folder_id as string;

  const folderId = await createOrGetSharedFolder('Task Attachments', projectFolderId, token);
  await supabase.from('hub_projects').update({ task_attachments_folder_id: folderId }).eq('id', projectId);
  return folderId;
}

export function driveServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}
