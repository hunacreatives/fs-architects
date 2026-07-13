import { corsHeaders, guardAdmin } from '../_shared/auth.ts';

// Appends one row to a running Google Sheet log — used as an audit trail so
// resolved/closed requests and decided overtime requests aren't only visible
// inside the hub, but also land in a durable, exportable record in Drive.
// Auto-creates the sheet (with a header row) on first use, same self-healing
// pattern as upload-to-drive's createOrGetFolder, so no manual Drive setup is
// needed before this works.

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

// Sentro OS Drive root (same as upload-to-drive) → Logs subfolder, so the
// generated sheets sit alongside the rest of the hub's Drive exports.
const SENTRO_ROOT = '1fuX6nxXERGIizoVEJRORUmvlO-auezNt';

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

// Each log is identified by name; headers written once when the sheet is created.
const SHEETS: Record<string, { name: string; headers: string[] }> = {
  requests: {
    name: 'Request Center Log',
    headers: ['Date Filed', 'Employee', 'Type', 'Title', 'Description', 'Amount (PHP)', 'Status', 'Date Resolved', 'Admin Notes'],
  },
  overtime: {
    name: 'Overtime Log',
    headers: ['Date Filed', 'Employee', 'Department', 'OT Date', 'Hours', 'Reason', 'Rate', 'Status', 'Reviewed By', 'Decision Date', 'Admin Notes'],
  },
};

async function findSpreadsheet(name: string, parentId: string, accessToken: string): Promise<string | null> {
  const safeName = name.replace(/['"\\]/g, '');
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${safeName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function createSpreadsheet(name: string, headers: string[], parentId: string, accessToken: string): Promise<string> {
  // Create the spreadsheet directly inside the target folder via the Drive API
  // (not the Sheets API's own create endpoint, which always drops new sheets
  // into the caller's personal Drive root with no way to set a parent — an
  // earlier version of this function created-then-moved, but never checked
  // whether the move actually succeeded, so failed moves left the sheet
  // orphaned and invisible in the automation account's own Drive).
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parentId] }),
  });
  const created = await createRes.json();
  if (!created.id) throw new Error(`Failed to create spreadsheet "${name}": ${JSON.stringify(created)}`);
  const sheetId = created.id;

  // Write the header row.
  const headerRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [headers] }),
    },
  );
  if (!headerRes.ok) throw new Error(`Failed to write headers for "${name}": ${JSON.stringify(await headerRes.json())}`);

  return sheetId;
}

async function getOrCreateSheet(logType: string, accessToken: string): Promise<string> {
  const config = SHEETS[logType];
  if (!config) throw new Error(`Unknown log type: ${logType}`);
  const logsFolder = await createOrGetFolder('Logs', SENTRO_ROOT, accessToken);
  const existing = await findSpreadsheet(config.name, logsFolder, accessToken);
  if (existing) return existing;
  return createSpreadsheet(config.name, config.headers, logsFolder, accessToken);
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const denied = await guardAdmin(req);
  if (denied) return denied;

  try {
    const { logType, row } = await req.json();
    if (!logType || !Array.isArray(row)) {
      return new Response(JSON.stringify({ error: 'Missing logType or row' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken();
    const sheetId = await getOrCreateSheet(logType, accessToken);

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [row] }),
      },
    );
    const appendResult = await appendRes.json();
    if (!appendRes.ok) throw new Error(JSON.stringify(appendResult));

    return new Response(JSON.stringify({ success: true, sheetId }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
