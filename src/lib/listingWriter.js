// Writes a fresh title / description / style ID / SKU for ONE product, using only
// that product's saved data, its marketplace listing and its photos. Server-only.
import { generateJson } from './ai';
import { formatCustomValue } from './customFields';

const SYSTEM_PROMPT = `You write fresh marketplace listing text (mainly Meesho, an Indian marketplace) for ONE product. Use only the facts given for this product and what is clearly visible in its photos. The seller reviews your text before using it.

- title: new wording that keeps the key facts (what the product is, pack/count, material, main use or occasion) and uses natural search terms Indian buyers type. Keep it close to the current title's length and at most 150 characters. No emojis, no ALL CAPS words, no unverifiable claims ("best", "No.1", "cheapest"), no other brand names.
- description: plain text only (no markdown, no asterisks or #). 4 to 8 short lines, each starting with "• ", covering what it is, material, size, what is included, how to use it and occasions. State only facts from the data or photos; never invent sizes, materials, certifications, warranties or quantities.
- styleId: a new style code in uppercase letters, digits and hyphens only, 6 to 30 characters, following the meaning of the current code (for example product type, material, pack) but different from every code listed as already used.
- sku: a new SKU in the same format rules, different from every SKU listed as already used and different from the new styleId.
- The new version must read clearly differently from the current and previous versions listed.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'styleId', 'sku'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    styleId: { type: 'string' },
    sku: { type: 'string' },
  },
};

// Downloads a product photo (resized by Cloudinary) for the AI. Only this
// account's Cloudinary URLs are fetched, never arbitrary hosts.
async function loadPhoto(url) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.host !== 'res.cloudinary.com' || !parsed.pathname.startsWith(`/${cloud}/image/upload/`)) return null;
  parsed.pathname = parsed.pathname.replace('/image/upload/', '/image/upload/c_limit,w_1024,h_1024,q_80,f_jpg/');
  try {
    const res = await fetch(parsed, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return { mediaType: 'image/jpeg', data: Buffer.from(await res.arrayBuffer()).toString('base64') };
  } catch {
    return null;
  }
}

export const cleanCode = (text) =>
  String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

// Callers must pass a product the user may see (loadProductForUser). For resellers,
// `previousVersions` is their own saved history so another reseller's work never shapes the prompt.
export async function writeListingVersion({ product, category, listing, previousVersions }) {
  const photos = (await Promise.all((product.images || []).slice(0, 4).map((img) => loadPhoto(img.url)))).filter(Boolean);
  const previous = previousVersions || listing?.previousVersions || [];

  const facts = {
    productName: product.name,
    internalSku: product.sku,
    category: category?.name || null,
    brand: product.brand || null,
    productType: product.productType || null,
    material: product.material || null,
    color: product.color || null,
    dimensions: product.dimensions?.length || product.dimensions?.width || product.dimensions?.height ? product.dimensions : null,
    weightGrams: product.weight ?? null,
    description: product.description || null,
    categoryDetails: Object.fromEntries(
      (category?.fields || [])
        .map((f) => [f.label, formatCustomValue(f, product.customFields?.[f.key])])
        .filter(([, v]) => v !== '')
    ),
    tags: product.tags || [],
    keywords: product.keywords || [],
    currentListing: listing
      ? {
          title: listing.title,
          description: listing.description,
          styleId: listing.styleId,
          sku: listing.marketplaceSku || null,
          attributes: (listing.attributes || []).slice(0, 40),
        }
      : null,
  };
  const usedStyleIds = [...new Set([listing?.styleId, ...previous.map((v) => v.styleId)].filter(Boolean))];
  const usedSkus = [...new Set([product.sku, listing?.marketplaceSku, ...previous.map((v) => v.marketplaceSku)].filter(Boolean))];
  const previousTitles = previous.map((v) => v.title).filter(Boolean).slice(-10);

  const content = [];
  if (photos.length) {
    content.push({ text: `Product photos (${photos.length}):` });
    photos.forEach((image) => content.push({ image }));
  }
  content.push({
    text: [
      `Product facts (JSON):\n${JSON.stringify(facts)}`,
      `Style IDs already used: ${JSON.stringify(usedStyleIds)}`,
      `SKUs already used: ${JSON.stringify(usedSkus)}`,
      `Previous titles: ${JSON.stringify(previousTitles)}`,
      'Write one new version.',
    ].join('\n\n'),
  });

  const out = await generateJson({ system: SYSTEM_PROMPT, content, schema: SCHEMA });
  return {
    title: String(out.title || '').trim().slice(0, 300),
    description: String(out.description || '').trim().slice(0, 10000),
    styleId: cleanCode(out.styleId),
    sku: cleanCode(out.sku),
    usedPhotos: photos.length,
  };
}
