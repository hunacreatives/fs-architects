import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_REFRESH_TOKEN')!;

const SENTRO_ROOT = '1fuX6nxXERGIizoVEJRORUmvlO-auezNt';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const NOTIFY_EMAIL = 'info@fsarchitects.ph';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@fsarchitects.ph';

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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// The application to the firm's inbox too (same look as the contact form's email), the applicant as reply-to and the
// résumé attached, so it arrives even when the Drive upload didn't.
async function emailInbox(a: {
  name: string; email: string; role: string; message: string; expectedRate?: string;
  resumeLink: string | null; portfolioLink: string | null;
  resume?: { filename: string; base64: string };
}) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;color:#666;width:110px">${label}</td><td style="padding:8px 0">${value}</td></tr>`;
  const link = (url: string, text: string) => `<a href="${esc(url)}" style="color:#1c2b3a">${text}</a>`;
  const html = `
      <style>
        .logo-dark { display: none; }
        @media (prefers-color-scheme: dark) { .logo-light { display: none !important; } .logo-dark { display: block !important; } }
        [data-ogsc] .logo-light { display: none !important; }
        [data-ogsc] .logo-dark { display: block !important; }
      </style>
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;padding:32px;margin:0">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
          <div style="background:#1c2b3a;padding:20px 24px;">
            <img class="logo-light" src="https://fsarchitects.ph/images/fs-architects-logo-white.png" alt="FS Architects" height="48" style="display:block;" />
            <img class="logo-dark" src="https://fsarchitects.ph/images/fs-architects-logo-horizontal.png" alt="FS Architects" height="48" style="display:none;" />
          </div>
          <div style="padding:24px;color:#1a1a1a">
            <p style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#999;margin:0 0 20px">New Job Application</p>
            <h2 style="margin:0 0 20px;font-size:20px">${esc(a.name)}</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
              ${row('Role', esc(a.role))}
              ${row('Email', esc(a.email))}
              ${a.expectedRate ? row('Expected rate', esc(a.expectedRate)) : ''}
              ${a.resumeLink ? row('Résumé', link(a.resumeLink, 'Open résumé')) : a.resume ? row('Résumé', 'Attached') : ''}
              ${a.portfolioLink ? row('Portfolio', link(a.portfolioLink, 'Open portfolio')) : ''}
            </table>
            <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(a.message)}</div>
            <p style="font-size:13px;color:#666;margin:20px 0 0">Also in the hub under ${link('https://fsarchitects.ph/hub/admin/applications', 'Applications')}.</p>
          </div>
          <div style="padding:16px 24px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af">
            Submitted via <a href="https://fsarchitects.ph/careers" style="color:#9ca3af;text-decoration:none">fsarchitects.ph/careers</a> · © ${new Date().getFullYear()} FS Architects
          </div>
        </div>
      </div>
    `;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [NOTIFY_EMAIL],
      reply_to: a.email,
      subject: `New application from ${a.name} — ${a.role}`,
      html,
      ...(a.resume ? { attachments: [{ filename: a.resume.filename, content: a.resume.base64 }] } : {}),
    }),
  });
  if (!res.ok) console.error('Application email failed:', res.status, await res.text());
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
    await emailInbox({
      name: name.trim(), email: email.trim().toLowerCase(), role: role.trim(), message: message.trim(),
      expectedRate: expected_rate?.trim() || undefined,
      resumeLink: finalResumeLink, portfolioLink: finalPortfolioLink,
      resume: resume_base64 && resume_filename ? { filename: resume_filename, base64: resume_base64 } : undefined,
    }).catch((err) => console.error('Application email failed:', err));

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
