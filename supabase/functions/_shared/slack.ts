// Shared Slack helpers for FS Architects edge functions

// Slack DM channel IDs for the people who receive internal/admin alerts:
// Francis Yu (HR/admin) and Fretz Suralta (owner). Env-overridable. These are
// DM channel IDs (D…), so messages post directly — no conversations.open needed.
export function getAdminDmChannels(): string[] {
  return [
    Deno.env.get('ADMIN_SLACK_DM') ?? 'D0BA4V5NC3H', // Francis Yu — HR/admin
    Deno.env.get('OWNER_SLACK_DM') ?? 'D0BA9F40H0T', // Fretz Suralta — owner
  ];
}

// Post a message (text and/or blocks) to every admin DM channel. Best-effort.
export async function dmAdmins(
  token: string,
  payload: { text?: string; blocks?: unknown[] },
): Promise<void> {
  if (!token) return;
  await Promise.all(getAdminDmChannels().map(async (channel) => {
    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, ...payload }),
      });
      const json = await res.json();
      if (!json.ok) console.error('dmAdmins postMessage failed:', { channel, error: json.error });
    } catch (err) {
      console.error('dmAdmins threw:', { channel, err });
    }
  }));
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
