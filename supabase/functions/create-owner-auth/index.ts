import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const AUTH_ID = '7a2ac130-53c6-4402-a43c-98cc320639dd';
  const NEW_PASSWORD = 'HunaOwner2026';

  // Reset password (no special chars to rule out encoding issues)
  const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
    AUTH_ID,
    { password: NEW_PASSWORD, email_confirm: true }
  );

  // Check hub_users row exists
  const { data: hubUser, error: hubError } = await supabase
    .from('hub_users')
    .select('id, full_name, role, email')
    .eq('id', AUTH_ID)
    .maybeSingle();

  return new Response(JSON.stringify({
    password_reset_ok: !updateError,
    password_reset_error: updateError?.message,
    updated_email: updateData?.user?.email,
    new_password: NEW_PASSWORD,
    hub_users_row: hubUser ?? null,
    hub_users_error: hubError?.message,
  }, null, 2), { headers: { 'Content-Type': 'application/json' } });
});
