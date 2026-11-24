// Supabase Edge Function (Deno). Deploy: supabase functions deploy ocr-extract
// Secrets:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (never put this key in the app)
// Optional:  ANTHROPIC_MODEL (default below), OCR_DAILY_LIMIT (default 30 scans per user per day)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';
const LIMIT = Number(Deno.env.get('OCR_DAILY_LIMIT') ?? '30');
const MAX_B64 = 6_000_000; // ~4.5 MB of image

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const TOOL = {
  name: 'record_rows',
  description: 'Record every readable row found on the page. Use null for anything unreadable. Never guess.',
  input_schema: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            session: { type: ['string', 'null'], enum: ['morning', 'evening', null] },
            animal_tag: { type: ['string', 'null'], description: 'cow/animal name, number or tag as written' },
            litres: { type: ['number', 'null'] },
            fat: { type: ['number', 'null'], description: 'fat percent' },
            snf: { type: ['number', 'null'], description: 'SNF percent' },
            amount: { type: ['number', 'null'], description: 'rupees' },
            confidence: { type: 'number', description: '0 to 1, how sure you are about this whole row' },
          },
          required: ['date', 'session', 'animal_tag', 'litres', 'fat', 'snf', 'amount', 'confidence'],
        },
      },
    },
    required: ['rows'],
  },
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // 1) Must be a signed-in user of THIS project
  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u, error: ue } = await sb.auth.getUser();
  if (ue || !u?.user) return json({ error: 'Please sign in to use the scanner.' }, 401);

  // 2) Body checks
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const img: string = body?.image_base64;
  const media: string = body?.media_type ?? 'image/jpeg';
  if (typeof img !== 'string' || img.length < 1000) return json({ error: 'No image received' }, 400);
  if (img.length > MAX_B64) return json({ error: 'Image too large. Take a closer photo.' }, 413);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(media)) return json({ error: 'Unsupported image type' }, 400);
  const kind = ['milk_notebook', 'society_slip', 'receipt'].includes(body?.kind) ? body.kind : 'milk_notebook';
  const today: string = /^\d{4}-\d{2}-\d{2}$/.test(body?.today ?? '') ? body.today : new Date().toISOString().slice(0, 10);
  const tags: string[] = Array.isArray(body?.known_tags) ? body.known_tags.slice(0, 80).map((s: unknown) => String(s).slice(0, 40)) : [];

  // 3) Daily limit (cost control)
  const { data: allowed, error: le } = await sb.rpc('ocr_bump', { p_limit: LIMIT });
  if (le) return json({ error: 'Usage check failed' }, 500);
  if (!allowed) return json({ error: `Daily scan limit (${LIMIT}) reached. Try again tomorrow.` }, 429);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'Scanner is not configured on the server.' }, 500);

  const what = kind === 'society_slip' ? 'a milk society / dairy payment slip'
    : kind === 'receipt' ? 'a paper receipt or bill' : 'a handwritten dairy farmer milk notebook page';
  const prompt =
`This is a photo of ${what}. It may be in Tamil, English or a mix, handwritten or printed.
Extract one row per milk record: date, morning/evening session, animal name/tag, litres, fat %, SNF %, amount in rupees.
Rules:
- Today is ${today}. Dates are day/month/year in India. If only day (or day/month) is written, use the nearest sensible year/month from today. Output YYYY-MM-DD.
- Tamil words: காலை = morning, மாலை = evening, பால் = milk, லிட்டர் = litres, கொழுப்பு = fat.
- Fat is normally 2.5 to 9 and SNF 7.5 to 10. If a number is outside that, use null.
- If a column header applies to many rows (like one date at the top, or morning/evening column), copy it into each row.
- NEVER invent values. If you cannot read a field, use null and lower the confidence.
${tags.length ? `- Known animal tags/names on this farm: ${tags.join(', ')}. Prefer these spellings if the handwriting is close.` : ''}
Call record_rows exactly once.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'record_rows' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media, data: img } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!resp.ok) {
    console.error('anthropic error', resp.status, await resp.text());
    return json({ error: 'The AI service is busy. Please try again.' }, 502);
  }
  const out = await resp.json();
  const block = (out.content ?? []).find((b: any) => b.type === 'tool_use');
  const rows = Array.isArray(block?.input?.rows) ? block.input.rows.slice(0, 200) : [];
  return json({ rows });
});
