// Shared Slack helpers for FS Architects edge functions

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
