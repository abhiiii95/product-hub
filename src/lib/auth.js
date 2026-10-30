import { createHmac, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from './db';
import { ApiError, badRequest, forbidden, unauthorized } from './api';
import { ROLES } from './constants';
import { accessSummary, planState } from './access';
import { count, hashKey, reached, resetKeys } from './rateLimit';

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
    plan: planState(user),
    access: accessSummary(user),
  };
}

// Resellers without a running plan may only reach routes that opt in with `allowExpired`.
const planBlocked = (user, allowExpired) => !allowExpired && user.role === ROLES.LISTING_USER && !planState(user).active;

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
  // Session + user in one round trip to the database.
  const [session] = await db
    .collection('sessions')
    .aggregate([
      { $match: { tokenHash: hashToken(token), expiresAt: { $gt: new Date() } } },
      { $limit: 1 },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    ])
    .toArray();
  const user = session?.user?.[0];
  if (!user || !user.isActive) return null;
  return user;
}

export async function requireUser({ allowExpired = false } = {}) {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  if (planBlocked(user, allowExpired)) throw new ApiError(402, 'Your plan has ended. Renew to continue.', { code: 'plan_expired' });
  return user;
}

// Reads the session directly so non-admins keep getting 403 (not 402) here.
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  if (user.role !== ROLES.ADMIN) throw forbidden('Admin access required');
  return user;
}

export const isAdmin = (user) => user?.role === ROLES.ADMIN;

// Routes that only make sense for a reseller (personal tracker, own category picks, preview).
export async function requireReseller({ allowExpired = false } = {}) {
  const user = await requireUser({ allowExpired });
  if (user.role !== ROLES.LISTING_USER) throw forbidden('This page is for resellers');
  return user;
}

// Checkout for a signed-in reseller is always for their own account. A different email in
// the body is refused instead of silently swapped, so the buyer knows who gets the plan.
export function ownCheckoutEmail(session, bodyEmail) {
  const typed = typeof bodyEmail === 'string' ? bodyEmail.trim().toLowerCase() : '';
  if (typed && typed !== session.email) {
    throw badRequest('Logged in account ki email ke liye hi plan khareed sakte ho. Kisi aur email ke liye logout karke kharido.', { code: 'email_mismatch' });
  }
  return session.email;
}

// Page guards (server components)
export async function requirePageUser({ allowExpired = false } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (planBlocked(user, allowExpired)) redirect('/renew');
  return user;
}

export async function requirePageAdmin() {
  const user = await requirePageUser();
  if (user.role !== ROLES.ADMIN) redirect('/dashboard?denied=1');
  return user;
}

// Login throttle (per email + per IP), stored in Mongo so it holds across serverless instances.
const LOGIN_WINDOW_SEC = 15 * 60;
const MAX_FAILURES = 8;

export function loginThrottleKeys(email, ip) {
  return [`login:email:${hashKey(email)}`, `login:ip:${hashKey(ip)}`];
}

export async function isLoginThrottled(keys) {
  return reached(keys, MAX_FAILURES);
}

export async function recordLoginFailure(keys) {
  await Promise.all(keys.map((key) => count(key, LOGIN_WINDOW_SEC)));
}

// Only the email key is cleared: a correct password must not reset the counter of a guessing IP.
export async function clearLoginFailures(keys) {
  await resetKeys(keys.filter((key) => key.startsWith('login:email:')));
}
