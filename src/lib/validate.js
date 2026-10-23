// Native input normalisation helpers. Each returns a clean value or throws via `fail`.
import { badRequest } from './api';

export class Validator {
  constructor() {
    this.errors = {};
  }

  fail(field, message) {
    this.errors[field] = message;
    return undefined;
  }

  assert() {
    const keys = Object.keys(this.errors);
    if (keys.length) throw badRequest(this.errors[keys[0]], this.errors);
  }

  string(field, value, { required = false, max = 500, min = 0, label = field } = {}) {
    if (value === undefined || value === null) value = '';
    if (typeof value !== 'string' && typeof value !== 'number') return this.fail(field, `${label} must be text`);
    const out = String(value).trim();
    if (required && !out) return this.fail(field, `${label} is required`);
    if (out.length > max) return this.fail(field, `${label} must be at most ${max} characters`);
    if (out && out.length < min) return this.fail(field, `${label} must be at least ${min} characters`);
    return out;
  }

  email(field, value, { required = true, label = 'Email' } = {}) {
    const out = this.string(field, value, { required, max: 254, label });
    if (out === undefined) return undefined;
    if (out && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out)) return this.fail(field, `${label} is not valid`);
    return out.toLowerCase();
  }

  // Returns null for empty optional values.
  number(field, value, { required = false, min = 0, max = 1e9, integer = false, label = field } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) return this.fail(field, `${label} is required`);
      return null;
    }
    const num = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(num)) return this.fail(field, `${label} must be a number`);
    if (integer && !Number.isInteger(num)) return this.fail(field, `${label} must be a whole number`);
    if (num < min) return this.fail(field, `${label} must be at least ${min}`);
    if (num > max) return this.fail(field, `${label} must be at most ${max}`);
    return integer ? num : Math.round(num * 100) / 100;
  }

  oneOf(field, value, allowed, { required = true, label = field, fallback } = {}) {
    if ((value === undefined || value === null || value === '') && !required) return fallback ?? null;
    if (!allowed.includes(value)) return this.fail(field, `${label} is not valid`);
    return value;
  }

  boolean(value) {
    return value === true || value === 'true' || value === 'on' || value === 1 || value === '1';
  }

  // Accepts an array or a comma/newline separated string.
  list(field, value, { maxItems = 50, maxLength = 100, label = field } = {}) {
    if (value === undefined || value === null || value === '') return [];
    const raw = Array.isArray(value) ? value : String(value).split(/[,\n]/);
    const seen = new Set();
    const out = [];
    for (const item of raw) {
      if (typeof item !== 'string' && typeof item !== 'number') return this.fail(field, `${label} must be a list of text`);
      const clean = String(item).trim();
      if (!clean) continue;
      if (clean.length > maxLength) return this.fail(field, `Each ${label} entry must be at most ${maxLength} characters`);
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    if (out.length > maxItems) return this.fail(field, `${label} can have at most ${maxItems} entries`);
    return out;
  }
}

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function fieldKeyFrom(text) {
  return slugify(text).replace(/-/g, '_');
}

export function parsePaging(searchParams, { defaultLimit = 24, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(searchParams.get('limit') || String(defaultLimit), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
