import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveSlackId } from '../_shared/slack.ts';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || Deno.env.get('SITE_URL') || 'https://fsarchitects.ph';
const PROJECTS_URL = `${SITE_URL.replace(/\/$/, '')}/hub/employee/projects`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function slackPost(path: string, body: object) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return res.json();
}

async function run(projectId: number, contractorId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: assignment, error } = await supabase
    .from('hub_project_contractors')
    .select(`
      project_role,
      hub_projects!inner(id, name, client_name),
      hub_users!inner(id, full_name, email, slack_id)
    `)
    .eq('project_id', projectId)
    .eq('contractor_id', contractorId)
    .maybeSingle();

  if (error) {
    console.error('[notify-project-assigned] DB error:', error);
    return;
  }

  const project = (assignment as any)?.hub_projects;
  const contractor = (assignment as any)?.hub_users;
  const projectRole = (assignment as any)?.project_role as string | null | undefined;

  if (!project) {
    console.log('[notify-project-assigned] missing project, skipping DM');
    return;
  }

  const firstName = contractor.full_name?.split(' ')[0] ?? contractor.full_name ?? 'there';
  const projectName = project.name ?? 'Untitled Project';
  const clientName = project.client_name ?? null;
  const roleLine = projectRole ? `*Role:*\n${projectRole}` : null;

  const resolvedSlackId = await resolveSlackId(SLACK_BOT_TOKEN, contractor.slack_id, contractor.email);
  if (!resolvedSlackId) {
    console.log('[notify-project-assigned] could not resolve slack ID for', contractor.email);
    return;
  }

  const dmOpen = await slackPost('conversations.open', { users: resolvedSlackId });
  const dmChannel = dmOpen.ok ? dmOpen.channel?.id : resolvedSlackId;
  const contextLine = [projectName, clientName].filter(Boolean).join(' — ');

  const dmResult = await slackPost('chat.postMessage', {
    channel: dmChannel,
    text: `🏗️ Project Assigned — ${contextLine}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `🏗️ *Project Assigned*\n${contextLine}` } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Projects →' }, url: PROJECTS_URL, style: 'primary' }] },
    ],
  });

  console.log('[notify-project-assigned] chat.postMessage result:', JSON.stringify(dmResult));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { project_id, contractor_id } = await req.json();
    if (!project_id || !contractor_id) {
      return new Response(JSON.stringify({ error: 'project_id and contractor_id are required' }), { status: 400, headers: cors });
    }

    // @ts-ignore
    EdgeRuntime.waitUntil(run(Number(project_id), String(contractor_id)));

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
