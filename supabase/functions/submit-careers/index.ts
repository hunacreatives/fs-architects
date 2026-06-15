import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  folder: string,
  filename: string,
  mimeType: string,
  base64Content: string,
): Promise<string> {
  const bytes = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));
  const ext = filename.split('.').pop() ?? 'bin';
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('careers')
    .upload(path, bytes, { contentType: mimeType || 'application/octet-stream', upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('careers').getPublicUrl(path);
  return data.publicUrl;
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
    )
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

    // Upload resume to Supabase Storage
    let finalResumeLink = resume_link || null;
    if (resume_base64 && resume_filename) {
      try {
        finalResumeLink = await uploadToStorage(supabase, 'resumes', resume_filename, resume_mime || 'application/pdf', resume_base64);
      } catch (_) { /* upload failure is non-fatal — link stays null */ }
    }

    // Upload portfolio file if provided
    let finalPortfolioLink = portfolio_link?.trim() || null;
    if (portfolio_base64 && portfolio_filename) {
      try {
        finalPortfolioLink = await uploadToStorage(supabase, 'portfolios', portfolio_filename, portfolio_mime || 'application/pdf', portfolio_base64);
      } catch (_) { /* upload failure is non-fatal */ }
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
        resume_drive_file_id: null,
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
