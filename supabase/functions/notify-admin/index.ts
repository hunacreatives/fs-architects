import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAdminSlackIds } from '../_shared/slack.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const FROM = `Sentro OS <${Deno.env.get('FROM_EMAIL') ?? 'noreply@fsarchitects.ph'}>`;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function slackDmAdmins(text: string) {
  const ids = await getAdminSlackIds(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  await Promise.all(ids.map(id => slackDm(id, text).catch(() => {})));
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function pushToAdmins(title: string, body: string, url?: string) {
  const { data: admins } = await supabase.from('hub_users').select('id').in('role', ['admin', 'owner']).eq('status', 'active');
  await Promise.all((admins ?? []).map((a: any) =>
    fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: a.id, title, body, url }),
    }).catch(() => {})
  ));
}

async function getAdminEmails(): Promise<string[]> {
  const { data } = await supabase
    .from('hub_users')
    .select('email')
    .in('role', ['admin', 'owner', 'hr'])
    .eq('status', 'active');
  return (data || []).map((u: any) => u.email).filter(Boolean);
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (to.length === 0) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
}

function baseTemplate(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;padding:32px;margin:0">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#111827;padding:20px 24px;display:flex;align-items:center;gap:12px">
    <div style="width:28px;height:28px;background:#FF6B35;border-radius:6px;display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-weight:900;font-size:12px">S</span>
    </div>
    <span style="color:#fff;font-weight:700;font-size:14px;letter-spacing:0.05em">SENTRO <span style="color:#FF6B35">OS</span></span>
  </div>
  <div style="padding:24px">
    <h2 style="margin:0 0 12px;font-size:16px;color:#111827">${title}</h2>
    ${body}
  </div>
  <div style="padding:16px 24px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af">
    Sentro OS · FS Architects · <a href="https://fsarchitects.ph/hub" style="color:#FF6B35;text-decoration:none">Open Hub</a>
  </div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { type, data } = await req.json();
    const admins = await getAdminEmails();

    if (type === 'time_off_submitted') {
      const { contractor_name, leave_type, start_date, end_date, days } = data;
      await sendEmail(
        admins,
        `Leave Request: ${contractor_name}`,
        baseTemplate(
          'New Leave Request',
          `<p style="color:#4b5563;font-size:14px;margin:0 0 16px"><strong>${contractor_name}</strong> submitted a ${leave_type} leave request.</p>
          <div style="background:#f9fafb;border-radius:8px;padding:14px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6b7280;font-size:13px">Dates</span><span style="font-size:13px;font-weight:600;color:#111827">${start_date}${start_date !== end_date ? ` – ${end_date}` : ''}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:#6b7280;font-size:13px">Duration</span><span style="font-size:13px;font-weight:600;color:#111827">${days} day${days !== 1 ? 's' : ''}</span></div>
          </div>
          <a href="https://fsarchitects.ph/hub/admin/timeoff" style="display:inline-block;background:#FF6B35;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">Review Request →</a>`
        )
      );
      const daysText = days ? ` (${days} day${days !== 1 ? 's' : ''})` : '';
      await slackDmAdmins(`📅 *Leave request*\n*${contractor_name}* is requesting ${leave_type} from ${start_date} to ${end_date}${daysText}.\n<https://fsarchitects.ph/hub/admin/timeoff|Review request →>`);
      await pushToAdmins('Leave request', `${contractor_name} is requesting ${leave_type} from ${start_date} to ${end_date}.`, 'https://fsarchitects.ph/hub/admin/timeoff');
    }

    if (type === 'overtime') {
      const { contractor_name, hours, date } = data;
      await slackDmAdmins(`⏱ *Overtime logged*\n*${contractor_name}* logged ${hours}h overtime on ${date}.\n<https://fsarchitects.ph/hub/admin/attendance|Review →>`);
      await pushToAdmins('Overtime logged', `${contractor_name} logged ${hours}h overtime on ${date}.`, 'https://fsarchitects.ph/hub/admin/attendance');
    }

    if (type === 'request_submitted') {
      const { contractor_name, request_type, title } = data;
      await sendEmail(
        admins,
        `New Request: ${title}`,
        baseTemplate(
          'New Request Submitted',
          `<p style="color:#4b5563;font-size:14px;margin:0 0 16px"><strong>${contractor_name}</strong> submitted a new <strong>${request_type}</strong> request.</p>
          <div style="background:#f9fafb;border-radius:8px;padding:14px;margin-bottom:16px">
            <p style="margin:0;font-size:13px;color:#111827;font-weight:600">${title}</p>
          </div>
          <a href="https://fsarchitects.ph/hub/admin/requests" style="display:inline-block;background:#FF6B35;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">Review Request →</a>`
        )
      );
      await pushToAdmins('New request submitted', `${contractor_name} submitted a new ${request_type} request: ${title}`, 'https://fsarchitects.ph/hub/admin/requests');
    }

    if (type === 'invoice_overdue') {
      const { invoices } = data as { invoices: { invoice_number: string; client_name: string; project_name: string; days_overdue: number; balance: number }[] };
      if (invoices.length === 0) return new Response(JSON.stringify({ skipped: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      const rows = invoices.map(inv =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px">#${inv.invoice_number}</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px">${inv.client_name}</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#ef4444;font-weight:600">${inv.days_overdue}d overdue</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600">₱${inv.balance.toLocaleString()}</td></tr>`
      ).join('');
      await sendEmail(
        admins,
        `${invoices.length} overdue invoice${invoices.length > 1 ? 's' : ''}`,
        baseTemplate(
          `${invoices.length} Overdue Invoice${invoices.length > 1 ? 's' : ''}`,
          `<table style="width:100%;border-collapse:collapse;margin-bottom:16px"><thead><tr style="background:#f9fafb"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Invoice</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Client</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Overdue</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Balance</th></tr></thead><tbody>${rows}</tbody></table>
          <a href="https://fsarchitects.ph/hub/admin/invoice-log" style="display:inline-block;background:#FF6B35;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">View Invoice Log →</a>`
        )
      );
      for (const inv of invoices) {
        const balanceFmt = '₱' + (inv.balance as number).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        await slackDmAdmins(`⚠️ *Invoice past due*\nInvoice #${inv.invoice_number} for *${inv.client_name}* (${balanceFmt}) is ${inv.days_overdue} days past due.\n<https://fsarchitects.ph/hub/admin/invoice-log|View invoice →>`);
      }
      await pushToAdmins('Overdue invoices', `${invoices.length} invoice${invoices.length > 1 ? 's are' : ' is'} past due. Review needed.`, 'https://fsarchitects.ph/hub/admin/invoice-log');
    }

    if (type === 'contract_expiring') {
      const { contractors } = data as { contractors: { full_name: string; contract_expiry_date: string; days_until: number }[] };
      if (contractors.length === 0) return new Response(JSON.stringify({ skipped: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      const rows = contractors.map(c =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px">${c.full_name}</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px">${c.contract_expiry_date}</td><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:${c.days_until <= 7 ? '#ef4444' : '#f59e0b'};font-weight:600">${c.days_until === 0 ? 'Today' : `In ${c.days_until} day${c.days_until !== 1 ? 's' : ''}`}</td></tr>`
      ).join('');
      await sendEmail(
        admins,
        `${contractors.length} contract${contractors.length > 1 ? 's' : ''} expiring soon`,
        baseTemplate(
          'Contracts Expiring Soon',
          `<table style="width:100%;border-collapse:collapse;margin-bottom:16px"><thead><tr style="background:#f9fafb"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Contractor</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Expiry</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">Status</th></tr></thead><tbody>${rows}</tbody></table>
          <a href="https://fsarchitects.ph/hub/admin/employees" style="display:inline-block;background:#FF6B35;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">View Employees →</a>`
        )
      );
      for (const c of contractors) {
        await slackDmAdmins(`📋 *Contract expiring soon*\n*${c.full_name}*'s contract expires in ${c.days_until} days.\n<https://fsarchitects.ph/hub/admin/employees|Review →>`);
      }
      await pushToAdmins('Contracts expiring soon', `${contractors.length} contract${contractors.length > 1 ? 's are' : ' is'} expiring soon. Review needed.`, 'https://fsarchitects.ph/hub/admin/employees');
    }

    return new Response(JSON.stringify({ sent: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
