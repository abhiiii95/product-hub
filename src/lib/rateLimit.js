// Fixed-window rate limits shared across serverless instances (stored in Mongo).
import { createHash } from 'node:crypto';
import { getDb } from './db';
import { ApiError } from './api';

// Hashes identifiers (IPs, emails) so the rateLimits collection holds no personal data.
export function hashKey(text) {
  return createHash('sha256').update(String(text || '')).digest('hex').slice(0, 32);
}

// Vercel sets x-real-ip and x-vercel-forwarded-for itself; the left-most
// x-forwarded-for entry can be typed by the client, so it is only the fallback.
export function clientIp(request) {
  const first = (name) => (request.headers.get(name) || '').split(',')[0].trim();
  return first('x-real-ip') || first('x-vercel-forwarded-for') || first('x-forwarded-for') || 'unknown';
}

// Counts one event for `key` in a fixed window and returns the stored { count, expiresAt }.
export async function count(key, windowSec) {
  const db = await getDb();
  const now = new Date();
  const freshEnd = new Date(now.getTime() + windowSec * 1000);
  // TTL removes old documents only about once a minute, so an expired window
  // is reset here too. All expressions in one $set read the pre-update values.
  const expired = { $or: [{ $not: ['$expiresAt'] }, { $lte: ['$expiresAt', now] }] };
  const update = [
    {
      $set: {
        key,
        count: { $cond: [expired, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] },
        expiresAt: { $cond: [expired, freshEnd, '$expiresAt'] },
      },
    },
  ];
  try {
    return await db.collection('rateLimits').findOneAndUpdate({ key }, update, { upsert: true, returnDocument: 'after' });
  } catch (err) {
    // Two first hits can race on the upsert; the loser simply retries as an update.
    if (err?.code !== 11000) throw err;
    return db.collection('rateLimits').findOneAndUpdate({ key }, update, { upsert: true, returnDocument: 'after' });
  }
}

// Counts one request for `key`; throws 429 once more than `limit` happen within `windowSec`.
export async function hit(key, limit, windowSec) {
  const now = new Date();
  const doc = await count(key, windowSec);
  if (doc && doc.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((new Date(doc.expiresAt).getTime() - now.getTime()) / 1000));
    throw new ApiError(429, 'Too many requests. Please try again later.', { retryAfter });
  }
  return { count: doc?.count || 1, remaining: Math.max(0, limit - (doc?.count || 1)) };
}

// True when any key already has `limit` or more events in its current window (does not count one).
export async function reached(keys, limit) {
  const db = await getDb();
  const found = await db.collection('rateLimits').findOne(
    { key: { $in: keys }, count: { $gte: limit }, expiresAt: { $gt: new Date() } },
    { projection: { _id: 1 } }
  );
  return Boolean(found);
}

export async function resetKeys(keys) {
  const db = await getDb();
  await db.collection('rateLimits').deleteMany({ key: { $in: keys } });
}
