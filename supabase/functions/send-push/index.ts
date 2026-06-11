import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// ── Base64url helpers ─────────────────────────────────────────────────────────

function b64uEncode(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64uDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

// ── VAPID JWT ─────────────────────────────────────────────────────────────────

async function makeVapidJwt(audience: string): Promise<string> {
  const enc = new TextEncoder();
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64uEncode(enc.encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT })));
  const signingInput = `${header}.${payload}`;

  // Extract x, y from the uncompressed P-256 public key (0x04 || x || y)
  const pubBytes = b64uDecode(VAPID_PUBLIC_KEY);
  const x = b64uEncode(pubBytes.slice(1, 33));
  const y = b64uEncode(pubBytes.slice(33, 65));

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: VAPID_PRIVATE_KEY, x, y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput));
  return `${signingInput}.${b64uEncode(sig)}`;
}

// ── HKDF ─────────────────────────────────────────────────────────────────────

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const keyMat = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, keyMat, len * 8);
  return new Uint8Array(bits);
}

// ── RFC 8291 aes128gcm payload encryption ─────────────────────────────────────

async function encryptPayload(p256dhB64: string, authB64: string, plaintext: string): Promise<Uint8Array> {
  const p256dh = b64uDecode(p256dhB64);
  const authSecret = b64uDecode(authB64);
  const plaintextBytes = new TextEncoder().encode(plaintext);

  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  const recipientKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: recipientKey }, ephemeral.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const prk = await hkdf(
    authSecret,
    sharedSecret,
    concat(new TextEncoder().encode('WebPush: info\x00'), p256dh, ephPubRaw),
    32,
  );

  const cek = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: aes128gcm\x00'), 16);
  const nonce = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: nonce\x00'), 12);

  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);

  // Plaintext + delimiter byte (0x02 = record end)
  const padded = new Uint8Array(plaintextBytes.length + 1);
  padded.set(plaintextBytes);
  padded[plaintextBytes.length] = 0x02;

  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded));

  // aes128gcm content-coding header: salt(16) + rs(4) + idlen(1) + keyid
  const rs = padded.length + 16;
  const header = new Uint8Array(21 + ephPubRaw.length);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = ephPubRaw.length;
  header.set(ephPubRaw, 21);

  return concat(header, ciphertext);
}

// ── Web Push send ─────────────────────────────────────────────────────────────

async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await makeVapidJwt(audience);

  const encrypted = await encryptPayload(p256dh, auth, JSON.stringify(payload));

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
    },
    body: encrypted,
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`Push failed ${res.status}: ${text}`);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { user_id, title, body, url } = await req.json();
    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: 'user_id, title, body required' }), { status: 400, headers: cors });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: subs, error: subsError } = await supabase
      .from('hub_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', user_id);

    if (subsError) {
      console.error('send-push: subscription lookup failed', subsError);
      return new Response(JSON.stringify({ error: subsError.message }), { status: 500, headers: cors });
    }

    if (!subs?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: cors });
    }

    const results = await Promise.allSettled(
      subs.map(s => sendWebPush(s.endpoint, s.p256dh, s.auth, { title, body, url })),
    );

    const stale: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const msg = String(r.reason);
        if (msg.includes('404') || msg.includes('410')) stale.push(subs[i].endpoint);
        else console.error('send-push error', { endpoint: subs[i].endpoint, err: msg });
      }
    });

    if (stale.length) {
      await supabase.from('hub_push_subscriptions').delete().in('endpoint', stale);
    }

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ ok: true, sent }), { headers: cors });
  } catch (err) {
    console.error('send-push fatal', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
