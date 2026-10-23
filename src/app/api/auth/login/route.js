import { getDb } from '@/lib/db';
import { json, readJson, route, ApiError } from '@/lib/api';
import { verifyPassword, getDummyHash } from '@/lib/password';
import {
  createSession,
  publicUser,
  isLoginThrottled,
  recordLoginFailure,
  clearLoginFailures,
} from '@/lib/auth';

const GENERIC_ERROR = 'Invalid email or password';

export const POST = route(async (request) => {
  const body = await readJson(request);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  if (!email || !password) throw new ApiError(400, 'Email and password are required');

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  const keys = [`email:${email}`, `ip:${ip}`];
  if (isLoginThrottled(keys)) {
    throw new ApiError(429, 'Too many failed attempts. Please wait 15 minutes and try again.');
  }

  const db = await getDb();
  const user = await db.collection('users').findOne({ email });
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const valid = await verifyPassword(password, user?.passwordHash || (await getDummyHash()));

  if (!user || !valid) {
    recordLoginFailure(keys);
    throw new ApiError(401, GENERIC_ERROR);
  }
  if (!user.isActive) {
    recordLoginFailure(keys);
    throw new ApiError(403, 'This account has been deactivated. Contact the Admin.');
  }

  clearLoginFailures(keys);
  await createSession(user._id, request);
  await db.collection('users').updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  return json({ user: publicUser(user) });
});
