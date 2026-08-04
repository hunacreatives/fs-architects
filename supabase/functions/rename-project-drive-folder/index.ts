import { corsHeaders, guardAdmin } from '../_shared/auth.ts';
import { SENTRO_ROOT, createOrGetSharedFolder, driveServiceClient, getGoogleAccessToken, moveDriveFolder, renameDriveFolder } from '../_shared/drive.ts';

// Keeps a project's Drive folder name AND location in sync with its
// generated project_code (e.g. after a Project Type is assigned for the
// first time) — renames it to the code, and moves it directly under
// Projects/ if it's still nested under an old per-client subfolder. Safe to
// call whenever — Drive shareable links are ID-based, so neither operation
// ever breaks a bookmark someone already has.
Deno.serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const denied = await guardAdmin(req);
  if (denied) return denied;

  try {
    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const supabase = driveServiceClient();
    const { data: project } = await supabase.from('hub_projects').select('drive_url, project_code').eq('id', project_id).maybeSingle();
    const folderId = project?.drive_url?.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1];

    if (!folderId || !project?.project_code) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no drive_url or project_code yet' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const token = await getGoogleAccessToken();
    const projectsRootId = await createOrGetSharedFolder('Projects', SENTRO_ROOT, token);
    await moveDriveFolder(folderId, projectsRootId, token);
    await renameDriveFolder(folderId, project.project_code, token);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
