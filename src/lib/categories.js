import { randomBytes } from 'node:crypto';
import { FIELD_TYPES } from './constants';
import { Validator, fieldKeyFrom, slugify } from './validate';

export function serializeCategory(category, { productCount } = {}) {
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description || '',
    isActive: category.isActive !== false,
    fields: [...(category.fields || [])].sort((a, b) => a.order - b.order),
    productCount,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

// Normalises the dynamic field configuration submitted by the Admin.
// Each field keeps a stable `id` so renaming its key can migrate stored values.
export function buildFields(input, v) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    v.fail('fields', 'Fields must be a list');
    return [];
  }
  if (input.length > 60) v.fail('fields', 'A category can have at most 60 custom fields');
  const keys = new Set();
  const fields = input.slice(0, 60).map((raw, index) => {
    const label = v.string(`fields.${index}.label`, raw?.label, { required: true, max: 80, label: `Field ${index + 1} label` });
    const key = fieldKeyFrom(raw?.key || label || '');
    if (!key) v.fail(`fields.${index}.key`, `Field ${index + 1} needs a name`);
    else if (keys.has(key)) v.fail(`fields.${index}.key`, `Duplicate field name "${key}"`);
    keys.add(key);
    const type = v.oneOf(`fields.${index}.type`, raw?.type, FIELD_TYPES, { label: `Field ${index + 1} type` });
    let options = [];
    if (type === 'dropdown') {
      options = v.list(`fields.${index}.options`, raw?.options, { maxItems: 100, label: `Field ${index + 1} options` }) || [];
      if (options.length === 0) v.fail(`fields.${index}.options`, `Dropdown "${label}" needs at least one option`);
    }
    const order = Number.isFinite(Number(raw?.order)) ? Number(raw.order) : index;
    return {
      id: typeof raw?.id === 'string' && /^[a-f0-9]{16}$/.test(raw.id) ? raw.id : randomBytes(8).toString('hex'),
      key,
      label,
      type,
      options,
      required: v.boolean(raw?.required),
      helpText: v.string(`fields.${index}.helpText`, raw?.helpText, { max: 200, label: 'Help text' }) || '',
      order,
    };
  });
  // Normalise order to 0..n-1 following the requested order.
  fields.sort((a, b) => a.order - b.order).forEach((f, i) => (f.order = i));
  return fields;
}

export function buildCategoryInput(body, { isCreate }) {
  const v = new Validator();
  const doc = {};
  if (isCreate || body.name !== undefined) {
    doc.name = v.string('name', body.name, { required: true, max: 100, label: 'Category name' });
    doc.slug = slugify(doc.name || '');
    if (doc.name && !doc.slug) v.fail('name', 'Category name must contain letters or numbers');
  }
  if (isCreate || body.description !== undefined) {
    doc.description = v.string('description', body.description, { max: 1000, label: 'Description' });
  }
  if (body.isActive !== undefined) doc.isActive = body.isActive === true;
  const fields = buildFields(body.fields ?? (isCreate ? [] : undefined), v);
  if (fields !== undefined) doc.fields = fields;
  v.assert();
  return doc;
}
