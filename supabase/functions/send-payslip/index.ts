import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, guardAdmin } from '../_shared/auth.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'payroll@fsarchitects.ph';


function fmt(val: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(val);
}

// ── Google Drive helpers ──────────────────────────────────────────────────────
const PAYROLL_ROOT_2026 = '1ap7c1LGWtvT9wm4IDfeq9C5tm4zs0GWr';
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

async function getDriveToken(): Promise<string> {
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
  if (!data.access_token) throw new Error('Drive token failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function ensureFolder(name: string, parentId: string, token: string): Promise<string> {
  const safe = name.replace(/['"\\]/g, '');
  const search = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const sd = await search.json();
  if (sd.files?.length > 0) return sd.files[0].id;
  const create = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: safe, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const cd = await create.json();
  if (!cd.id) throw new Error(`Folder create failed "${safe}": ${JSON.stringify(cd)}`);
  return cd.id;
}

// Saves payslip as a PDF under Payroll / {year} / {Month} / {EmployeeName} / {periodLabel}.pdf
// Flow: upload HTML → Google Doc (free conversion) → export as PDF → save PDF → delete temp Doc.
async function saveToDrive(html: string, employeeName: string, periodLabel: string, cutoffStart: string) {
  const token = await getDriveToken();
  const year = cutoffStart.slice(0, 4);
  const monthIdx = parseInt(cutoffStart.slice(5, 7), 10) - 1;
  const monthName = FULL_MONTHS[monthIdx] ?? cutoffStart.slice(0, 7);

  // Payroll root → year → Month → EmployeeName
  const yearRoot    = year === '2026' ? PAYROLL_ROOT_2026 : await ensureFolder(year, PAYROLL_ROOT_2026, token);
  const monthFolder = await ensureFolder(monthName, yearRoot, token);
  const empFolder   = await ensureFolder(employeeName, monthFolder, token);

  const encoder = new TextEncoder();
  const fileBytes = encoder.encode(html);
  const boundary = 'payslip_boundary';

  // Step 1: upload HTML → temporary Google Doc (Drive converts on import)
  const metadata = JSON.stringify({ name: `_tmp_${periodLabel}`, mimeType: 'application/vnd.google-apps.document', parents: [empFolder] });
  const part1 = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`);
  const part2 = encoder.encode(`--${boundary}\r\nContent-Type: text/html\r\n\r\n`);
  const end   = encoder.encode(`\r\n--${boundary}--`);
  const body  = new Uint8Array(part1.length + part2.length + fileBytes.length + end.length);
  body.set(part1, 0);
  body.set(part2, part1.length);
  body.set(fileBytes, part1.length + part2.length);
  body.set(end, part1.length + part2.length + fileBytes.length);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const uploaded = await uploadRes.json();
  if (!uploadRes.ok || !uploaded.id) throw new Error('Doc upload failed: ' + JSON.stringify(uploaded));
  const docId = uploaded.id;

  try {
    // Step 2: export Google Doc → PDF bytes
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=application/pdf`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!exportRes.ok) throw new Error('PDF export failed: ' + exportRes.status);
    const pdfBytes = new Uint8Array(await exportRes.arrayBuffer());

    // Step 3: upload the PDF to the employee folder
    const pdfMeta = JSON.stringify({ name: `${periodLabel}.pdf`, parents: [empFolder] });
    const pm1 = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${pdfMeta}\r\n`);
    const pm2 = encoder.encode(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
    const pdfBody = new Uint8Array(pm1.length + pm2.length + pdfBytes.length + end.length);
    pdfBody.set(pm1, 0);
    pdfBody.set(pm2, pm1.length);
    pdfBody.set(pdfBytes, pm1.length + pm2.length);
    pdfBody.set(end, pm1.length + pm2.length + pdfBytes.length);

    const pdfRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: pdfBody,
      },
    );
    const pdfResult = await pdfRes.json();
    if (!pdfRes.ok) throw new Error('PDF upload failed: ' + JSON.stringify(pdfResult));
    console.log('Payslip PDF saved to Drive:', pdfResult.id, employeeName, periodLabel);
  } finally {
    // Step 4: delete the temporary Google Doc regardless of outcome
    await fetch(`https://www.googleapis.com/drive/v3/files/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {/* non-fatal */});
  }
}

async function sendPayslip(payout_id: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: payout, error: payoutErr } = await supabase
    .from('hub_payouts')
    .select('*')
    .eq('id', payout_id)
    .single();

  if (payoutErr || !payout) { console.error('payout not found:', payoutErr); return; }

  const { data: contractor, error: contractorErr } = await supabase
    .from('hub_users')
    .select('id, full_name, email, payment_type, hourly_rate, monthly_rate, department, currency, slack_id, employee_id')
    .eq('id', payout.contractor_id)
    .single();

  if (contractorErr || !contractor) { console.error('contractor not found:', contractorErr); return; }
  if (!contractor.email) { console.error('contractor has no email:', contractor.id); return; }

  console.log('Sending payslip to:', contractor.email, 'payout:', payout_id);

  const { data: dailyHours } = await supabase
    .from('hub_daily_hours')
    .select('date, hours_capped, overtime_hours, first_on')
    .eq('user_id', contractor.id)
    .gte('date', payout.cutoff_start)
    .lte('date', payout.cutoff_end)
    .order('date');

  const totalHours = (dailyHours || []).reduce((s: number, d: any) => s + (d.hours_capped || 0), 0);
  const totalOT = (dailyHours || []).reduce((s: number, d: any) => s + (d.overtime_hours || 0), 0);
  const daysWorked = (dailyHours || []).length;

  const isFixed = contractor.payment_type === 'fixed';
  const isUSD = contractor.currency === 'USD';

  const adjustments: { label: string; amount: number; type: string }[] = payout.adjustments || [];
  const adjTotal = adjustments.reduce((s: number, a: any) => s + (a.amount || 0), 0);
  const otPay = payout.overtime_pay ?? 0;
  const basePay = payout.final_payout - adjTotal - otPay;

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const periodStart = new Date(payout.cutoff_start);
  const periodEnd = new Date(payout.cutoff_end);
  const calendarEndDay = periodStart.getDate() >= 16
    ? new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 0).getDate()
    : periodEnd.getDate();
  const periodLabel = periodStart.getMonth() === periodEnd.getMonth()
    ? `${months[periodStart.getMonth()]} ${periodStart.getDate()}–${calendarEndDay}, ${periodStart.getFullYear()}`
    : `${months[periodStart.getMonth()]} ${periodStart.getDate()} – ${months[periodEnd.getMonth()]} ${calendarEndDay}, ${periodStart.getFullYear()}`;

  const issuedDate = new Date(payout.payment_date || payout.approved_at || new Date());
  const issuedLabel = `${shortMonths[issuedDate.getMonth()]} ${issuedDate.getDate()}, ${issuedDate.getFullYear()}`;

  const invoiceNo = `PAY-${(payout.cutoff_start || '').replace(/-/g,'').slice(0,8)}-${String(payout_id).slice(-4).toUpperCase()}`;

  const rateLabel = isFixed
    ? `₱${(contractor.monthly_rate || 0).toLocaleString()}/month`
    : isUSD
      ? `$${contractor.hourly_rate}/hr (USD)`
      : `₱${(contractor.hourly_rate || 0).toLocaleString()}/hr`;

  const contractType = isFixed ? 'Fixed Rate' : isUSD ? 'Hourly — USD' : 'Hourly';

  const basePayDesc = isFixed
    ? `Semi-monthly fixed rate (${periodLabel})`
    : `${totalHours.toFixed(2)} hours × ${rateLabel}`;

  const dailyRows = (dailyHours || []).map((d: any) => {
    const date = new Date(d.date + 'T12:00:00');
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateFmt = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const h = (d.hours_capped || 0).toFixed(2);
    const ot = (d.overtime_hours || 0) > 0 ? ` <span style="color:#ea580c;font-size:11px;">+${Number(d.overtime_hours).toFixed(2)}h OT</span>` : '';
    const checkIn = d.first_on
      ? new Date(d.first_on).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true })
      : null;
    const checkInLabel = checkIn ? `<span style="font-size:10px;color:#d1d5db;margin-left:6px;">· in ${checkIn}</span>` : '';
    return `<tr>
      <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${dayName}, ${dateFmt}${checkInLabel}</td>
      <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:12px;color:#374151;font-weight:500;">${h}h${ot}</td>
    </tr>`;
  }).join('');

  const adjRows = adjustments.map((a: any) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
        <p style="margin:0;font-size:13px;color:#374151;">${a.label}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#9ca3af;text-transform:capitalize;">${a.type || 'adjustment'}</p>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;font-weight:600;color:${a.amount >= 0 ? '#059669' : '#ef4444'};">
        ${a.amount > 0 ? '+' : ''}${fmt(a.amount)}
      </td>
    </tr>`).join('');

  const otRow = otPay > 0 ? `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
        <p style="margin:0;font-size:13px;color:#374151;">Overtime Pay</p>
        <p style="margin:2px 0 0;font-size:11px;color:#9ca3af;">${totalOT.toFixed(2)} hours overtime</p>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;font-weight:600;color:#ea580c;">
        ${fmt(otPay)}
      </td>
    </tr>` : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <div style="background:#111827;padding:28px 32px;">
      <img src="https://fsarchitects.ph/images/fs-architects-logo-white.png" alt="FS Architects" height="48" style="display:block;margin-bottom:16px;" />
      <p style="color:#fff;font-size:22px;font-weight:800;margin:0 0 6px;letter-spacing:-0.3px;">Payment Receipt</p>
      <p style="color:#6b7280;font-size:12px;margin:0;line-height:1.6;">
        ${periodLabel}<br>
        <span style="color:#9ca3af;">${invoiceNo} &nbsp;·&nbsp; Issued ${issuedLabel}</span>
      </p>
    </div>

    <div style="background:#ecfdf5;padding:12px 36px;border-bottom:1px solid #d1fae5;">
      <table style="border-collapse:collapse;"><tr>
        <td style="vertical-align:middle;padding-right:10px;"><span style="display:inline-block;width:8px;height:8px;background:#10b981;border-radius:50%;"></span></td>
        <td style="vertical-align:middle;"><p style="margin:0;font-size:13px;color:#065f46;font-weight:600;">Payment sent — this is your official payslip for the period above.</p></td>
      </tr></table>
    </div>

    <div style="padding:28px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Issued To</p>
      <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">${contractor.full_name}${contractor.employee_id ? `<span style="font-size:12px;font-weight:500;color:#9ca3af;margin-left:10px;font-family:monospace;">${contractor.employee_id}</span>` : ''}</p>
      <p style="font-size:13px;color:#6b7280;margin:0 0 2px;">${contractor.department || 'FS Architects'}</p>
      <p style="font-size:13px;color:#6b7280;margin:0;">${contractType} · ${rateLabel}</p>
    </div>

    <div style="padding:24px 36px;background:#fafafa;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">Attendance Summary</p>
      <table style="border-collapse:collapse;margin-bottom:${dailyRows ? '16px' : '0'};"><tr>
        <td style="vertical-align:top;padding-right:32px;">
          <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">Days Worked</p>
          <p style="font-size:22px;font-weight:800;color:#111827;margin:0;">${daysWorked}</p>
          <p style="font-size:11px;color:#9ca3af;margin:2px 0 0;">days</p>
        </td>
        <td style="vertical-align:top;padding-right:32px;">
          <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">Hours Billed</p>
          <p style="font-size:22px;font-weight:800;color:#111827;margin:0;">${totalHours.toFixed(2)}</p>
          <p style="font-size:11px;color:#9ca3af;margin:2px 0 0;">hours</p>
        </td>
        ${totalOT > 0 ? `<td style="vertical-align:top;">
          <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">Overtime</p>
          <p style="font-size:22px;font-weight:800;color:#ea580c;margin:0;">+${totalOT.toFixed(2)}</p>
          <p style="font-size:11px;color:#9ca3af;margin:2px 0 0;">hours</p>
        </td>` : ''}
      </tr></table>
      ${dailyRows ? `<table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding-bottom:6px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Date</td>
          <td style="padding-bottom:6px;text-align:right;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Hours</td>
        </tr>
        ${dailyRows}
      </table>` : ''}
    </div>

    <div style="padding:28px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">Earnings Breakdown</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
            <p style="margin:0;font-size:13px;color:#374151;">Base Pay</p>
            <p style="margin:2px 0 0;font-size:11px;color:#9ca3af;">${basePayDesc}</p>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;font-weight:600;color:#111827;">${fmt(basePay)}</td>
        </tr>
        ${otRow}
        ${adjRows}
        <tr>
          <td style="padding:16px 0 4px;" colspan="2">
            <div style="background:#111827;border-radius:10px;padding:16px 20px;">
              <table style="width:100%;border-collapse:collapse;"><tr>
                <td style="vertical-align:middle;">
                  <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Total Payout</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">${periodLabel}</p>
                </td>
                <td style="vertical-align:middle;text-align:right;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;">${fmt(payout.final_payout)}</p>
                </td>
              </tr></table>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding:20px 36px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 6px;line-height:1.6;">
        This is your official payslip for <strong style="color:#6b7280;">${periodLabel}</strong>. Please keep this for your records.
        If you notice any discrepancies, reach out to HR directly on Slack.
      </p>
      <p style="font-size:11px;color:#d1d5db;margin:0;">© ${new Date().getFullYear()} FS Architects · <a href="mailto:payroll@fsarchitects.ph" style="color:#d1d5db;text-decoration:none;">payroll@fsarchitects.ph</a></p>
    </div>

  </div>
</body>
</html>`;

  // ── Drive copy: same HTML + PAID stamp saved as Google Doc ──────────────────
  const driveHtml = html.replace(
    // Insert a bold PAID banner right after the green "Payment sent" bar
    `<div style="background:#ecfdf5;padding:12px 36px;border-bottom:1px solid #d1fae5;">`,
    `<div style="background:#059669;padding:10px 36px;text-align:center;">
      <p style="margin:0;font-size:13px;font-weight:800;color:#fff;letter-spacing:0.12em;text-transform:uppercase;">✓ PAID</p>
    </div>
    <div style="background:#ecfdf5;padding:12px 36px;border-bottom:1px solid #d1fae5;">`,
  );
  saveToDrive(driveHtml, contractor.full_name, periodLabel, payout.cutoff_start).catch(e =>
    console.error('Drive payslip upload failed (non-fatal):', e),
  );

  console.log('Calling Resend API...');
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `FS Architects <${FROM_EMAIL}>`,
      to: contractor.email,
      subject: `Payment Receipt — ${periodLabel} | ${fmt(payout.final_payout)} | FS Architects`,
      html,
    }),
  });

  console.log('Resend response status:', resendRes.status);
  const result = await resendRes.json();
  if (!resendRes.ok) {
    console.error('Resend error:', JSON.stringify(result));
  } else {
    console.log('Resend success:', result.id);
    await supabase.from('hub_payouts').update({ payslip_sent_at: new Date().toISOString() }).eq('id', payout_id);
  }

  // Slack DM to contractor — isolated so a Slack failure doesn't shadow email success
  const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN');
  if (SLACK_BOT_TOKEN) {
    const { resolveSlackId } = await import('../_shared/slack.ts');
    const slackId = await resolveSlackId(SLACK_BOT_TOKEN, contractor.slack_id, contractor.email).catch(() => null);
    if (slackId) {
      try {
        const slackPost = async (path: string, body: unknown) => {
          const res = await fetch(`https://slack.com/api/${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          return res.json();
        };
        const dm = await slackPost('conversations.open', { users: slackId });
        await slackPost('chat.postMessage', {
          channel: dm.channel?.id ?? slackId,
          text: `💸 Payment Sent — ${fmt(payout.final_payout)} for ${periodLabel}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `💸 *Payment Sent*\n${fmt(payout.final_payout)} for ${periodLabel} — check your email for the full receipt.` } },
            { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'View Payslip →' }, url: `${Deno.env.get('HUB_BASE_URL') ?? 'https://fsarchitects.ph'}/hub/employee/payouts`, style: 'primary' }] },
          ],
        });
      } catch (slackErr) {
        console.error('Slack DM failed (payslip):', slackErr);
      }
    }
  }

  // Hub in-app notification
  try {
    await supabase.from('hub_notifications').insert({
      user_id: contractor.id,
      type: 'payment_received',
      title: 'Payment sent',
      body: `Your payslip for ${periodLabel} has been processed — ${fmt(payout.final_payout)} is on its way. Check your email for the full receipt.`,
      link: '/hub/employee/payouts',
      read: false,
    });
  } catch (_) { /* non-fatal */ }

  // Push notification
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: contractor.id,
        title: 'Payment sent',
        body: `${fmt(payout.final_payout)} for ${periodLabel} is on its way. Check your email for the payslip.`,
        url: '/hub/employee/payouts',
      }),
    });
  } catch (_) { /* non-fatal */ }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req); // restrict CORS to allowlisted origins (W-23)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const denied = await guardAdmin(req);
  if (denied) return denied;

  try {
    const { payout_id } = await req.json();
    if (!payout_id) return new Response(JSON.stringify({ error: 'payout_id required' }), { status: 400, headers: cors });

    const payout_id_str = String(payout_id);
    // @ts-ignore
    EdgeRuntime.waitUntil((async () => {
      try {
        await sendPayslip(payout_id_str);
      } catch (error) {
        console.error('sendPayslip background task failed', { payout_id: payout_id_str, error });
      }
    })());

    return new Response(JSON.stringify({ ok: true, queued: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
