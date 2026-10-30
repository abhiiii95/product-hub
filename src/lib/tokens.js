// Keys derived from AUTH_SECRET (HKDF, one key per `info`), AES-256-GCM secrets
// and short HMAC-signed tokens. Only node:crypto, so plain node can import it.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SALT = 'product-hub/v1';
const keyCache = new Map();

function deriveKey(info) {
  if (typeof info !== 'string' || !info) throw new Error('Key info is required');
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must be set to at least 32 characters');
  // Cache per secret+info so a changed secret (tests) never reuses an old key.
  const cacheKey = `${info}\u0000${secret}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', secret, SALT, info, 32));
    keyCache.set(cacheKey, key);
  }
  return key;
}

// Format: v1.<base64url(iv | tag | ciphertext)>. `info` is also bound as AAD.
export function encryptSecret(text, info) {
  const key = deriveKey(info);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(info));
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')}`;
}

// Returns the plain text, or null when the value is missing, tampered or from another key.
export function decryptSecret(enc, info) {
  if (typeof enc !== 'string' || !enc.startsWith('v1.')) return null;
  try {
    const raw = Buffer.from(enc.slice(3), 'base64url');
    if (raw.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(info), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(info));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// Constant-time string compare; different lengths are simply unequal.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function mac(body, info) {
  return createHmac('sha256', deriveKey(info)).update(body).digest('base64url');
}

// Token: <base64url(JSON {p, exp})>.<base64url(HMAC)>. Payload must be JSON-safe.
export function signToken(payload, info, ttlSec) {
  const seconds = Number(ttlSec);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('ttlSec must be a positive number');
  const exp = Math.floor(Date.now() / 1000) + Math.floor(seconds);
  const body = Buffer.from(JSON.stringify({ p: payload, exp })).toString('base64url');
  return `${body}.${mac(body, info)}`;
}

// Returns the payload, or null when the token is malformed, forged or expired.
export function verifyToken(token, info) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const body = token.slice(0, dot);
  if (!safeEqual(token.slice(dot + 1), mac(body, info))) return null;
  try {
    const { p, exp } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
    return p ?? null;
  } catch {
    return null;
  }
}
