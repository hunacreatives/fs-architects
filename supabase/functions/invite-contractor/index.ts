import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const ADMIN_SLACK_IDS = ['U091BL9PQ77', 'U0838LWSY4E'];
const FROM_EMAIL = 'onboarding@hunacreatives.com';

async function slackDm(userId: string, text: string) {
  if (!SLACK_BOT_TOKEN) return;
  const opened = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: userId }),
  });
  const openedJson = await opened.json();
  const channel = openedJson.ok ? openedJson.channel?.id : userId;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  });
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      email, full_name, role = 'contractor', department, start_date,
      payment_type, hourly_rate, monthly_rate, project_percentage, currency = 'PHP',
      shift_start, shift_end, work_days, slack_id,
    } = await req.json();

    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: 'email and full_name required' }), { status: 400, headers: cors });
    }

    // Check not already in hub_users
    const { data: existing } = await supabase
      .from('hub_users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: 'A contractor with this email already exists.' }), { status: 200, headers: cors });
    }

    // If a stale auth user exists (e.g. previously deleted from hub_users), remove it first
    const { data: { users: existingAuthUsers } } = await supabase.auth.admin.listUsers();
    const staleAuthUser = existingAuthUsers?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (staleAuthUser) {
      await supabase.auth.admin.deleteUser(staleAuthUser.id);
    }

    // Generate invite link (creates auth.users entry without sending Supabase's default email)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: email.toLowerCase(),
      options: { redirectTo: 'https://www.hunacreatives.com/hub/signup' },
    });

    if (linkErr || !linkData?.user) {
      return new Response(JSON.stringify({ error: linkErr?.message ?? 'Failed to generate invite link' }), { status: 200, headers: cors });
    }

    const inviteUrl = linkData.properties?.action_link;

    // Create hub_users row with the new auth user's UUID
    const { error: insertErr } = await supabase.from('hub_users').insert({
      id: linkData.user.id,
      email: email.toLowerCase(),
      full_name,
      role,
      status: 'active',
      department: department || null,
      start_date: start_date || null,
      payment_type: payment_type || null,
      hourly_rate: hourly_rate ? parseFloat(hourly_rate) : null,
      monthly_rate: monthly_rate ? parseFloat(monthly_rate) : null,
      project_percentage: project_percentage ? parseFloat(project_percentage) : null,
      currency,
      shift_start: shift_start || null,
      shift_end: shift_end || null,
      work_days: work_days || [],
      slack_id: slack_id || null,
    });

    if (insertErr) {
      await supabase.auth.admin.deleteUser(linkData.user.id);
      return new Response(JSON.stringify({ error: insertErr.message }), { status: 200, headers: cors });
    }

    // Send branded welcome email via Resend
    const firstName = full_name.split(' ')[0];
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:32px 40px;text-align:center;">
              <img src="https://www.hunacreatives.com/images/fc04818c74ad69bdfb22b93a6a0c6a72.png"
                   alt="Huna Creatives" height="32" style="display:block;margin:0 auto 16px;" />
              <p style="margin:0;color:#9ca3af;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">Welcome to the Team</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Hey ${firstName}! 👋</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                We're excited to have you on board at <strong style="color:#111827;">Huna Creatives</strong>.
                Your profile has been set up — you just need to create your password to access the team hub.
              </p>

              <!-- What's inside box -->
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
                <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">What's inside Huna Hub</p>
                <table cellpadding="0" cellspacing="0" width="100%">
                  ${[
                    ['🕐', 'Attendance tracking via Slack'],
                    ['💰', 'Your payslips and payouts'],
                    ['📋', 'SOPs and team announcements'],
                    ['📄', 'Contracts and documents'],
                  ].map(([emoji, text]) => `
                  <tr>
                    <td style="width:28px;vertical-align:top;padding-bottom:8px;font-size:15px;">${emoji}</td>
                    <td style="font-size:13px;color:#374151;padding-bottom:8px;">${text}</td>
                  </tr>`).join('')}
                </table>
              </div>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}"
                       style="display:inline-block;background:#FF6B35;color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
                      Set My Password →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">
                This link expires in 24 hours. If you didn't expect this email, you can safely ignore it.<br/>
                Questions? Reach out to your admin directly.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;">This email is not monitored. Do not reply directly — for concerns, email <a href="mailto:contact@hunacreatives.com" style="color:#9ca3af;">contact@hunacreatives.com</a></p>
              <p style="margin:0;font-size:11px;color:#d1d5db;">© ${new Date().getFullYear()} Huna Creatives · onboarding@hunacreatives.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Huna Creatives Onboarding <${FROM_EMAIL}>`,
        to: [email.toLowerCase()],
        subject: `Welcome to Huna Hub, ${firstName}! Set your password to get started`,
        html,
      }),
    });

    // Slack DM to admins
    const slackMsg = `👋 *New team member added*\n*${full_name}* has been invited to Sentro Hub as a contractor.\nThey'll receive a login link by email.\n<https://www.hunacreatives.com/hub/admin/contractors|View profile →>`;
    await Promise.all(ADMIN_SLACK_IDS.map(id => slackDm(id, slackMsg).catch(() => {})));

    return new Response(JSON.stringify({ ok: true, user_id: linkData.user.id }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 200, headers: cors });
  }
});
