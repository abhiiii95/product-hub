'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomFieldInput from './CustomFieldInput';
import { useToast } from './Feedback';
import { checkImageFile } from './ImageManager';
import ScreenshotImport from './ScreenshotImport';
import { api, formatMoney, formatPercent, uploadProductImages } from '@/lib/client';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/constants';
import { computePricing } from '@/lib/pricing';

const EMPTY = {
  name: '',
  sku: '',
  categoryId: '',
  brand: '',
  description: '',
  productType: '',
  material: '',
  color: '',
  dimensions: { length: '', width: '', height: '', unit: 'cm' },
  weight: '',
  purchaseCost: '',
  packagingCost: '',
  additionalCost: '',
  sellingPrice: '',
  stock: '0',
  lowStockThreshold: '5',
  supplier: '',
  internalNotes: '',
  status: 'active',
  tags: '',
  keywords: '',
  customFields: {},
};

function fromProduct(p) {
  const blank = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    ...EMPTY,
    name: p.name,
    sku: p.sku,
    categoryId: p.categoryId || '',
    brand: p.brand,
    description: p.description,
    productType: p.productType,
    material: p.material,
    color: p.color,
    dimensions: {
      length: blank(p.dimensions?.length),
      width: blank(p.dimensions?.width),
      height: blank(p.dimensions?.height),
      unit: p.dimensions?.unit || 'cm',
    },
    weight: blank(p.weight),
    purchaseCost: blank(p.purchaseCost),
    packagingCost: blank(p.packagingCost),
    additionalCost: blank(p.additionalCost),
    sellingPrice: blank(p.sellingPrice),
    lowStockThreshold: blank(p.lowStockThreshold),
    supplier: p.supplier,
    internalNotes: p.internalNotes,
    status: p.status,
    tags: (p.tags || []).join(', '),
    keywords: (p.keywords || []).join(', '),
    customFields: p.customFields || {},
  };
}

// First number in a string ("₹ 1,230.50" → "1230.50"), or "".
function onlyNumber(text) {
  const match = String(text ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return match ? match[0] : '';
}

function Field({ id, label, required, error, hint, className, children }) {
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

export default function ProductForm({ product }) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = Boolean(product);
  const [values, setValues] = useState(() => (product ? fromProduct(product) : EMPTY));
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  // Values filled from a screenshot (highlighted until saved) and the Meesho listing draft built from it.
  const [aiFilled, setAiFilled] = useState(() => new Set());
  const [aiNote, setAiNote] = useState('');
  const [listingDraft, setListingDraft] = useState(null);
  // Images picked on the Add Product form; uploaded right after the product is created.
  const [pickedImages, setPickedImages] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('');
  const imageInputRef = useRef(null);
  const pickedRef = useRef(pickedImages);
  pickedRef.current = pickedImages;
  useEffect(() => () => pickedRef.current.forEach((img) => URL.revokeObjectURL(img.preview)), []);

  const addImages = (fileList) => {
    const items = Array.from(fileList).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
      error: checkImageFile(file),
    }));
    setPickedImages((list) => [...list, ...items]);
  };
  const removeImage = (key) =>
    setPickedImages((list) => {
      const item = list.find((x) => x.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return list.filter((x) => x.key !== key);
    });
  const moveImage = (index, delta) =>
    setPickedImages((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  // Uploads picked images one by one; returns the number that failed.
  const uploadPicked = async (productId) => {
    const valid = pickedImages.filter((img) => !img.error);
    const progress = valid.map(() => 0);
    setUploadStatus(`Uploading ${valid.length} image(s)… 0%`);
    const { failed, lastError } = await uploadProductImages(
      productId,
      valid.map((img) => img.file),
      {
        onItem: (i, state) => {
          if (state.progress !== undefined) progress[i] = state.progress;
          else if (state.done || state.error) progress[i] = 100;
          const overall = Math.round(progress.reduce((a, b) => a + b, 0) / valid.length);
          setUploadStatus(`Uploading ${valid.length} image(s)… ${overall}%`);
        },
      }
    );
    setUploadStatus('');
    return { failed, total: valid.length, lastError };
  };

  useEffect(() => {
    api('/api/categories').then((res) => {
      if (res.ok) setCategories(res.data.categories);
      else setFormError(`Could not load categories: ${res.error}`);
    });
  }, []);

  const category = useMemo(() => categories.find((c) => c.id === values.categoryId) || null, [categories, values.categoryId]);
  const pricing = computePricing(values);

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const setDim = (key) => (e) => setValues((v) => ({ ...v, dimensions: { ...v.dimensions, [key]: e.target.value } }));
  const setCustom = (key) => (val) => setValues((v) => ({ ...v, customFields: { ...v.customFields, [key]: val } }));
  const inputProps = (key) => ({
    id: `p-${key}`,
    name: key,
    value: values[key],
    onChange: set(key),
    className: aiFilled.has(key) ? 'ai-filled' : undefined,
    'aria-invalid': errors[key] ? 'true' : undefined,
  });

  // Fills the form from the AI's reading of a screenshot. Nothing is saved.
  const applyExtraction = (result) => {
    const p = result.product || {};
    const next = { ...values, dimensions: { ...values.dimensions }, customFields: { ...values.customFields } };
    const filled = new Set();
    const put = (key, raw) => {
      const v = String(raw ?? '').trim();
      if (v) {
        next[key] = v;
        filled.add(key);
      }
    };
    put('name', p.name);
    put('sku', String(p.sku || '').trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._\-/]/g, ''));
    put('brand', p.brand);
    put('description', p.description);
    put('productType', p.productType);
    put('material', p.material);
    put('color', p.color);
    put('weight', onlyNumber(p.weightGrams));
    put('sellingPrice', onlyNumber(p.sellingPrice));
    put('stock', onlyNumber(p.stock));
    if (p.keywords?.length) put('keywords', p.keywords.join(', '));
    const dims = { length: onlyNumber(p.dimensionLength), width: onlyNumber(p.dimensionWidth), height: onlyNumber(p.dimensionHeight) };
    if (dims.length || dims.width || dims.height) {
      next.dimensions = { ...dims, unit: p.dimensionUnit || next.dimensions.unit };
      filled.add('dimensions');
    }
    const cat = categories.find((c) => c.id === result.categoryId && c.isActive);
    if (cat) {
      next.categoryId = cat.id;
      filled.add('categoryId');
      next.customFields = {};
      for (const { key, value } of result.customFields || []) {
        const field = cat.fields.find((f) => f.key === key);
        if (!field) continue;
        let v = String(value ?? '').trim();
        if (field.type === 'checkbox') v = /^(true|yes|y|1)$/i.test(v);
        else if (field.type === 'number') v = onlyNumber(v);
        else if (field.type === 'dropdown') v = (field.options || []).find((o) => o.toLowerCase() === v.toLowerCase()) || '';
        if (v === '') continue;
        next.customFields[key] = v;
        filled.add(`cf:${key}`);
      }
    }
    setValues(next);
    setAiFilled(filled);
    setAiNote(result.notes || '');
    const l = result.listing || {};
    const attributes = (result.fields || [])
      .filter((f) => String(f.label || '').trim())
      .map((f) => ({ name: String(f.label).trim(), value: String(f.value ?? '').trim() }));
    setListingDraft({
      title: l.title || next.name,
      styleId: l.styleId || '',
      marketplaceCategory: l.marketplaceCategory || '',
      suggestedPrice: onlyNumber(l.suggestedPrice),
      packQuantity: onlyNumber(l.packQuantity),
      attributes,
    });
    setErrors({});
    toast(`Filled ${filled.size} product fields and ${attributes.length} Meesho fields. Check them before saving.`, 'success');
  };

  const setDraft = (key) => (e) => setListingDraft((d) => ({ ...d, [key]: e.target.value }));
  const setDraftAttr = (index, key, val) =>
    setListingDraft((d) => ({ ...d, attributes: d.attributes.map((a, i) => (i === index ? { ...a, [key]: val } : a)) }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    if (Number(values.sellingPrice) > 0 && pricing.profit < 0) {
      // Not blocking – just make sure the admin noticed.
      toast('Note: the selling price is below the total cost.', 'info');
    }
    setSaving(true);
    const body = { ...values };
    if (isEdit) delete body.stock;
    // Only send custom values for the selected category's fields.
    body.customFields = Object.fromEntries((category?.fields || []).map((f) => [f.key, values.customFields[f.key]]));
    const res = await api(isEdit ? `/api/products/${product.id}` : '/api/products', { method: isEdit ? 'PATCH' : 'POST', body });
    setSaving(false);
    if (!res.ok) {
      setFormError(res.error);
      setErrors(res.data?.details || {});
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (isEdit) {
      toast('Product saved', 'success');
      router.push(`/products/${product.id}`);
      router.refresh();
      return;
    }
    const newId = res.data.product.id;
    if (listingDraft) {
      const listingRes = await api('/api/listings', {
        method: 'POST',
        body: {
          productId: newId,
          marketplace: 'meesho',
          title: listingDraft.title,
          description: values.description,
          styleId: listingDraft.styleId,
          marketplaceCategory: listingDraft.marketplaceCategory,
          suggestedPrice: listingDraft.suggestedPrice,
          packQuantity: listingDraft.packQuantity,
          keywords: values.keywords,
          attributes: listingDraft.attributes.filter((a) => a.name.trim()),
        },
      });
      if (!listingRes.ok) toast(`Product created, but the Meesho listing could not be saved: ${listingRes.error}`, 'error');
    }
    if (pickedImages.some((img) => !img.error)) {
      setSaving(true);
      const { failed, total, lastError } = await uploadPicked(newId);
      setSaving(false);
      if (failed) {
        toast(`Product created, but ${failed} of ${total} image(s) failed: ${lastError}`, 'error');
        router.push(`/products/${newId}/edit#images`);
        return;
      }
      toast(`Product created with ${total} image(s)`, 'success');
      router.push(`/products/${newId}`);
      return;
    }
    toast('Product created. Add images below.', 'success');
    router.push(`/products/${newId}/edit#images`);
  };

  return (
    <form onSubmit={onSubmit}>
      {formError && <div className="alert alert-error" role="alert">{formError}</div>}

      {!isEdit && <ScreenshotImport onResult={applyExtraction} disabled={saving} />}
      {aiFilled.size > 0 && (
        <div className="alert alert-info" role="status">
          <strong>Filled from screenshot.</strong> Highlighted fields were filled automatically. Check every field (and add costs) before you click Create
          product.
          {aiNote && <div className="mt-1">⚠ {aiNote}</div>}
        </div>
      )}

      {!isEdit && (
        <fieldset>
          <legend>Images</legend>
          <p className="small muted">
            Select any number of images. The first one is the main (front) image. They upload right after the product is created.
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={() => imageInputRef.current?.click()} disabled={saving}>
              Choose images…
            </button>
            <span className="small muted">
              JPEG, PNG, WebP, GIF or AVIF, up to {MAX_IMAGE_BYTES / 1024 / 1024} MB each
            </span>
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              hidden
              onChange={(e) => {
                addImages(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {pickedImages.length > 0 && (
            <div className="image-list mt-1">
              {pickedImages.map((img, index) => (
                <div key={img.key} className="image-tile">
                  <div className="thumb">
                    <img src={img.preview} alt="" />
                    {index === 0 && <span className="badge badge-primary main-flag">Main image</span>}
                  </div>
                  <div className="tile-body">
                    <div className="small truncate">{img.file.name}</div>
                    {img.error && <div className="small" style={{ color: 'var(--danger)' }}>{img.error}</div>}
                    <div className="tile-actions">
                      <button type="button" className="btn btn-sm" disabled={index === 0} onClick={() => moveImage(index, -1)} aria-label={`Move ${img.file.name} earlier`}>
                        ←
                      </button>
                      <button type="button" className="btn btn-sm" disabled={index === pickedImages.length - 1} onClick={() => moveImage(index, 1)} aria-label={`Move ${img.file.name} later`}>
                        →
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeImage(img.key)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </fieldset>
      )}

      <fieldset>
        <legend>Basic information</legend>
        <div className="form-grid">
          <Field id="p-name" label="Product name" required error={errors.name} className="span-all">
            <input type="text" required maxLength={200} {...inputProps('name')} />
          </Field>
          <Field id="p-sku" label="SKU / internal ID" error={errors.sku} hint={isEdit ? undefined : 'Leave blank to generate one'}>
            <input type="text" maxLength={60} required={isEdit} pattern="[A-Za-z0-9._\-\/]+" {...inputProps('sku')} />
          </Field>
          <Field id="p-categoryId" label="Category" error={errors.categoryId}>
            <select {...inputProps('categoryId')}>
              <option value="">No category</option>
              {categories
                .filter((c) => c.isActive || c.id === values.categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isActive ? '' : ' (inactive)'}
                  </option>
                ))}
            </select>
          </Field>
          <Field id="p-status" label="Status">
            <select {...inputProps('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive (hidden from listing users)</option>
            </select>
          </Field>
          <Field id="p-brand" label="Brand" error={errors.brand}>
            <input type="text" maxLength={100} {...inputProps('brand')} />
          </Field>
          <Field id="p-productType" label="Product type" error={errors.productType}>
            <input type="text" maxLength={100} {...inputProps('productType')} />
          </Field>
          <Field id="p-material" label="Material" error={errors.material}>
            <input type="text" maxLength={100} {...inputProps('material')} />
          </Field>
          <Field id="p-color" label="Color" error={errors.color}>
            <input type="text" maxLength={100} {...inputProps('color')} />
          </Field>
          <Field id="p-description" label="Description" error={errors.description} className="span-all">
            <textarea maxLength={10000} rows={5} {...inputProps('description')} />
          </Field>
          <Field id="p-tags" label="Tags" error={errors.tags} hint="Comma separated">
            <input type="text" {...inputProps('tags')} />
          </Field>
          <Field id="p-keywords" label="Keywords" error={errors.keywords} hint="Comma separated, used for search">
            <input type="text" {...inputProps('keywords')} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>{category ? `${category.name} details` : 'Category details'}</legend>
        {!category && <p className="muted small">Select a category to fill in its specific fields.</p>}
        {category && category.fields.length === 0 && (
          <p className="muted small">This category has no custom fields yet. Add them under Categories &amp; Fields.</p>
        )}
        {category && category.fields.length > 0 && (
          <div className="form-grid">
            {category.fields.map((field) => (
              <CustomFieldInput
                key={field.id}
                field={field}
                value={values.customFields[field.key]}
                onChange={setCustom(field.key)}
                error={errors[`customFields.${field.key}`]}
                highlight={aiFilled.has(`cf:${field.key}`)}
              />
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Dimensions &amp; weight</legend>
        <div className="form-grid">
          <Field id="p-dim-unit" label="Dimension unit">
            <select id="p-dim-unit" value={values.dimensions.unit} onChange={setDim('unit')}>
              <option value="cm">Centimetre (cm)</option>
              <option value="inch">Inch</option>
            </select>
          </Field>
          {['length', 'width', 'height'].map((d) => (
            <Field key={d} id={`p-dim-${d}`} label={`${d[0].toUpperCase()}${d.slice(1)} (${values.dimensions.unit})`} error={errors[`dimensions.${d}`]}>
              <input
                id={`p-dim-${d}`}
                type="number"
                min="0"
                step="0.01"
                value={values.dimensions[d]}
                onChange={setDim(d)}
                className={aiFilled.has('dimensions') ? 'ai-filled' : undefined}
              />
            </Field>
          ))}
          <Field id="p-weight" label="Weight (grams)" error={errors.weight}>
            <input type="number" min="0" step="0.01" {...inputProps('weight')} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Costs &amp; pricing (Admin only)</legend>
        <div className="form-grid">
          <Field id="p-purchaseCost" label="Purchase cost (₹)" error={errors.purchaseCost}>
            <input type="number" min="0" step="0.01" {...inputProps('purchaseCost')} />
          </Field>
          <Field id="p-packagingCost" label="Packaging cost (₹)" error={errors.packagingCost}>
            <input type="number" min="0" step="0.01" {...inputProps('packagingCost')} />
          </Field>
          <Field id="p-additionalCost" label="Additional cost (₹)" error={errors.additionalCost}>
            <input type="number" min="0" step="0.01" {...inputProps('additionalCost')} />
          </Field>
          <Field id="p-sellingPrice" label="Selling price (₹)" error={errors.sellingPrice}>
            <input type="number" min="0" step="0.01" {...inputProps('sellingPrice')} />
          </Field>
        </div>
        <p className="small">
          Total cost <strong>{formatMoney(pricing.totalCost)}</strong> · Estimated profit{' '}
          <strong style={{ color: pricing.profit < 0 ? 'var(--danger)' : undefined }}>{formatMoney(pricing.profit)}</strong> · Margin{' '}
          <strong>{formatPercent(pricing.margin)}</strong>
          <span className="muted"> (before marketplace fees, shipping, taxes and returns)</span>
        </p>
      </fieldset>

      <fieldset>
        <legend>Inventory &amp; supplier</legend>
        <div className="form-grid">
          {!isEdit ? (
            <Field id="p-stock" label="Initial stock" error={errors.stock}>
              <input type="number" min="0" step="1" {...inputProps('stock')} />
            </Field>
          ) : (
            <div className="field">
              <label>Current stock</label>
              <div>
                {product.stock} <span className="small muted">(change from the product page or Inventory to keep history)</span>
              </div>
            </div>
          )}
          <Field id="p-lowStockThreshold" label="Low-stock threshold" error={errors.lowStockThreshold}>
            <input type="number" min="0" step="1" {...inputProps('lowStockThreshold')} />
          </Field>
          <Field id="p-supplier" label="Supplier" error={errors.supplier}>
            <input type="text" maxLength={200} {...inputProps('supplier')} />
          </Field>
          <Field id="p-internalNotes" label="Internal notes (Admin only)" error={errors.internalNotes} className="span-all">
            <textarea maxLength={5000} rows={3} {...inputProps('internalNotes')} />
          </Field>
        </div>
      </fieldset>

      {!isEdit && listingDraft && (
        <fieldset>
          <legend>Meesho listing (from screenshot)</legend>
          <p className="small muted">
            Saved as this product&apos;s Meesho listing, field by field in the same order as the Meesho form, so the listing user can copy each one.
            Fix or remove anything that is wrong.
          </p>
          <div className="form-grid">
            <div className="field span-all">
              <label htmlFor="ld-title">Listing title</label>
              <input id="ld-title" type="text" maxLength={300} value={listingDraft.title} onChange={setDraft('title')} />
            </div>
            <div className="field">
              <label htmlFor="ld-style">Style ID</label>
              <input id="ld-style" type="text" maxLength={100} value={listingDraft.styleId} onChange={setDraft('styleId')} />
            </div>
            <div className="field">
              <label htmlFor="ld-price">Suggested selling price (₹)</label>
              <input id="ld-price" type="number" min="0" step="0.01" value={listingDraft.suggestedPrice} onChange={setDraft('suggestedPrice')} />
            </div>
            <div className="field">
              <label htmlFor="ld-pack">Pack quantity</label>
              <input id="ld-pack" type="number" min="1" step="1" value={listingDraft.packQuantity} onChange={setDraft('packQuantity')} />
            </div>
            <div className="field">
              <label htmlFor="ld-cat">Meesho category</label>
              <input id="ld-cat" type="text" maxLength={300} value={listingDraft.marketplaceCategory} onChange={setDraft('marketplaceCategory')} />
            </div>
          </div>
          <h3>Meesho fields ({listingDraft.attributes.length})</h3>
          {listingDraft.attributes.map((a, i) => (
            <div key={i} className="row draft-attr">
              <label className="sr-only" htmlFor={`ld-an${i}`}>Field {i + 1} name</label>
              <input id={`ld-an${i}`} type="text" maxLength={100} value={a.name} onChange={(e) => setDraftAttr(i, 'name', e.target.value)} />
              <label className="sr-only" htmlFor={`ld-av${i}`}>Field {i + 1} value</label>
              <input id={`ld-av${i}`} type="text" maxLength={1000} value={a.value} onChange={(e) => setDraftAttr(i, 'value', e.target.value)} />
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                aria-label={`Remove ${a.name || `field ${i + 1}`}`}
                onClick={() => setListingDraft((d) => ({ ...d, attributes: d.attributes.filter((_, j) => j !== i) }))}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="row" style={{ margin: '0.5rem 0 0.9rem' }}>
            <button type="button" className="btn btn-sm" onClick={() => setListingDraft((d) => ({ ...d, attributes: [...d.attributes, { name: '', value: '' }] }))}>
              + Add field
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setListingDraft(null)}>
              Don&apos;t create a listing
            </button>
          </div>
        </fieldset>
      )}

      <div className="form-actions">
        <button type="button" className="btn" onClick={() => router.back()} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {uploadStatus || (saving ? 'Saving…' : isEdit ? 'Save changes' : pickedImages.length ? 'Create product & upload images' : 'Create product')}
        </button>
      </div>
    </form>
  );
}
