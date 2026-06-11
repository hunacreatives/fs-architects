import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  return new Response(JSON.stringify({
    ok: false,
    message: 'slack-onboarding is intentionally disabled in this pilot build.',
  }), {
    status: 501,
    headers: CORS,
  });
});
