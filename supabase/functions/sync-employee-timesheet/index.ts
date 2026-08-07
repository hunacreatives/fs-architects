import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fired server-side (via pg_net, from a DB trigger) whenever a task's status
// flips to 'done'. Appends one row to each assignee's own Google Sheet —
// auto-created on their first completed task — building a permanent,
// live-synced history of every task they've ever finished. Reuses the exact
// working OAuth + Drive/Sheets pattern already proven in log-to-sheet.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Sentro OS root folder (Drive) — same root every other Drive/Sheets
// integration in this hub uses.
const SENTRO_ROOT = '1fuX6nxXERGIizoVEJRORUmvlO-auezNt';

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

const TIMESHEET_HEADERS = ['Date', 'Project', 'Task', 'Scope / Description', 'Hours', 'Status'];

async function createSpreadsheet(name: string, parentId: string, accessToken: string): Promise<string> {
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parentId] }),
  });
  const created = await createRes.json();
  if (!created.id) throw new Error(`Failed to create spreadsheet "${name}": ${JSON.stringify(created)}`);
  const sheetId = created.id;

  const headerRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [TIMESHEET_HEADERS] }),
    },
  );
  if (!headerRes.ok) throw new Error(`Failed to write headers for "${name}": ${JSON.stringify(await headerRes.json())}`);

  return sheetId;
}

async function appendRow(sheetId: string, row: (string | number)[], accessToken: string): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    },
  );
  if (!res.ok) throw new Error(`Failed to append row: ${JSON.stringify(await res.json())}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { task_id } = await req.json();
    if (!task_id) {
      return new Response(JSON.stringify({ error: 'Missing task_id' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: task, error: taskErr } = await supabase
      .from('hub_project_tasks')
      .select('id, title, description, status, assigned_to, assignee_ids, hours_spent, done_at, hub_projects(project_name)')
      .eq('id', task_id)
      .single();
    if (taskErr || !task) throw new Error(`Task not found: ${taskErr?.message}`);

    const assigneeIds = Array.isArray(task.assignee_ids) && task.assignee_ids.length > 0
      ? task.assignee_ids
      : (task.assigned_to ? [task.assigned_to] : []);
    if (assigneeIds.length === 0) {
      return new Response(JSON.stringify({ skipped: 'No assignees on this task' }), { headers: cors });
    }

    const { data: employees, error: empErr } = await supabase
      .from('hub_users')
      .select('id, full_name, timesheet_sheet_id')
      .in('id', assigneeIds);
    if (empErr) throw new Error(`Failed to load employees: ${empErr.message}`);

    const accessToken = await getAccessToken();
    const timesheetsFolder = await createOrGetFolder('Timesheets', SENTRO_ROOT, accessToken);

    const projectName = (task.hub_projects as any)?.project_name ?? 'Unknown Project';
    const dateStr = (task.done_at ?? new Date().toISOString()).slice(0, 10);
    const row = [dateStr, projectName, task.title, task.description ?? '', task.hours_spent ?? '', task.status];

    const results: { employee: string; sheetId: string }[] = [];
    for (const employee of employees ?? []) {
      let sheetId = employee.timesheet_sheet_id as string | null;
      if (!sheetId) {
        sheetId = await createSpreadsheet(`${employee.full_name} — Timesheet`, timesheetsFolder, accessToken);
        await supabase.from('hub_users').update({ timesheet_sheet_id: sheetId }).eq('id', employee.id);
      }
      await appendRow(sheetId, row, accessToken);
      results.push({ employee: employee.full_name, sheetId });
    }

    return new Response(JSON.stringify({ success: true, synced: results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
