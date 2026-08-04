import { corsHeaders, guardAdmin } from '../_shared/auth.ts';
import { driveServiceClient, getGoogleAccessToken, getOrCreateProjectFolderId } from '../_shared/drive.ts';

Deno.serve(async (req) => {
  const CORS = corsHeaders(req); // restrict CORS to allowlisted origins (W-23)
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const denied = await guardAdmin(req);
  if (denied) return denied;

  try {
    const { project_id, client_name, project_name, project_code } = await req.json();
    if (!project_id || !project_name) {
      return new Response(JSON.stringify({ error: 'project_id and project_name required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const token = await getGoogleAccessToken();
    const supabase = driveServiceClient();
    const { folderId, driveUrl } = await getOrCreateProjectFolderId(supabase, token, project_id, client_name ?? null, project_name, project_code || undefined);

    return new Response(JSON.stringify({ drive_url: driveUrl, folder_id: folderId }), {
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
