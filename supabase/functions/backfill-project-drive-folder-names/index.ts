import { corsHeaders, guardAdmin } from '../_shared/auth.ts';
import { SENTRO_ROOT, createOrGetSharedFolder, driveServiceClient, getGoogleAccessToken, moveDriveFolder, renameDriveFolder } from '../_shared/drive.ts';

// One-time bulk version of rename-project-drive-folder — walks every
// project with a Drive folder and a project_code, renaming/moving each
// folder to match. Safe to re-run: skips anything already in sync, so a
// partial run (rate limit, timeout) can just be triggered again.
Deno.serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const denied = await guardAdmin(req);
  if (denied) return denied;

  try {
    const supabase = driveServiceClient();
    const { data: projects, error } = await supabase
      .from('hub_projects')
      .select('id, drive_url, project_code')
      .not('drive_url', 'is', null)
      .not('project_code', 'is', null);

    if (error) throw error;

    const token = await getGoogleAccessToken();
    const projectsRootId = await createOrGetSharedFolder('Projects', SENTRO_ROOT, token);

    const renamed: number[] = [];
    const skipped: number[] = [];
    const failed: { id: number; error: string }[] = [];

    for (const project of projects ?? []) {
      const folderId = project.drive_url?.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1];
      if (!folderId || !project.project_code) { skipped.push(project.id); continue; }

      try {
        await moveDriveFolder(folderId, projectsRootId, token);
        await renameDriveFolder(folderId, project.project_code, token);
        renamed.push(project.id);
      } catch (err) {
        failed.push({ id: project.id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ ok: true, renamed: renamed.length, skipped: skipped.length, failed }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
