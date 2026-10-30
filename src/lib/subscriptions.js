// Plan fulfilment and admin plan changes. No transactions (the local Mongo is
// standalone), so every step is written to be safe when the whole run repeats.
import { createHash, randomInt } from 'node:crypto';
import { getDb, toObjectId, ObjectId } from './db';
import { badRequest, notFound } from './api';
import { ROLES } from './constants';
import { hashPassword } from './password';
import { encryptSecret, decryptSecret } from './tokens';
import { enqueue } from './outbox';
import { categoryScope } from './access';
import { getPlan, selfLimitForPlan } from './plans';
import { redeem } from './coupons';
import { defaultCategoryAccess, defaultEmailPrefs, maskEmail } from './users';
import { eventPush } from './payments';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SELF_CHANGE_DAYS = 7;
export const CREDENTIAL_INFO = 'pending-credential';
// No 0/O, 1/l/I: the password is typed by hand from an email.
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 10) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

export function loginUrl() {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return `${base}/login`;
}

// Keeps only ids of categories that exist (and are active when asked). Order is preserved.
export async function existingCategoryIds(ids, { activeOnly = false } = {}) {
  const wanted = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = toObjectId(raw ? String(raw) : '');
    if (id && !wanted.some((x) => x.equals(id))) wanted.push(id);
  }
  if (!wanted.length) return [];
  const db = await getDb();
  const filter = { _id: { $in: wanted } };
  if (activeOnly) filter.isActive = { $ne: false };
  const found = await db.collection('categories').find(filter, { projection: { _id: 1 } }).toArray();
  const ok = new Set(found.map((c) => c._id.toString()));
  return wanted.filter((id) => ok.has(id.toString()));
}

// Older users may have no categoryAccess object; dotted updates need one.
export async function ensureCategoryAccess(db, userId) {
  await db.collection('users').updateOne({ _id: userId, categoryAccess: null }, { $set: { categoryAccess: defaultCategoryAccess() } });
}

// Human summary for emails and the admin list: { all, categories: [{ id, name }] }.
export async function accessSummaryFor(user) {
  const scope = categoryScope(user);
  if (scope.all) return { all: true, categories: [] };
  if (!scope.categoryIds.length) return { all: false, categories: [] };
  const db = await getDb();
  const rows = await db.collection('categories').find({ _id: { $in: scope.categoryIds } }, { projection: { name: 1 } }).toArray();
  return { all: false, categories: rows.map((c) => ({ id: c._id.toString(), name: c.name })) };
}

// One line for emails: "Saari categories" or the category names.
export function accessText(summary) {
  if (summary.all) return 'Saari categories';
  if (!summary.categories.length) return 'Abhi koi category nahi (login karke chuniye)';
  return summary.categories.map((c) => c.name).join(', ');
}

// Extends a user's plan in one atomic pipeline update. New days always start from
// max(now, planEndsAt), so nobody loses time they already have (comp days included).
// `planCode` undefined keeps the current one. `source` is 'paid' | 'comp' | 'keep'.
// Admin time (comp/keep) keeps all-category access running for the new days when the
// user has it now (m3 or an "all" coupon) or the admin gives m3. Purchases set
// all-access in fulfilPayment, so an m1 purchase never upgrades anyone.
// With `paymentId`, the update applies at most once per payment (planPaymentIds guard).
export async function extendPlan(userId, { days, planCode, source = 'keep', paymentId = null, now = new Date() }) {
  if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive whole number');
  const db = await getDb();
  const ended = { $not: [{ $gt: ['$planEndsAt', now] }] };
  const activePaid = { $and: [{ $eq: ['$planSource', 'paid'] }, { $not: [ended] }] };
  const sourceExpr =
    source === 'paid' ? 'paid'
    : source === 'comp' ? { $cond: [activePaid, 'paid', 'comp'] } // never downgrade running paid time to comp
    : { $ifNull: ['$planSource', 'comp'] };
  const hasAllNow = { $and: [{ $gt: [{ $ifNull: ['$allAccessUntil', null] }, null] }, { $gte: ['$allAccessUntil', '$planEndsAt'] }] };
  const keepAll = source === 'paid' ? false : planCode === 'm3' ? true : hasAllNow;

  // Expressions in one $set read the old values, so _phFresh/_phAll see the old planEndsAt.
  const set = {
    _phFresh: ended,
    _phAll: keepAll,
    planEndsAt: { $dateAdd: { startDate: { $cond: [ended, now, '$planEndsAt'] }, unit: 'day', amount: days } },
    planSource: sourceExpr,
    updatedAt: now,
  };
  if (planCode !== undefined) set.planCode = planCode;
  if (paymentId) set.planPaymentIds = { $slice: [{ $concatArrays: [{ $ifNull: ['$planPaymentIds', []] }, [paymentId]] }, -20] };

  const filter = { _id: userId };
  if (paymentId) filter.planPaymentIds = { $ne: paymentId };
  const user = await db.collection('users').findOneAndUpdate(
    filter,
    [
      { $set: set },
      {
        $set: {
          planStartedAt: { $cond: ['$_phFresh', now, { $ifNull: ['$planStartedAt', now] }] },
          allAccessUntil: { $cond: ['$_phAll', { $max: ['$allAccessUntil', '$planEndsAt'] }, { $ifNull: ['$allAccessUntil', null] }] },
        },
      },
      { $unset: ['_phFresh', '_phAll'] },
    ],
    { returnDocument: 'after' }
  );
  if (user) {
    const endsAt = user.planEndsAt;
    return { user, applied: true, endsAt, startsAt: new Date(endsAt.getTime() - days * DAY_MS) };
  }
  const current = await db.collection('users').findOne({ _id: userId });
  if (!current) throw notFound('User not found');
  return { user: current, applied: false, endsAt: current.planEndsAt || null, startsAt: null };
}

// enqueue() throws 'enqueue: ...' for bad input (address, template). Such a mail can never be
// sent, so it must not block fulfilment forever; database errors still propagate (cron retries).
async function queueMail(mail) {
  try {
    await enqueue(mail);
  } catch (err) {
    if (!String(err?.message || '').startsWith('enqueue:')) throw err;
    console.error('[subscriptions] email not queued', mail.template, err.message);
  }
}

async function alertOwner(template, data, dedupeKey) {
  const owner = process.env.NOTIFY_EMAIL;
  if (!owner) {
    console.warn('[subscriptions] NOTIFY_EMAIL is not set; owner alert skipped', template);
    return;
  }
  await queueMail({ to: owner, template, data, priority: 1, dedupeKey });
}

// Flags a payment for the owner. The status only changes from an unfinished state, but the
// event is always recorded (a second captured payment can arrive after fulfilment).
// One alert per distinct reason, so a later different problem still reaches the owner.
export async function markNeedsReview(payment, reason) {
  const db = await getDb();
  const now = new Date();
  await db.collection('payments').updateOne(
    { _id: payment._id, status: { $in: ['created', 'paid', 'failed', 'abandoned'] } },
    { $set: { status: 'needs_review', updatedAt: now, review: { reason, at: now } } }
  );
  await db.collection('payments').updateOne({ _id: payment._id }, { $set: { updatedAt: now }, $push: eventPush('needs_review', { reason }) });
  const reasonHash = createHash('sha256').update(String(reason)).digest('hex').slice(0, 12);
  await alertOwner(
    'owner_needs_review',
    {
      reason,
      paymentId: payment._id.toString(),
      orderId: payment.providerOrderId,
      email: payment.customer?.email || null,
      name: payment.customer?.name || null,
      phone: payment.customer?.phone || null,
      planCode: payment.planCode,
      amountPaise: payment.price?.finalPaise ?? null,
    },
    `needs_review:${payment._id}:${reasonHash}`
  );
}

// Finds the buyer or creates them. Only the run that actually inserts gets a password.
async function findOrCreateBuyer(db, payment, now) {
  const email = payment.customer.email;
  const existing = await db.collection('users').findOne({ email });
  if (existing) return existing;
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const insert = {
    name: payment.customer.name,
    email,
    phone: payment.customer.phone || null,
    role: ROLES.LISTING_USER,
    passwordHash,
    isActive: true,
    mustChangePassword: true,
    source: 'purchase',
    createdByPaymentId: payment._id,
    pendingCredential: { enc: encryptSecret(tempPassword, CREDENTIAL_INFO), createdAt: now },
    planEndsAt: null,
    planStartedAt: null,
    planCode: null,
    planSource: null,
    allAccessUntil: null,
    categoryAccess: defaultCategoryAccess(now),
    launchOfferUsedAt: null,
    emailPrefs: defaultEmailPrefs(),
    createdAt: now,
    updatedAt: now,
    createdBy: null,
    lastLoginAt: null,
  };
  try {
    return await db.collection('users').findOneAndUpdate({ email }, { $setOnInsert: insert }, { upsert: true, returnDocument: 'after' });
  } catch (err) {
    // Concurrent run inserted first: use theirs.
    if (err?.code !== 11000) throw err;
    return db.collection('users').findOne({ email });
  }
}

function paymentResult(payment, extra = {}) {
  return { status: payment.status, maskedEmail: maskEmail(payment.customer?.email), newAccount: false, ...extra };
}

// Turns a paid order into plan time and access. Safe to call again at any point
// (verify, webhook, mock panel and cron may all call it for the same payment).
// Returns { status, maskedEmail, newAccount, userId? }.
export async function fulfilPayment(paymentId) {
  const id = toObjectId(paymentId instanceof ObjectId ? paymentId : String(paymentId || ''));
  if (!id) throw notFound('Payment not found');
  const db = await getDb();
  const payments = db.collection('payments');
  const now = new Date();

  // 1. created/failed/abandoned -> paid (only one caller wins; others continue from 'paid').
  let payment = await payments.findOneAndUpdate(
    { _id: id, status: { $in: ['created', 'failed', 'abandoned'] } },
    { $set: { status: 'paid', paidAt: now, updatedAt: now }, $push: eventPush('paid') },
    { returnDocument: 'after' }
  );
  if (!payment) {
    payment = await payments.findOne({ _id: id });
    if (!payment) throw notFound('Payment not found');
    if (payment.status !== 'paid') {
      return paymentResult(payment, { newAccount: payment.status === 'fulfilled' && Boolean(payment.newAccount), userId: payment.userId || null });
    }
  }
  const plan = getPlan(payment.planCode);
  if (!plan) {
    await markNeedsReview(payment, 'unknown plan');
    return paymentResult({ ...payment, status: 'needs_review' });
  }

  // 2. Buyer account.
  let user = await findOrCreateBuyer(db, payment, now);
  if (user.role !== ROLES.LISTING_USER || !user.isActive) {
    await markNeedsReview(payment, user.role !== ROLES.LISTING_USER ? 'email belongs to an admin' : 'account is deactivated');
    return paymentResult({ ...payment, status: 'needs_review' });
  }
  const newAccount = Boolean(user.createdByPaymentId && user.createdByPaymentId.equals(payment._id));
  if (!payment.userId || !payment.userId.equals(user._id)) {
    await payments.updateOne({ _id: payment._id }, { $set: { userId: user._id, newAccount, updatedAt: now } });
    payment = { ...payment, userId: user._id, newAccount };
  }

  // 3. Subscription record (unique per payment). A duplicate means an earlier run got this
  //    far; the remaining steps are idempotent, so continue to finish a run that crashed.
  const coupon = payment.couponId ? await db.collection('coupons').findOne({ _id: payment.couponId }) : null;
  try {
    await db.collection('subscriptions').insertOne({
      userId: user._id,
      planCode: plan.code,
      tier: plan.tier,
      days: plan.days,
      amountPaise: payment.price?.finalPaise ?? null,
      startsAt: null,
      endsAt: null,
      paymentId: payment._id,
      couponId: payment.couponId || null,
      source: payment.provider === 'mock' ? 'mock' : 'razorpay',
      createdBy: null,
      note: '',
      createdAt: now,
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }

  // 4. Plan time (applies once per payment).
  const extended = await extendPlan(user._id, { days: plan.days, planCode: plan.code, source: 'paid', paymentId: payment._id, now });
  user = extended.user;
  if (extended.applied) {
    await db.collection('subscriptions').updateOne({ paymentId: payment._id }, { $set: { startsAt: extended.startsAt, endsAt: extended.endsAt } });
  }
  const newEnd = user.planEndsAt;

  // 5. Coupon use, counted once per payment. Over the limit: no coupon grants, owner reviews it.
  const couponUse = await redeem(payment);

  // 6. Access.
  await ensureCategoryAccess(db, user._id);
  const grant = couponUse.overLimit ? null : coupon?.grants?.categoryAccess ?? null;
  if (plan.tier === 'all' || grant === 'all') {
    await db.collection('users').updateOne({ _id: user._id }, { $max: { allAccessUntil: newEnd } });
  }
  if (Array.isArray(grant) && grant.length) {
    await db.collection('users').updateOne(
      { _id: user._id },
      { $addToSet: { 'categoryAccess.adminCategoryIds': { $each: grant } }, $set: { 'categoryAccess.updatedAt': now } }
    );
  }
  // Picks only from the account owner: a stranger paying for someone else's email must not
  // replace that reseller's categories (the order route already drops them, this is the backstop).
  const buyerIsOwner = newAccount || Boolean(payment.buyerUserId && payment.buyerUserId.equals(user._id));
  if (plan.pickAtPurchase && buyerIsOwner && payment.requestedCategoryIds?.length) {
    const picks = (await existingCategoryIds(payment.requestedCategoryIds, { activeOnly: true })).slice(0, selfLimitForPlan(plan.code));
    if (picks.length) {
      // First pick has no wait; later changes only once every 7 days.
      const weekAgo = new Date(now.getTime() - SELF_CHANGE_DAYS * DAY_MS);
      await db.collection('users').updateOne(
        {
          _id: user._id,
          $or: [
            { 'categoryAccess.selfCategoryIds': { $exists: false } },
            { 'categoryAccess.selfCategoryIds': { $size: 0 } },
            { 'categoryAccess.selfChangedAt': null },
            { 'categoryAccess.selfChangedAt': { $lte: weekAgo } },
          ],
        },
        { $set: { 'categoryAccess.selfCategoryIds': picks, 'categoryAccess.selfChangedAt': now, 'categoryAccess.updatedAt': now } }
      );
    }
  }

  // 7. Launch offer (only when the price actually used it).
  if (payment.price?.offerApplied) {
    await db.collection('users').updateOne({ _id: user._id, launchOfferUsedAt: null }, { $set: { launchOfferUsedAt: now } });
  }

  // 8. Emails (deduped per payment, so repeats queue nothing new). Sending happens in the route via after().
  user = await db.collection('users').findOne({ _id: user._id });
  const summary = await accessSummaryFor(user);
  const mailData = {
    name: user.name,
    email: user.email,
    loginUrl: loginUrl(),
    planCode: plan.code,
    planName: plan.name,
    days: plan.days,
    endsAt: user.planEndsAt,
    accessSummary: accessText(summary),
    support: plan.support,
    amountPaise: payment.price?.finalPaise ?? null,
    orderId: payment.providerOrderId,
    paymentId: payment.providerPaymentId || payment.providerOrderId,
  };
  // On a re-run after the buyer already changed the password there is nothing to send, so a receipt goes instead.
  const password = newAccount ? decryptSecret(user.pendingCredential?.enc, CREDENTIAL_INFO) : null;
  if (password) {
    await queueMail({
      to: user.email,
      userId: user._id,
      template: 'welcome',
      data: mailData,
      // Plain temporary password; the outbox stores it encrypted and removes it once sent.
      secret: password,
      priority: 0,
      dedupeKey: `welcome:${payment._id}`,
    });
  } else {
    await queueMail({ to: user.email, userId: user._id, template: 'receipt', data: mailData, priority: 0, dedupeKey: `receipt:${payment._id}` });
  }
  await alertOwner(
    'owner_new_purchase',
    { ...mailData, phone: payment.customer?.phone || null, newAccount, offerApplied: Boolean(payment.price?.offerApplied), couponCode: payment.couponCode || null },
    `owner_new_purchase:${payment._id}`
  );

  // 9. Done. A coupon over its limit leaves the payment for the owner (refund or grant by hand).
  if (couponUse.overLimit) {
    await markNeedsReview(payment, 'coupon over its use limit');
    return { status: 'needs_review', maskedEmail: maskEmail(user.email), newAccount, userId: user._id };
  }
  await payments.updateOne(
    { _id: payment._id, status: 'paid' },
    { $set: { status: 'fulfilled', fulfilledAt: now, updatedAt: now }, $push: eventPush('fulfilled') }
  );
  return { status: 'fulfilled', maskedEmail: maskEmail(user.email), newAccount, userId: user._id };
}

async function recordManual(db, user, { planCode, days, source, note, adminId, startsAt, endsAt }) {
  await db.collection('subscriptions').insertOne({
    userId: user._id,
    planCode: planCode ?? user.planCode ?? null,
    tier: getPlan(planCode ?? user.planCode)?.tier || null,
    days,
    amountPaise: 0,
    startsAt,
    endsAt,
    paymentId: null,
    couponId: null,
    source,
    createdBy: adminId || null,
    note: note || '',
    createdAt: new Date(),
  });
}

// Free time from the admin. Running paid time is kept (comp days are added on top).
export async function compUser(userId, days, note, adminId, { planCode } = {}) {
  const db = await getDb();
  const result = await extendPlan(userId, { days, planCode, source: 'comp' });
  await recordManual(db, result.user, { planCode, days, source: 'comp', note, adminId, startsAt: result.startsAt, endsAt: result.endsAt });
  return result.user;
}

// Admin "extend": adds days without changing the plan source.
export async function extendUser(userId, days, note, adminId) {
  const db = await getDb();
  const result = await extendPlan(userId, { days, source: 'keep' });
  await recordManual(db, result.user, { days, source: 'manual', note, adminId, startsAt: result.startsAt, endsAt: result.endsAt });
  return result.user;
}

// Removes `days` from the plan (never earlier than now), or ends it now when days is empty.
// All-access is capped to the new end date.
export async function revokeUser(userId, { days = null, note = '', adminId = null } = {}) {
  const db = await getDb();
  const now = new Date();
  const newEnd = days
    ? { $max: [now, { $dateAdd: { startDate: { $ifNull: ['$planEndsAt', now] }, unit: 'day', amount: -days } }] }
    : now;
  const user = await db.collection('users').findOneAndUpdate(
    { _id: userId },
    [
      { $set: { planEndsAt: newEnd, updatedAt: now } },
      { $set: { allAccessUntil: { $cond: [{ $gt: ['$allAccessUntil', '$planEndsAt'] }, '$planEndsAt', { $ifNull: ['$allAccessUntil', null] }] } } },
    ],
    { returnDocument: 'after' }
  );
  if (!user) throw notFound('User not found');
  await recordManual(db, user, { days: days ? -days : 0, source: 'manual', note: note || 'Revoked', adminId, startsAt: null, endsAt: user.planEndsAt });
  return user;
}

// Admin resend: new temporary password, old sessions must be ended by the caller.
export async function issueTempPassword(userId) {
  const db = await getDb();
  const now = new Date();
  const tempPassword = generateTempPassword();
  const user = await db.collection('users').findOneAndUpdate(
    { _id: userId },
    {
      $set: {
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        pendingCredential: { enc: encryptSecret(tempPassword, CREDENTIAL_INFO), createdAt: now },
        updatedAt: now,
      },
    },
    { returnDocument: 'after' }
  );
  if (!user) throw notFound('User not found');
  return { user, tempPassword };
}

export async function queueWelcome(user, tempPassword, dedupeKey) {
  const plan = getPlan(user.planCode);
  await enqueue({
    to: user.email,
    userId: user._id,
    template: 'welcome',
    data: {
      name: user.name,
      email: user.email,
      loginUrl: loginUrl(),
      planCode: plan?.code || null,
      planName: plan?.name || null,
      days: plan?.days || null,
      endsAt: user.planEndsAt || null,
      accessSummary: accessText(await accessSummaryFor(user)),
      support: plan?.support || 'chat',
    },
    secret: tempPassword,
    priority: 0,
    dedupeKey,
  });
}

// Admin-granted access. `adminMode` 'all' | 'selected'; ids are checked against existing
// categories (inactive ones allowed, so a grant survives a category being paused).
// Returns { adminMode, adminCategoryIds } or throws 400 for unknown ids.
export async function resolveAdminAccess({ adminMode, adminCategoryIds }) {
  const out = {};
  if (adminMode !== undefined) {
    if (!['all', 'selected'].includes(adminMode)) throw badRequest('Access mode is not valid', { adminMode: 'Choose all or selected' });
    out.adminMode = adminMode;
  }
  if (adminCategoryIds !== undefined) {
    const raw = Array.isArray(adminCategoryIds) ? adminCategoryIds : [];
    if (!Array.isArray(adminCategoryIds) && adminCategoryIds !== null) throw badRequest('Categories must be a list', { adminCategoryIds: 'Must be a list' });
    if (raw.length > 200) throw badRequest('Too many categories', { adminCategoryIds: 'At most 200' });
    const unique = [...new Set(raw.map(String))];
    const found = await existingCategoryIds(unique);
    if (found.length !== unique.length) throw badRequest('Unknown category', { adminCategoryIds: 'Unknown category' });
    out.adminCategoryIds = found;
  }
  return out;
}

export async function applyAdminAccess(userId, access) {
  if (access.adminMode === undefined && access.adminCategoryIds === undefined) return;
  const db = await getDb();
  await ensureCategoryAccess(db, userId);
  const set = { 'categoryAccess.updatedAt': new Date(), updatedAt: new Date() };
  if (access.adminMode !== undefined) set['categoryAccess.adminMode'] = access.adminMode;
  if (access.adminCategoryIds !== undefined) set['categoryAccess.adminCategoryIds'] = access.adminCategoryIds;
  await db.collection('users').updateOne({ _id: userId }, { $set: set });
}
