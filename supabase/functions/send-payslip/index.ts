import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = 'payroll@hunacreatives.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function fmt(val: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(val);
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
    .select('id, full_name, email, payment_type, hourly_rate, monthly_rate, department, currency, slack_id')
    .eq('id', payout.contractor_id)
    .single();

  if (contractorErr || !contractor) { console.error('contractor not found:', contractorErr); return; }
  if (!contractor.email) { console.error('contractor has no email:', contractor.id); return; }

  console.log('Sending payslip to:', contractor.email, 'payout:', payout_id);

  const { data: dailyHours } = await supabase
    .from('hub_daily_hours')
    .select('date, hours_capped, overtime_hours')
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

  const invoiceNo = `INV-${(payout.cutoff_start || '').replace(/-/g,'').slice(0,8)}-${String(payout_id).slice(-4).toUpperCase()}`;

  const rateLabel = isFixed
    ? `₱${(contractor.monthly_rate || 0).toLocaleString()}/month`
    : isUSD
      ? `$${contractor.hourly_rate}/hr (USD)`
      : `₱${(contractor.hourly_rate || 0).toLocaleString()}/hr`;

  const contractType = isFixed ? 'Fixed Rate' : isUSD ? 'Hourly — USD' : 'Hourly';

  const basePayDesc = isFixed
    ? `Semi-monthly fixed rate (${periodLabel})`
    : `${totalHours.toFixed(2)} hours × ${rateLabel}`;

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
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;font-weight:600;color:#7c3aed;">
        ${fmt(otPay)}
      </td>
    </tr>` : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <div style="background:#111827;padding:28px 36px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;">
            <p style="color:#FF6B35;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">Huna Creatives</p>
            <h1 style="color:#fff;font-size:26px;font-weight:800;margin:0;letter-spacing:-0.5px;">Payment Receipt</h1>
            <p style="color:#6b7280;font-size:13px;margin:6px 0 0;">Pay Period: <span style="color:#d1d5db;font-weight:600;">${periodLabel}</span></p>
          </td>
          <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:16px;">
            <p style="color:#6b7280;font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Invoice No.</p>
            <p style="color:#fff;font-size:13px;font-weight:700;margin:0;">${invoiceNo}</p>
            <p style="color:#6b7280;font-size:11px;margin:8px 0 2px;">Issued</p>
            <p style="color:#d1d5db;font-size:12px;margin:0;">${issuedLabel}</p>
          </td>
        </tr>
      </table>
    </div>

    <div style="background:#ecfdf5;padding:12px 36px;border-bottom:1px solid #d1fae5;">
      <table style="border-collapse:collapse;"><tr>
        <td style="vertical-align:middle;padding-right:10px;"><span style="display:inline-block;width:8px;height:8px;background:#10b981;border-radius:50%;"></span></td>
        <td style="vertical-align:middle;"><p style="margin:0;font-size:13px;color:#065f46;font-weight:600;">Payment sent — this is your official payslip for the period above.</p></td>
      </tr></table>
    </div>

    <div style="padding:28px 36px;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Issued To</p>
      <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">${contractor.full_name}</p>
      <p style="font-size:13px;color:#6b7280;margin:0 0 2px;">${contractor.department || 'Huna Creatives'}</p>
      <p style="font-size:13px;color:#6b7280;margin:0;">${contractType} · ${rateLabel}</p>
    </div>

    <div style="padding:24px 36px;background:#fafafa;border-bottom:1px solid #f3f4f6;">
      <p style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">Attendance Summary</p>
      <table style="border-collapse:collapse;"><tr>
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
          <p style="font-size:22px;font-weight:800;color:#7c3aed;margin:0;">+${totalOT.toFixed(2)}</p>
          <p style="font-size:11px;color:#9ca3af;margin:2px 0 0;">hours</p>
        </td>` : ''}
      </tr></table>
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
                  <p style="margin:0;font-size:24px;font-weight:800;color:#FF6B35;">${fmt(payout.final_payout)}</p>
                </td>
              </tr></table>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding:24px 36px;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 8px;line-height:1.6;">
        This is an automatically generated payslip for the pay period <strong style="color:#6b7280;">${periodLabel}</strong>.
        Please keep this for your records. If you notice any discrepancies, reach out to HR on Slack immediately.
      </p>
      <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">This email is not monitored. Do not reply directly — for concerns, email <a href="mailto:contact@hunacreatives.com" style="color:#9ca3af;">contact@hunacreatives.com</a></p>
      <p style="font-size:11px;color:#d1d5db;margin:0;">© ${new Date().getFullYear()} Huna Creatives · payroll@hunacreatives.com</p>
    </div>

  </div>
</body>
</html>`;

  console.log('Calling Resend API...');
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Huna Creatives Payroll <${FROM_EMAIL}>`,
      to: contractor.email,
      subject: `Payment Receipt — ${periodLabel} | ${fmt(payout.final_payout)} | Huna Creatives`,
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
  if (SLACK_BOT_TOKEN && contractor.slack_id) {
    try {
      const slackPost = async (path: string, body: unknown) => {
        const res = await fetch(`https://slack.com/api/${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(`Slack API failed: ${path} - ${json.error ?? res.status}`);
        }
        return json;
      };
      const dm = await slackPost('conversations.open', { users: contractor.slack_id });
      await slackPost('chat.postMessage', {
        channel: dm.channel.id,
        text: `💸 *Payment sent!* Your payslip for *${periodLabel}* has been processed — *${fmt(payout.final_payout)}* is on its way. Check your email for the full receipt.`,
      });
    } catch (slackErr) {
      console.error('Slack DM failed (payslip already sent):', slackErr);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

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
