// Shared Slack helpers for FS Architects edge functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Slack IDs of the people who should receive internal/admin notifications:
// active owners, admins, and HR. Looked up live from hub_users so no person
// is ever hardcoded. Returns [] (and logs) if none have a Slack ID set.
export async function getAdminSlackIds(
  supabaseUrl: string,
  serviceKey: string,
): Promise<string[]> {
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase
      .from('hub_users')
      .select('slack_id')
      .in('role', ['owner', 'admin', 'hr'])
      .eq('status', 'active')
      .not('slack_id', 'is', null);
    if (error) { console.error('getAdminSlackIds query failed:', error); return []; }
    const ids = (data ?? []).map((u: { slack_id: string | null }) => u.slack_id).filter(Boolean) as string[];
    if (ids.length === 0) console.error('getAdminSlackIds: no active owner/admin/hr has a Slack ID set');
    return ids;
  } catch (err) {
    console.error('getAdminSlackIds threw:', err);
    return [];
  }
}

// Emails of active owners/admins/HR — for internal email alerts. Dynamic, no
// hardcoded addresses. Returns [] (and logs) if none found.
export async function getAdminEmails(
  supabaseUrl: string,
  serviceKey: string,
): Promise<string[]> {
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase
      .from('hub_users')
      .select('email')
      .in('role', ['owner', 'admin', 'hr'])
      .eq('status', 'active')
      .not('email', 'is', null);
    if (error) { console.error('getAdminEmails query failed:', error); return []; }
    const emails = (data ?? []).map((u: { email: string | null }) => u.email).filter(Boolean) as string[];
    if (emails.length === 0) console.error('getAdminEmails: no active owner/admin/hr has an email set');
    return emails;
  } catch (err) {
    console.error('getAdminEmails threw:', err);
    return [];
  }
}

export async function resolveSlackId(
  token: string,
  slackId: string | null | undefined,
  email: string | null | undefined,
): Promise<string | null> {
  if (slackId) return slackId;
  if (!email || !token) return null;
  try {
    const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    return json.ok ? json.user?.id ?? null : null;
  } catch {
    return null;
  }
}

export async function slackDm(
  token: string,
  userId: string,
  text: string,
): Promise<void> {
  const open = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: userId }),
  });
  const openJson = await open.json();
  const channel = openJson.ok ? openJson.channel?.id : userId;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  });
}

export async function slackDmByEmailOrId(
  token: string,
  slackId: string | null | undefined,
  email: string | null | undefined,
  text: string,
): Promise<void> {
  if (!token) return;
  const id = await resolveSlackId(token, slackId, email);
  if (!id) return;
  await slackDm(token, id, text);
}
