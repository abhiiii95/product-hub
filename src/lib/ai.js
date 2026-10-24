// Shared AI client (vision + structured JSON output). Server-only. Calls the
// provider's REST API over fetch because the project allows no extra npm packages.
// Provider: Google Gemini when GEMINI_API_KEY is set, otherwise Anthropic Claude
// when ANTHROPIC_API_KEY is set.
import { ApiError } from './api';

const CLAUDE_URL = `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`;
const CLAUDE_MODEL = 'claude-opus-5-5';
const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
// Tried in order; the next one is used when a model is busy or too slow.
// gemini-3.5-flash read the sample Meesho form in ~5 s; the "-latest" alias tracks
// Google's newest Flash model but was much slower when tested (Oct 2026).
const GEMINI_MODELS = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-3.5-flash', 'gemini-flash-latest'];
const TIMEOUT_MS = 55_000;

export function aiProvider() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return null;
}

async function postJson(url, headers, body, timeoutMs = TIMEOUT_MS) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError') throw new ApiError(504, 'The AI took too long to answer. Try again.');
    console.error('[ai] network error', err);
    throw new ApiError(502, 'Could not reach the AI service. Check your connection and try again.');
  }
  return { res, data: await res.json().catch(() => null) };
}

function parseResult(text, reason) {
  try {
    return JSON.parse(text);
  } catch {
    console.error('[ai] unparseable output', reason);
    throw new ApiError(502, 'The AI returned an unreadable answer. Try again.');
  }
}

// content: [{ text } | { image: { mediaType, data(base64) } }] in order.
// Returns the parsed JSON object matching `schema`.
export async function generateJson({ system, content, schema }) {
  const provider = aiProvider();
  if (!provider) throw new ApiError(503, 'AI features are not set up yet. Add GEMINI_API_KEY to the environment.');
  return provider === 'gemini' ? withGemini(system, content, schema) : withClaude(system, content, schema);
}

async function withGemini(system, content, schema) {
  const parts = content.map((c) => (c.image ? { inline_data: { mime_type: c.image.mediaType, data: c.image.data } } : { text: c.text }));
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      maxOutputTokens: 16384,
      // These tasks need little reasoning; low thinking keeps them fast.
      thinkingConfig: { thinkingLevel: 'low' },
    },
  };

  const started = Date.now();
  let res;
  let data;
  for (const [i, model] of GEMINI_MODELS.entries()) {
    const remaining = TIMEOUT_MS - (Date.now() - started);
    const isLast = i === GEMINI_MODELS.length - 1;
    // Leave the later model(s) some of the time budget.
    const budget = isLast ? remaining : Math.min(remaining, 30_000);
    if (budget < 5_000) break;
    try {
      ({ res, data } = await postJson(
        `${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body,
        budget
      ));
    } catch (err) {
      if (!isLast && err instanceof ApiError && err.status === 504) {
        console.warn('[ai] Gemini model too slow, trying next:', model);
        continue;
      }
      throw err;
    }
    const busy = res.status === 429 || res.status >= 500 || res.status === 404;
    if (!busy || isLast) break;
    console.warn('[ai] Gemini model unavailable, trying next:', model, res.status);
  }
  if (!res) throw new ApiError(504, 'The AI took too long to answer. Try again.');
  if (!res.ok) {
    const message = data?.error?.message || '';
    console.error('[ai] Gemini error', res.status, data?.error?.status, message);
    if (res.status === 401 || res.status === 403 || /api key/i.test(message)) throw new ApiError(503, 'The AI service rejected the API key. Check GEMINI_API_KEY.');
    if (res.status === 429) throw new ApiError(503, 'The AI usage limit was reached or the service is busy. Try again in a minute.');
    if (res.status === 413) throw new ApiError(413, 'The images are too large for the AI. Use smaller images.');
    if (res.status >= 500) throw new ApiError(503, 'The AI service is busy right now. Try again in a minute.');
    throw new ApiError(502, 'The AI service could not handle this request. Try again.');
  }
  if (data?.promptFeedback?.blockReason) throw new ApiError(422, 'The AI declined this request.');
  const candidate = data?.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish === 'MAX_TOKENS') throw new ApiError(422, 'The AI answer was too long. Try again with less content.');
  if (finish && finish !== 'STOP') throw new ApiError(422, 'The AI declined this request.');
  const text = (candidate?.content?.parts || [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
  return parseResult(text, finish);
}

async function withClaude(system, content, schema) {
  const blocks = content.map((c) =>
    c.image ? { type: 'image', source: { type: 'base64', media_type: c.image.mediaType, data: c.image.data } } : { type: 'text', text: c.text }
  );
  const { res, data } = await postJson(
    CLAUDE_URL,
    {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      // If the main model declines, the API retries on Anthropic's recommended fallback model.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    {
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      system,
      // These tasks are not reasoning-heavy; low effort keeps them fast.
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: blocks }],
    }
  );
  if (!res.ok) {
    const type = data?.error?.type;
    console.error('[ai] Claude error', res.status, type, data?.error?.message);
    if (res.status === 401 || res.status === 403) throw new ApiError(503, 'The AI service rejected the API key. Check ANTHROPIC_API_KEY.');
    if (res.status === 402 || type === 'billing_error') throw new ApiError(503, 'The AI account has no credit left. Add credit in the Anthropic Console.');
    if (res.status === 429 || res.status === 529 || type === 'overloaded_error') throw new ApiError(503, 'The AI service is busy right now. Try again in a minute.');
    if (res.status === 413) throw new ApiError(413, 'The images are too large for the AI. Use smaller images.');
    throw new ApiError(502, 'The AI service could not handle this request. Try again.');
  }
  if (data.stop_reason === 'refusal') throw new ApiError(422, 'The AI declined this request.');
  if (data.stop_reason === 'max_tokens') throw new ApiError(422, 'The AI answer was too long. Try again with less content.');
  const text = (data.content || []).find((b) => b.type === 'text')?.text;
  return parseResult(text, data.stop_reason);
}
