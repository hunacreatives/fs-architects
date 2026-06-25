// Shared auth + CORS helpers for FS Architects edge functions.
//
// Why this exists: every HTTP-triggered function is reachable by anyone who knows
// its URL and the public anon key (which ships in the frontend bundle). Supabase's
// platform-level verify_jwt only checks that *some* JWT is present — the anon key
// itself passes. These helpers additionally require a real, active *user* and (for
// privileged functions) an admin/owner/hr role before any side effect runs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ADMIN_ROLES = ['owner', 'admin', 'hr'];

// Browser origins allowed to call these functions. Extend via ALLOWED_ORIGINS
// (comma-separated) for staging/preview URLs without a redeploy.
const DEFAULT_ORIGINS = [
  'https://fsarchitects.ph',
  'https://www.fsarchitects.ph',
  'http://localhost:5173',
  'http://localhost:3004',
];

export function allowedOrigins(): string[] {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

// Reflect the request origin only when it is on the allowlist; otherwise fall back
// to the primary production origin so unknown sites cannot read responses.
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const list = allowedOrigins();
  const allow = list.includes(origin) ? origin : list[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface AuthedUser {
  id: string;
  email: string | null;
  role: string;
}

// Validate the caller's Supabase JWT and load their hub role. Returns null for
// anon-key calls, expired/invalid tokens, missing profiles, or deactivated users.
export async function getCaller(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;

  const svc = serviceClient();
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await svc
    .from('hub_users')
    .select('role, status')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'active') return null;

  return { id: data.user.id, email: data.user.email ?? null, role: profile.role as string };
}

export class HttpError {
  constructor(public response: Response) {}
}

export function unauthorized(req: Request, message = 'Authentication required.'): HttpError {
  return new HttpError(new Response(JSON.stringify({ error: message }), { status: 401, headers: corsHeaders(req) }));
}

export function forbidden(req: Request, message = 'Admin access required.'): HttpError {
  return new HttpError(new Response(JSON.stringify({ error: message }), { status: 403, headers: corsHeaders(req) }));
}

// Require any active, authenticated hub user. Throws HttpError otherwise.
export async function requireUser(req: Request): Promise<AuthedUser> {
  const caller = await getCaller(req);
  if (!caller) throw unauthorized(req);
  return caller;
}

// Require an active admin/owner/hr caller. Throws HttpError otherwise.
export async function requireAdmin(req: Request): Promise<AuthedUser> {
  const caller = await getCaller(req);
  if (!caller) throw unauthorized(req);
  if (!ADMIN_ROLES.includes(caller.role)) throw forbidden(req);
  return caller;
}

// Convenience for the try/catch tail of a handler: turn an HttpError into its
// Response, everything else into a 500.
export function errorResponse(req: Request, err: unknown): Response {
  if (err instanceof HttpError) return err.response;
  return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders(req) });
}

// Non-throwing guards for functions that keep their own try/catch and CORS const.
// Returns a denial Response to return early, or null when the caller is allowed.
// Drop in right after the OPTIONS check:
//   const denied = await guardAdmin(req); if (denied) return denied;
export async function guardAdmin(req: Request): Promise<Response | null> {
  const caller = await getCaller(req);
  if (!caller) return unauthorized(req).response;
  if (!ADMIN_ROLES.includes(caller.role)) return forbidden(req).response;
  return null;
}

export async function guardUser(req: Request): Promise<Response | null> {
  const caller = await getCaller(req);
  if (!caller) return unauthorized(req).response;
  return null;
}
