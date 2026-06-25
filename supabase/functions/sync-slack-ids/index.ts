import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: contractors, error } = await supabase
      .from('hub_users')
      .select('id, full_name, email, slack_id')
      .in('role', ['contractor', 'admin'])
      .neq('is_developer', true)
      .eq('status', 'active');

    if (error) throw error;

    const updated: string[] = [];
    const notFound: string[] = [];
    const unchanged: string[] = [];
    const errors: string[] = [];

    await Promise.all(
      (contractors ?? []).map(async (c) => {
        if (!c.email) return;
        try {
          const res = await fetch(
            `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(c.email)}`,
            { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
          );
          const json = await res.json();

          if (!json.ok) {
            if (json.error === 'users_not_found') notFound.push(c.full_name);
            else errors.push(`${c.full_name}: ${json.error}`);
            return;
          }

          const slackId = json.user?.id;
          if (!slackId) return;

          if (slackId === c.slack_id) {
            unchanged.push(c.full_name);
            return;
          }

          const { error: updateErr } = await supabase
            .from('hub_users')
            .update({ slack_id: slackId })
            .eq('id', c.id);

          if (updateErr) errors.push(`${c.full_name}: ${updateErr.message}`);
          else updated.push(`${c.full_name}: ${c.slack_id ?? 'none'} → ${slackId}`);
        } catch (err) {
          errors.push(`${c.full_name}: ${String(err)}`);
        }
      })
    );

    return new Response(
      JSON.stringify({ updated, notFound, unchanged: unchanged.length, errors }),
      { headers: cors }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
