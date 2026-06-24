// Slack interactivity callback.
//
// Slack signs every interactive request (HMAC-SHA256 over `v0:timestamp:rawBody`
// using the app signing secret). Previously this endpoint accepted any POST and
// returned ok — meaning forged payloads were trusted and, conversely, nothing was
// verified. We now verify the signature and timestamp before handling anything.
//
// There are currently no interactive buttons wired into the Slack messages this
// app sends, so verified requests are simply acknowledged. When buttons are added,
// route on the parsed `payload.actions` below.

const SLACK_SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET') ?? '';

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time-ish comparison to avoid leaking via early exit.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifySlackSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!SLACK_SIGNING_SECRET) return false;
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? '';
  const signature = req.headers.get('x-slack-signature') ?? '';
  if (!timestamp || !signature) return false;

  // Reject requests older than 5 minutes (replay protection).
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SLACK_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`v0:${timestamp}:${rawBody}`));
  return safeEqual(`v0=${hex(mac)}`, signature);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Headers': '*' } });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const rawBody = await req.text();
  if (!(await verifySlackSignature(req, rawBody))) {
    return new Response('Invalid signature', { status: 401 });
  }

  // Slack sends `payload=<url-encoded-json>` for interactive components.
  let payload: Record<string, unknown> = {};
  try {
    const params = new URLSearchParams(rawBody);
    const raw = params.get('payload');
    if (raw) payload = JSON.parse(raw);
  } catch (_err) {
    payload = {};
  }

  // No interactive actions are wired up yet. Acknowledge with 200 so Slack does
  // not show an error to the user. Add action routing here when buttons exist:
  //   const actions = (payload.actions ?? []) as Array<{ action_id: string }>;
  void payload;

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
