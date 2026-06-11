import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = 'hr@hunacreatives.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function buildSignedHtml(content: string, signedName: string, signedAt: string): string {
  const dateLabel = new Date(signedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  let result = content.replace(
    '</head>',
    `<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" rel="stylesheet"></head>`
  );

  return result
    .replace(
      /<div style="height:44pt;margin-top:16pt;border-bottom:1pt solid #111;"><\/div>\s*<p class="sig-label" style="margin-top:4pt;">Signature<\/p>/,
      `<div style="height:44pt;margin-top:16pt;display:flex;align-items:flex-end;padding-bottom:4pt;">
        <p style="font-family:'Dancing Script',cursive;font-size:26pt;color:#111;margin:0;line-height:1;">${signedName}</p>
       </div>`
    )
    .replace(
      /(<p class="sig-label">)([^<]+ &nbsp;\|&nbsp; Date)(<\/p>)(?![\s\S]*<p class="sig-label">Francis)/,
      `$1${signedName} &nbsp;|&nbsp; ${dateLabel}$3`
    );
}

async function run(assignment_id: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Fetch assignment + document + contractor
  const { data: assignment, error: aErr } = await supabase
    .from('hub_sign_assignments')
    .select('*, hub_sign_documents(title, content, file_url, file_name, is_generated), hub_users!contractor_id(full_name, email)')
    .eq('id', assignment_id)
    .single();

  if (aErr || !assignment) {
    console.error('Assignment not found:', aErr);
    return;
  }

  const contractor = (assignment as any).hub_users;
  const doc = (assignment as any).hub_sign_documents;

  if (!contractor?.email) {
    console.error('Contractor has no email');
    return;
  }

  if (!assignment.signed_name || !assignment.signed_at) {
    console.error('Assignment not signed yet');
    return;
  }

  const dateLabel = new Date(assignment.signed_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  // Build the signed HTML if this is a generated contract
  let signedHtmlAttachment: string | null = null;
  if (doc?.is_generated && doc?.content) {
    signedHtmlAttachment = buildSignedHtml(doc.content, assignment.signed_name, assignment.signed_at);
  }

  const contractLink = doc?.is_generated ? null : doc?.file_url;

  const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <div style="background:#111827;padding:28px 36px;">
      <p style="color:#FF6B35;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">Huna Creatives</p>
      <h1 style="color:#fff;font-size:24px;font-weight:800;margin:0;">Contract Signed ✓</h1>
      <p style="color:#9ca3af;font-size:13px;margin:6px 0 0;">Your signed copy is attached to this email.</p>
    </div>

    <div style="padding:32px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${contractor.full_name.split(' ')[0]}</strong>,</p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
        This email confirms that you have successfully signed the following document:
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
        <p style="font-size:15px;font-weight:700;color:#111827;margin:0 0 6px;">${doc?.title}</p>
        <p style="font-size:13px;color:#6b7280;margin:0;">Signed as: <strong style="color:#374151;">${assignment.signed_name}</strong></p>
        <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Date: <strong style="color:#374151;">${dateLabel}</strong></p>
      </div>
      <p style="font-size:13px;color:#6b7280;line-height:1.7;margin:0;">
        ${signedHtmlAttachment
          ? 'Your signed copy is attached as an HTML file. Open it in any browser to view or print.'
          : contractLink
            ? `You can view the original document <a href="${contractLink}" style="color:#FF6B35;">here</a>.`
            : 'Please keep this email for your records.'}
      </p>
    </div>

    <div style="padding:24px 36px;background:#fafafa;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;line-height:1.6;">
        If you have any questions about this agreement, please reach out to HR on Slack or reply to this email.
      </p>
      <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">This email is not monitored. Do not reply directly — for concerns, email <a href="mailto:contact@hunacreatives.com" style="color:#9ca3af;">contact@hunacreatives.com</a></p>
      <p style="font-size:11px;color:#d1d5db;margin:0;">© ${new Date().getFullYear()} Huna Creatives · hr@hunacreatives.com</p>
    </div>

  </div>
</body>
</html>`;

  const payload: any = {
    from: `Huna Creatives HR <${FROM_EMAIL}>`,
    to: contractor.email,
    subject: `Your signed copy — ${doc?.title}`,
    html: emailHtml,
  };

  if (signedHtmlAttachment) {
    payload.attachments = [{
      filename: `${doc.title.replace(/[^a-zA-Z0-9 _-]/g, '')}.html`,
      content: btoa(unescape(encodeURIComponent(signedHtmlAttachment))),
    }];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  if (!res.ok) {
    console.error('Resend error:', JSON.stringify(result));
  } else {
    console.log('Signed contract email sent:', result.id, '→', contractor.email);
  }

  // Auto-upload signed contract to Google Drive
  const supabaseForDrive = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  supabaseForDrive.functions.invoke('sync-contract-to-drive', { body: { assignment_id } }).catch((e: unknown) => {
    console.error('Drive upload error:', e);
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { assignment_id } = await req.json();
    if (!assignment_id) return new Response(JSON.stringify({ error: 'assignment_id required' }), { status: 400, headers: cors });

    // @ts-ignore
    EdgeRuntime.waitUntil(run(assignment_id));

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
