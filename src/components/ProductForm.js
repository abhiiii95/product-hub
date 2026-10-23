'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomFieldInput from './CustomFieldInput';
import { useToast } from './Feedback';
import { checkImageFile } from './ImageManager';
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
  const inputProps = (key) => ({ id: `p-${key}`, name: key, value: values[key], onChange: set(key), 'aria-invalid': errors[key] ? 'true' : undefined });

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
              <input id={`p-dim-${d}`} type="number" min="0" step="0.01" value={values.dimensions[d]} onChange={setDim(d)} />
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
