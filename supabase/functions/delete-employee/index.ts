import { corsHeaders, errorResponse, requireAdmin, serviceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  try {
    await requireAdmin(req);

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: corsHeaders(req) });
    }

    // Delete auth user — cascades to hub_users
    const supabase = serviceClient();
    const { error } = await supabase.auth.admin.deleteUser(user_id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders(req) });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders(req) });
  } catch (err) {
    return errorResponse(req, err);
  }
});
