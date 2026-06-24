import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { guardAdmin } from '../_shared/auth.ts';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sentro OS root folder (Drive) — created during Drive integration setup
const SENTRO_ROOT = '1fuX6nxXERGIizoVEJRORUmvlO-auezNt';

async function getAccessToken(): Promise<string> {
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

async function createOrGetFolder(name: string, parentId: string, token: string): Promise<string> {
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

  // Share new folder as "Anyone with the link can view" so the in-hub
  // embeddedfolderview iframe renders without a Google sign-in prompt.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const denied = await guardAdmin(req);
  if (denied) return denied;

  try {
    const { project_id, client_name, project_name } = await req.json();
    if (!project_id || !project_name) {
      return new Response(JSON.stringify({ error: 'project_id and project_name required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const token = await getAccessToken();

    // Create or find  FS Root > Projects > ClientName > ProjectName
    const projectsRootId = await createOrGetFolder('Projects', SENTRO_ROOT, token);
    const clientFolderId = client_name
      ? await createOrGetFolder(client_name, projectsRootId, token)
      : projectsRootId;
    const projectFolderId = await createOrGetFolder(project_name, clientFolderId, token);

    const drive_url = `https://drive.google.com/drive/folders/${projectFolderId}`;

    // Patch the project row
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    await supabase.from('hub_projects').update({ drive_url }).eq('id', project_id);

    return new Response(JSON.stringify({ drive_url, folder_id: projectFolderId }), {
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
