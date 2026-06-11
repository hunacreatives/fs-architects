const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const SYSTEM_PROMPT = `You are a project data extractor for a creative agency. Extract project details AND tasks from the provided document.

Return ONLY valid JSON with exactly these fields:
{
  "project_name": string,
  "client_name": string,
  "project_type": "client" | "retainer" | "internal",
  "service": string (e.g. "Website Design", "Branding", "Social Media Management"),
  "contract_price": number | null,
  "monthly_rate": number | null,
  "start_date": string | null (YYYY-MM-DD),
  "deadline": string | null (YYYY-MM-DD),
  "notes": string | null (max 2 sentences),
  "tasks": [
    {
      "title": string,
      "description": string | null,
      "priority": "low" | "medium" | "high",
      "start_date": string | null (YYYY-MM-DD),
      "due_date": string | null (YYYY-MM-DD)
    }
  ]
}

For tasks: extract every task, deliverable, milestone, or to-do item listed in the document. If none are found, return an empty array.
Use null for any field that cannot be determined. Return ONLY the JSON object with no explanation or markdown.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { file_base64, mime_type, file_name } = await req.json();

    let content: unknown[];

    if (mime_type === 'application/pdf') {
      content = [
        { type: 'text', text: 'Extract project details and tasks from this document.' },
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file_base64 } },
      ];
    } else if (mime_type.startsWith('image/')) {
      content = [
        { type: 'text', text: 'Extract project details and tasks from this document image.' },
        { type: 'image', source: { type: 'base64', media_type: mime_type, data: file_base64 } },
      ];
    } else {
      const text = new TextDecoder().decode(Uint8Array.from(atob(file_base64), c => c.charCodeAt(0)));
      content = [{ type: 'text', text: `Extract project details and tasks from this document:\n\n${text.slice(0, 12000)}` }];
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `Claude error: ${err}` }), { status: 500, headers: cors });
    }

    const result = await res.json();
    const text = result.content[0].text;
    const extracted = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text);
    return new Response(JSON.stringify(extracted), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
