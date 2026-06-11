const WEB3FORMS_CAREERS_KEY = Deno.env.get('WEB3FORMS_CAREERS_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const {
      name, email, role, expected_rate,
      portfolio_link, resume_link,
      resume_filename, resume_base64, resume_mime,
      message,
    } = await req.json();

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: cors });
    }

    const payload = new FormData();
    payload.append('access_key', WEB3FORMS_CAREERS_KEY);
    payload.append('_gotcha', '');
    payload.append('name', name);
    payload.append('email', email);
    if (role)           payload.append('role', role);
    if (expected_rate)  payload.append('expected_rate', expected_rate);
    if (portfolio_link) payload.append('portfolio_link', portfolio_link);
    if (resume_link)    payload.append('resume_link', resume_link);
    payload.append('message', message);

    // Attach resume file if provided as base64
    if (resume_base64 && resume_filename) {
      const bytes = Uint8Array.from(atob(resume_base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: resume_mime || 'application/octet-stream' });
      payload.append('attachment', blob, resume_filename);
    }

    const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: payload });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err?.message ?? `Submit failed (${res.status})` }), { status: 502, headers: cors });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
