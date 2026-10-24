// Reads marketplace-form screenshots with an AI vision model (structured JSON
// output) and maps them to Product Hub fields. Server-only. Calls the provider's
// REST API over fetch because the project allows no extra npm packages.
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

export function screenshotProvider() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return null;
}

const SYSTEM_PROMPT = `You read screenshots of e-commerce seller forms (mostly Meesho "Add Catalog" pages) and turn them into data for a product database. The seller reviews everything you return before saving, so accuracy matters more than completeness: never invent a value that is not visible.

How to read the screenshot:
- Return every product form field as a label/value pair in "fields", in the order they appear on screen (top to bottom, left to right). Use the label text as shown, without the required-field asterisk. Keep values exactly as shown, including units and capitalisation.
- A dropdown's value is its selected option. A greyed or disabled field that shows an auto-filled value (for example a packer filled from "Same as Manufacturer Details", or "Not Required") is a real value; include it. Skip generic placeholders such as "Select", "Enter value" or "Search".
- For price/size/inventory tables, output one pair per column for the row (e.g. "Size", "Meesho Price", "Wrong/Defective Returns Price", "MRP", "Inventory", "SKU").
- Ignore page navigation, help text, image guidelines, image upload areas, bank settlement and customer price breakdowns, terms/legal text, and form controls that are not product attributes (e.g. "Copy input details to all product").
- Input boxes often cut long text off. If a value looks truncated, use the full version if it is visible anywhere else on the page (for example the product title in a price breakdown card); otherwise return what is visible and say which field is truncated in "notes".
- The images may be consecutive slices of one tall screenshot with a small overlap; do not list a field twice because it appears in two slices.

How to map to the product ("product" object; use "" when a value is not shown):
- name: the product name/title (full, untruncated if available). sku: the style code / product ID / SKU.
- sellingPrice: the marketplace selling price (e.g. "Meesho Price"), digits only. mrp: the MRP, digits only. stock: inventory quantity, digits only.
- weightGrams: the net weight in grams if shown (convert kg to g), otherwise the product weight in grams; digits only.
- dimensionLength / dimensionWidth (breadth) / dimensionHeight: numbers only, with dimensionUnit "cm" or "inch" from the product unit field ("" if no dimensions).
- color, material, brand, productType, description: as shown. keywords: search keywords or tags if the form shows any, otherwise [].
- categoryId: pick the id of the Product Hub category below that clearly matches this kind of product, or "" if none fits. Then fill "customFields" only with keys of that category's fields, using values from the screenshot (for dropdown fields, use one of the listed options exactly, otherwise leave it out; for checkbox fields use "true" or "false").
- listing: title = full product name, description = description, styleId = style code, suggestedPrice = selling price, packQuantity = pack/net quantity digits if shown, marketplaceCategory = the marketplace category path if visible.
- notes: one short sentence about anything the seller should double-check (truncated or unreadable values); "" if nothing.`;

function buildSchema(categoryIds) {
  const str = { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['fields', 'product', 'categoryId', 'customFields', 'listing', 'notes'],
    properties: {
      fields: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'value'],
          properties: { label: str, value: str },
        },
      },
      product: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name', 'sku', 'brand', 'description', 'productType', 'material', 'color',
          'dimensionLength', 'dimensionWidth', 'dimensionHeight', 'dimensionUnit',
          'weightGrams', 'sellingPrice', 'mrp', 'stock', 'keywords',
        ],
        properties: {
          name: str, sku: str, brand: str, description: str, productType: str, material: str, color: str,
          dimensionLength: str, dimensionWidth: str, dimensionHeight: str,
          dimensionUnit: { type: 'string', enum: ['cm', 'inch', ''] },
          weightGrams: str, sellingPrice: str, mrp: str, stock: str,
          keywords: { type: 'array', items: str },
        },
      },
      categoryId: { type: 'string', enum: [...categoryIds, ''] },
      customFields: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'value'],
          properties: { key: str, value: str },
        },
      },
      listing: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'styleId', 'marketplaceCategory', 'suggestedPrice', 'packQuantity'],
        properties: { title: str, description: str, styleId: str, marketplaceCategory: str, suggestedPrice: str, packQuantity: str },
      },
      notes: str,
    },
  };
}

function describeCategories(categories) {
  return categories.map((c) => ({
    id: c._id.toString(),
    name: c.name,
    fields: (c.fields || []).map((f) => ({ key: f.key, label: f.label, type: f.type, ...(f.type === 'dropdown' ? { options: f.options } : {}) })),
  }));
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
    if (err?.name === 'TimeoutError') throw new ApiError(504, 'Reading the screenshot took too long. Try again, or crop it to the form area.');
    console.error('[extract] network error', err);
    throw new ApiError(502, 'Could not reach the AI service. Check your connection and try again.');
  }
  return { res, data: await res.json().catch(() => null) };
}

function parseResult(text, reason) {
  try {
    return JSON.parse(text);
  } catch {
    console.error('[extract] unparseable output', reason);
    throw new ApiError(502, 'The AI returned an unreadable answer. Try again.');
  }
}

// images: [{ mediaType, data(base64) }]; categories: active category documents.
export async function extractFromScreenshots(images, categories) {
  const provider = screenshotProvider();
  if (!provider) throw new ApiError(503, 'Screenshot reading is not set up yet. Add GEMINI_API_KEY to the environment.');
  const catalog = describeCategories(categories);
  const schema = buildSchema(catalog.map((c) => c.id));
  const instruction = `Product Hub categories (JSON):\n${JSON.stringify(catalog)}\n\nExtract the form fields and map them as instructed.`;
  return provider === 'gemini' ? extractWithGemini(images, schema, instruction) : extractWithClaude(images, schema, instruction);
}

async function extractWithGemini(images, schema, instruction) {
  const parts = [];
  images.forEach((img, i) => {
    parts.push({ text: `Screenshot part ${i + 1} of ${images.length}:` });
    parts.push({ inline_data: { mime_type: img.mediaType, data: img.data } });
  });
  parts.push({ text: instruction });

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      maxOutputTokens: 16384,
      // Reading a form needs little reasoning; low thinking keeps it fast.
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
        console.warn('[extract] Gemini model too slow, trying next:', model);
        continue;
      }
      throw err;
    }
    const busy = res.status === 429 || res.status >= 500 || res.status === 404;
    if (!busy || isLast) break;
    console.warn('[extract] Gemini model unavailable, trying next:', model, res.status);
  }
  if (!res) throw new ApiError(504, 'Reading the screenshot took too long. Try again, or crop it to the form area.');
  if (!res.ok) {
    const message = data?.error?.message || '';
    console.error('[extract] Gemini error', res.status, data?.error?.status, message);
    if (res.status === 401 || res.status === 403 || /api key/i.test(message)) throw new ApiError(503, 'The AI service rejected the API key. Check GEMINI_API_KEY.');
    if (res.status === 429) throw new ApiError(503, 'The AI usage limit was reached or the service is busy. Try again in a minute.');
    if (res.status === 413) throw new ApiError(413, 'The screenshot is too large. Crop it to the form area and try again.');
    if (res.status >= 500) throw new ApiError(503, 'The AI service is busy right now. Try again in a minute.');
    throw new ApiError(502, 'The AI service could not read this screenshot. Try again.');
  }
  if (data?.promptFeedback?.blockReason) throw new ApiError(422, 'The AI declined to read this screenshot.');
  const candidate = data?.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish === 'MAX_TOKENS') throw new ApiError(422, 'The screenshot has too much content to read at once. Crop it to the form area.');
  if (finish && finish !== 'STOP') throw new ApiError(422, 'The AI declined to read this screenshot.');
  const text = (candidate?.content?.parts || [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
  return parseResult(text, finish);
}

async function extractWithClaude(images, schema, instruction) {
  const content = [];
  images.forEach((img, i) => {
    content.push({ type: 'text', text: `Screenshot part ${i + 1} of ${images.length}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
  });
  content.push({ type: 'text', text: instruction });

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
      system: SYSTEM_PROMPT,
      // Reading a form is not reasoning-heavy; low effort keeps it fast.
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    }
  );
  if (!res.ok) {
    const type = data?.error?.type;
    console.error('[extract] API error', res.status, type, data?.error?.message);
    if (res.status === 401 || res.status === 403) throw new ApiError(503, 'The AI service rejected the API key. Check ANTHROPIC_API_KEY.');
    if (res.status === 402 || type === 'billing_error') throw new ApiError(503, 'The AI account has no credit left. Add credit in the Anthropic Console.');
    if (res.status === 429 || res.status === 529 || type === 'overloaded_error') throw new ApiError(503, 'The AI service is busy right now. Try again in a minute.');
    if (res.status === 413) throw new ApiError(413, 'The screenshot is too large. Crop it to the form area and try again.');
    throw new ApiError(502, 'The AI service could not read this screenshot. Try again.');
  }

  if (data.stop_reason === 'refusal') throw new ApiError(422, 'The AI declined to read this screenshot.');
  if (data.stop_reason === 'max_tokens') throw new ApiError(422, 'The screenshot has too much content to read at once. Crop it to the form area.');
  const text = (data.content || []).find((b) => b.type === 'text')?.text;
  return parseResult(text, data.stop_reason);
}
