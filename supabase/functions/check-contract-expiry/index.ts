import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Alert at 30, 14, 7, and 1 days before expiry
const ALERT_DAYS = [30, 14, 7, 1];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: contractors } = await supabase
    .from('hub_users')
    .select('id, full_name, contract_expiry_date')
    .eq('status', 'active')
    .in('role', ['contractor'])
    .not('contract_expiry_date', 'is', null);

  const expiring = (contractors || []).filter((c: any) => {
    const expiry = new Date(c.contract_expiry_date + 'T00:00:00');
    const daysUntil = Math.round((expiry.getTime() - today.getTime()) / 86400000);
    return ALERT_DAYS.includes(daysUntil);
  }).map((c: any) => {
    const expiry = new Date(c.contract_expiry_date + 'T00:00:00');
    const daysUntil = Math.round((expiry.getTime() - today.getTime()) / 86400000);
    return { full_name: c.full_name, contract_expiry_date: c.contract_expiry_date, days_until: daysUntil };
  });

  if (expiring.length > 0) {
    await supabase.functions.invoke('notify-admin', {
      body: { type: 'contract_expiring', data: { contractors: expiring } },
    });
  }

  return new Response(JSON.stringify({ checked: contractors?.length || 0, alerts: expiring.length }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
