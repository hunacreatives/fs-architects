import { corsHeaders, errorResponse, requireAdmin, serviceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  try {
    await requireAdmin(req);

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: corsHeaders(req) });
    }

    // Don't hard-delete the auth user — it cascades and destroys the hub_users
    // row, which wipes payroll/attendance/task history tied to it via FK. Instead,
    // revoke login access and mark them inactive so historical records (incl.
    // archived payroll periods) still show them.
    const supabase = serviceClient();
    const { error: banError } = await supabase.auth.admin.updateUserById(user_id, { ban_duration: '876000h' });
    if (banError) {
      return new Response(JSON.stringify({ error: banError.message }), { status: 400, headers: corsHeaders(req) });
    }
    const { error: statusError } = await supabase.from('hub_users').update({ status: 'inactive' }).eq('id', user_id);
    if (statusError) {
      return new Response(JSON.stringify({ error: statusError.message }), { status: 400, headers: corsHeaders(req) });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders(req) });
  } catch (err) {
    return errorResponse(req, err);
  }
});
