// Reads marketplace-form screenshots with an AI vision model and maps them to
// Product Hub fields. Server-only.
import { aiProvider, generateJson } from './ai';

// The screenshot box is shown only when an AI provider is configured.
export const screenshotProvider = aiProvider;

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

// images: [{ mediaType, data(base64) }]; categories: active category documents.
export async function extractFromScreenshots(images, categories) {
  const catalog = describeCategories(categories);
  const content = [];
  images.forEach((img, i) => {
    content.push({ text: `Screenshot part ${i + 1} of ${images.length}:` });
    content.push({ image: img });
  });
  content.push({ text: `Product Hub categories (JSON):\n${JSON.stringify(catalog)}\n\nExtract the form fields and map them as instructed.` });
  return generateJson({ system: SYSTEM_PROMPT, content, schema: buildSchema(catalog.map((c) => c.id)) });
}
