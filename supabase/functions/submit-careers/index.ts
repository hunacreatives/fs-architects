import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_REFRESH_TOKEN')!;

const SENTRO_ROOT = '1fuX6nxXERGIizoVEJRORUmvlO-auezNt';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get Google access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function createOrGetFolder(name: string, parentId: string, accessToken: string): Promise<string> {
  const safeName = name.replace(/['"\\]/g, '');
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${safeName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const searchData = await searchRes.json();
  if (searchData.files?.length > 0) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: safeName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const createData = await createRes.json();
  if (!createData.id) throw new Error(`Failed to create folder "${safeName}": ${JSON.stringify(createData)}`);
  return createData.id;
}

async function uploadToDrive(
  filename: string,
  mimeType: string,
  base64Content: string,
  folderId: string,
  accessToken: string,
): Promise<{ fileId: string; url: string }> {
  const fileBytes = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  const boundary = 'careers_boundary';
  const enc = new TextEncoder();
  const part1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`);
  const part2 = enc.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const part3 = enc.encode(`\r\n--${boundary}--`);

  const combined = new Uint8Array(part1.length + part2.length + fileBytes.length + part3.length);
  combined.set(part1, 0);
  combined.set(part2, part1.length);
  combined.set(fileBytes, part1.length + part2.length);
  combined.set(part3, part1.length + part2.length + fileBytes.length);

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: combined,
  });

  const result = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(`Drive upload failed: ${JSON.stringify(result)}`);

  // Make file publicly viewable so the link works without sign-in
  await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return { fileId: result.id, url: `https://drive.google.com/file/d/${result.id}/view` };
}

async function notifyAdmins(
  supabase: ReturnType<typeof createClient>,
  applicantName: string,
  role: string,
) {
  const { data: admins } = await supabase
    .from('hub_users')
    .select('id')
    .in('role', ['admin', 'owner', 'hr'])
    .eq('status', 'active');

  if (!admins?.length) return;

  await supabase.from('hub_notifications').insert(
    admins.map((admin: { id: string }) => ({
      user_id: admin.id,
      type: 'job_application',
      title: 'New job application',
      body: `${applicantName} applied for ${role}.`,
      link: '/hub/admin/applications',
    })),
  );

  await Promise.allSettled(
    admins.map((admin: { id: string }) =>
      fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: admin.id,
          title: 'New job application',
          body: `${applicantName} applied for ${role}.`,
          url: 'https://fsarchitects.ph/hub/admin/applications',
        }),
      })
    ),
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const {
      name, email, role, job_id, expected_rate,
      portfolio_link,
      portfolio_base64, portfolio_filename, portfolio_mime,
      resume_link,
      resume_filename, resume_base64, resume_mime,
      message,
    } = await req.json();

    if (!name || !email || !role || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: cors });
    }

    const hasResume = !!(resume_base64 || resume_link?.trim());
    if (!hasResume) {
      return new Response(JSON.stringify({ error: 'A resume is required to apply.' }), { status: 400, headers: cors });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Upload files to Google Drive
    let finalResumeLink = resume_link?.trim() || null;
    let resumeDriveFileId: string | null = null;
    let finalPortfolioLink = portfolio_link?.trim() || null;

    if (resume_base64 && resume_filename) {
      try {
        const year = String(new Date().getFullYear());
        const accessToken = await getAccessToken();
        const careersFolder = await createOrGetFolder('Careers', SENTRO_ROOT, accessToken);
        const yearFolder = await createOrGetFolder(year, careersFolder, accessToken);
        const resumesFolder = await createOrGetFolder('Resumes', yearFolder, accessToken);
        const { fileId, url } = await uploadToDrive(resume_filename, resume_mime || 'application/pdf', resume_base64, resumesFolder, accessToken);
        finalResumeLink = url;
        resumeDriveFileId = fileId;
      } catch (err) {
        console.error('Resume Drive upload failed:', err);
        // non-fatal — link stays null
      }
    }

    if (portfolio_base64 && portfolio_filename) {
      try {
        const year = String(new Date().getFullYear());
        const accessToken = await getAccessToken();
        const careersFolder = await createOrGetFolder('Careers', SENTRO_ROOT, accessToken);
        const yearFolder = await createOrGetFolder(year, careersFolder, accessToken);
        const portfoliosFolder = await createOrGetFolder('Portfolios', yearFolder, accessToken);
        const { url } = await uploadToDrive(portfolio_filename, portfolio_mime || 'application/pdf', portfolio_base64, portfoliosFolder, accessToken);
        finalPortfolioLink = url;
      } catch (err) {
        console.error('Portfolio Drive upload failed:', err);
        // non-fatal
      }
    }

    const { error: insertError } = await supabase
      .from('hub_job_applications')
      .insert({
        job_id: job_id || null,
        role: role.trim(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        expected_rate: expected_rate?.trim() || '',
        portfolio_link: finalPortfolioLink,
        resume_link: finalResumeLink,
        resume_filename: resume_filename || null,
        resume_drive_file_id: resumeDriveFileId,
        message: message.trim(),
        source: 'careers_site',
      });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: cors });
    }

    await notifyAdmins(supabase, name.trim(), role.trim()).catch(() => {});

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
