import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Root Sentro OS Drive folder ───────────────────────────────────────────────
const SENTRO_ROOT = '1XQzc0U_pQrhCtivjR4SsgE_WTG9DpvYd';

// ── Static folder IDs in Sentro OS Drive ─────────────────────────────────────
const FOLDERS = {
  // Attendance Reports
  attendance_weekly:       '1U-pv4haPrxs7J2qK8ZMHL5cDgQfxu-mf',
  attendance_monthly:      '1aegFEr1kSyGD9VFY_yx9GRAi9tFDRNDS',
  attendance_yearly:       '1u2tyo7N68QYQEWoVayCghVbhXwc6FauD',
  // Invoices by year
  invoices_2025:           '1jz5FDLTMzE7l-mOrhLihiIhyECVE50fE',
  invoices_2026:           '1GTimrkflGp6LcbAQAh-kLY1fPiFEjTFi',
  // Payroll by year
  payroll_2025:            '1_YXPRMM4s0jGq6WjeE_WaBboD0xsNXjU',
  payroll_2026:            '1XUVMJAfrj02wVSBeq13wYpcntxDr_h_d',
  // Contractors
  contractors_agreements:  '1Pvqf6N4ZkBWimTVlbwzn1zKi04cP1jkM',
  contractors_ids:         '1LipR8kjOLhTubugnT8EdUWFKaLsP_PqQ',
  contractors_rates:       '1m3nLFN10T2JirT0L3ReMBXT5_Hcgv_o_',
  // Clients
  clients_active:          '11uYE23gr8vekpSSCpNPZPDWwOadBpAgB',
  clients_completed:       '1r8XUoedmhB2V_NsFygX829mj88bjhJF2',
};

// ── Create or get a subfolder by name under a parent ─────────────────────────
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

// ── Resolve target folder for each upload type ────────────────────────────────
async function getFolderForType(type: string, meta: Record<string, string>, accessToken: string): Promise<string> {
  const year = meta.year || String(new Date().getFullYear());

  if (type === 'attendance_weekly')  return FOLDERS.attendance_weekly;
  if (type === 'attendance_monthly') return FOLDERS.attendance_monthly;
  if (type === 'attendance_yearly')  return FOLDERS.attendance_yearly;

  if (type === 'invoice') {
    return year === '2025' ? FOLDERS.invoices_2025 : FOLDERS.invoices_2026;
  }
  if (type === 'payroll') {
    return year === '2025' ? FOLDERS.payroll_2025 : FOLDERS.payroll_2026;
  }
  if (type === 'contractor_agreement') return FOLDERS.contractors_agreements;
  if (type === 'contractor_id')        return FOLDERS.contractors_ids;
  if (type === 'contractor_rates')     return FOLDERS.contractors_rates;
  if (type === 'client_active')        return FOLDERS.clients_active;
  if (type === 'client_completed')     return FOLDERS.clients_completed;

  // ── New types routed through Drive ─────────────────────────────────────────

  if (type === 'task_attachment') {
    // Sentro Root / Task Attachments / {project_name}
    const projectName = meta.project_name || 'General';
    const rootFolder = await createOrGetFolder('Task Attachments', SENTRO_ROOT, accessToken);
    return createOrGetFolder(projectName, rootFolder, accessToken);
  }

  if (type === 'payout_receipt') {
    // Payroll {year} / Receipts
    const payrollFolder = year === '2025' ? FOLDERS.payroll_2025 : FOLDERS.payroll_2026;
    return createOrGetFolder('Receipts', payrollFolder, accessToken);
  }

  if (type === 'payment_proof') {
    // Clients Active / Payment Proofs / {year}
    const proofsFolder = await createOrGetFolder('Payment Proofs', FOLDERS.clients_active, accessToken);
    return createOrGetFolder(year, proofsFolder, accessToken);
  }

  if (type === 'hub_document') {
    // Contractors / Agreements
    return FOLDERS.contractors_agreements;
  }

  throw new Error(`Unknown upload type: ${type}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { filename, mimeType, base64Content, type, meta = {} } = await req.json();

    if (!filename || !mimeType || !base64Content || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken();
    const folderId = await getFolderForType(type, meta, accessToken);

    // Convert HTML → Google Doc if convertToDoc flag is set
    const convertToDoc = meta.convertToDoc === 'true' || mimeType === 'text/html';
    const docMimeType = convertToDoc ? 'application/vnd.google-apps.document' : undefined;

    // Multipart upload to Drive
    const metadataObj: Record<string, unknown> = { name: filename, parents: [folderId] };
    if (docMimeType) metadataObj.mimeType = docMimeType;
    const metadata = JSON.stringify(metadataObj);
    const fileBytes = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));

    const boundary = 'foo_bar_baz';
    const body = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ];

    const enc = new TextEncoder();
    const part1 = enc.encode(body[0]);
    const part2 = enc.encode(body[1]);
    const part3 = enc.encode(`\r\n--${boundary}--`);
    const combined = new Uint8Array(part1.length + part2.length + fileBytes.length + part3.length);
    combined.set(part1, 0);
    combined.set(part2, part1.length);
    combined.set(fileBytes, part1.length + part2.length);
    combined.set(part3, part1.length + part2.length + fileBytes.length);

    const uploadUrl = convertToDoc
      ? 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&convert=true'
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    });

    const result = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(JSON.stringify(result));

    const fileId = result.id;
    const url = `https://drive.google.com/file/d/${fileId}/view`;

    return new Response(JSON.stringify({ success: true, fileId, name: result.name, url }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
