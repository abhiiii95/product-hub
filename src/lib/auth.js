import { createHmac, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from './db';
import { forbidden, unauthorized } from './api';
import { ROLES } from './constants';

export const SESSION_COOKIE = 'ph_session';

function sessionDays() {
  const days = Number(process.env.SESSION_DAYS);
  return Number.isFinite(days) && days > 0 && days <= 90 ? days : 7;
}

function hashToken(token) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must be set to at least 32 characters');
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

export async function createSession(userId, request) {
  const db = await getDb();
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionDays() * 24 * 60 * 60 * 1000);
  await db.collection('sessions').insertOne({
    tokenHash: hashToken(token),
    userId,
    createdAt: now,
    expiresAt,
    userAgent: (request?.headers.get('user-agent') || '').slice(0, 300),
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.collection('sessions').deleteOne({ tokenHash: hashToken(token) });
  }
  store.delete(SESSION_COOKIE);
}

export async function destroyUserSessions(userId, { exceptCurrent = false } = {}) {
  const db = await getDb();
  const filter = { userId };
  if (exceptCurrent) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) filter.tokenHash = { $ne: hashToken(token) };
  }
  await db.collection('sessions').deleteMany(filter);
}

// Resolves the signed-in user from the session cookie. The user record is
// re-read on every request so role changes and deactivation apply immediately.
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const db = await getDb();
  const session = await db.collection('sessions').findOne({ tokenHash: hashToken(token) });
  if (!session || session.expiresAt <= new Date()) return null;
  const user = await db.collection('users').findOne({ _id: session.userId });
  if (!user || !user.isActive) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== ROLES.ADMIN) throw forbidden('Admin access required');
  return user;
}

export const isAdmin = (user) => user?.role === ROLES.ADMIN;

// Page guards (server components)
export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requirePageAdmin() {
  const user = await requirePageUser();
  if (user.role !== ROLES.ADMIN) redirect('/dashboard?denied=1');
  return user;
}

// Simple in-memory login throttle (per email + per IP). Good enough for a
// single-instance deployment; resets on restart.
const attempts = globalThis.__productHubLoginAttempts || (globalThis.__productHubLoginAttempts = new Map());
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

export function isLoginThrottled(keys) {
  const now = Date.now();
  return keys.some((key) => {
    const entry = attempts.get(key);
    if (!entry) return false;
    if (now - entry.first > WINDOW_MS) {
      attempts.delete(key);
      return false;
    }
    return entry.count >= MAX_FAILURES;
  });
}

export function recordLoginFailure(keys) {
  const now = Date.now();
  for (const key of keys) {
    const entry = attempts.get(key);
    if (!entry || now - entry.first > WINDOW_MS) attempts.set(key, { first: now, count: 1 });
    else entry.count += 1;
  }
}

export function clearLoginFailures(keys) {
  for (const key of keys) attempts.delete(key);
}
