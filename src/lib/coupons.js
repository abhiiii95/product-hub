// Coupons and checkout pricing. A coupon and the launch offer never stack: the lower price wins.
import { getDb, toObjectId } from './db';
import { ApiError, badRequest } from './api';
import { Validator } from './validate';
import { enqueue } from './outbox';
import { LAUNCH_OFFER, MIN_PAISE, PLAN_CODES, getPlan, isLaunchOfferLive } from './plans';

export const COUPON_KINDS = ['final_price', 'amount_off', 'percent_off'];
export const COUPON_ERROR = 'Coupon not valid for this purchase';
// At least 8 characters so short codes cannot be guessed by trying the quote endpoint.
const CODE_PATTERN = /^[A-Z0-9-]{8,32}$/;
// An order holds its coupon use this long; after that the cron gives the use back.
const HOLD_MS = 2 * 60 * 60 * 1000;

export function normalizeCode(code) {
  if (typeof code !== 'string') return '';
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function clampPaise(paise) {
  return Math.max(MIN_PAISE, Math.round(paise));
}

// Price after the coupon, never above the list price and never below MIN_PAISE.
export function couponPrice(coupon, listPaise) {
  let price = listPaise;
  if (coupon.kind === 'final_price') price = Math.min(listPaise, coupon.value);
  else if (coupon.kind === 'amount_off') price = listPaise - coupon.value;
  else if (coupon.kind === 'percent_off') price = Math.round((listPaise * (100 - coupon.value)) / 100);
  return clampPaise(Math.min(listPaise, price));
}

// Everything except the per-email redemption count, which needs the database.
export function couponUsable(coupon, { planCode, email, now = new Date() }) {
  if (!coupon || coupon.isActive !== true) return false;
  if (!COUPON_KINDS.includes(coupon.kind)) return false;
  if (!Array.isArray(coupon.plans) || !coupon.plans.includes(planCode)) return false;
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now.getTime()) return false;
  // Uses held by unpaid orders count too, so the last use cannot be sold twice.
  if (coupon.maxUses != null && (coupon.usedCount || 0) + (coupon.reservedCount || 0) >= coupon.maxUses) return false;
  if (Array.isArray(coupon.allowedEmails) && coupon.allowedEmails.length > 0) {
    if (!email || !coupon.allowedEmails.includes(String(email).toLowerCase())) return false;
  }
  return true;
}

// Picks the cheaper of launch offer and coupon. On a tie the coupon wins, because the
// buyer typed it on purpose and it may grant extra category access.
export function choosePrice({ listPaise, offerPaise, couponPaise }) {
  const options = [{ finalPaise: listPaise, offerApplied: false, couponApplied: false }];
  if (offerPaise != null) options.push({ finalPaise: clampPaise(offerPaise), offerApplied: true, couponApplied: false });
  if (couponPaise != null) options.push({ finalPaise: couponPaise, offerApplied: false, couponApplied: true });
  return options.reduce((best, o) => (o.finalPaise < best.finalPaise || (o.finalPaise === best.finalPaise && o.couponApplied) ? o : best));
}

// The launch offer is for the first m1 purchase per email AND per phone.
export async function launchOfferUsed(db, { email, phone }) {
  const who = [{ email }];
  if (phone) who.push({ phone });
  const user = await db.collection('users').findOne({ $or: who, launchOfferUsedAt: { $ne: null } }, { projection: { _id: 1 } });
  if (user) return true;
  const buyer = [{ 'customer.email': email }];
  if (phone) buyer.push({ 'customer.phone': phone });
  // Paid-but-not-yet-fulfilled payments count too, so two quick orders cannot both get it.
  const payment = await db.collection('payments').findOne(
    { $or: buyer, 'price.offerApplied': true, status: { $in: ['paid', 'fulfilled', 'needs_review'] } },
    { projection: { _id: 1 } }
  );
  return Boolean(payment);
}

// Returns { listPaise, finalPaise, offerApplied, couponApplied, coupon|null, couponError? }.
// `email` must be lower-case and `phone` normalised (10 digits) by the caller.
export async function quote({ planCode, email, phone, couponCode }) {
  const plan = getPlan(planCode);
  if (!plan) throw badRequest('Plan not found');
  const db = await getDb();
  const now = new Date();
  const listPaise = plan.paise;

  let offerPaise = null;
  if (planCode === LAUNCH_OFFER.plan && isLaunchOfferLive(now) && email && phone && !(await launchOfferUsed(db, { email, phone }))) {
    offerPaise = LAUNCH_OFFER.paise;
  }

  let coupon = null;
  let couponError;
  const code = normalizeCode(couponCode);
  if (code) {
    const found = CODE_PATTERN.test(code) ? await db.collection('coupons').findOne({ code }) : null;
    let ok = couponUsable(found, { planCode, email, now });
    if (ok) ok = (await emailUses(db, found, email, { now })).size < (found.maxUsesPerEmail || 1);
    if (ok) coupon = found;
    else couponError = COUPON_ERROR;
  }

  const best = choosePrice({ listPaise, offerPaise, couponPaise: coupon ? couponPrice(coupon, listPaise) : null });
  const result = {
    listPaise,
    finalPaise: best.finalPaise,
    offerApplied: best.offerApplied,
    couponApplied: best.couponApplied,
    coupon: best.couponApplied ? coupon : null,
  };
  if (couponError) result.couponError = couponError;
  // Valid coupon that lost to the cheaper launch offer.
  if (coupon && !best.couponApplied) result.couponIgnored = true;
  return result;
}

// Payment ids that use this coupon for this email: active holds plus redemptions.
// A set, because a payment being fulfilled can briefly have both.
async function emailUses(db, coupon, email, { now = new Date(), exceptPaymentId = null } = {}) {
  const [holds, redemptions] = await Promise.all([
    db.collection('couponHolds').find({ couponId: coupon._id, email, expiresAt: { $gt: now } }, { projection: { paymentId: 1 } }).toArray(),
    db.collection('couponRedemptions').find({ couponId: coupon._id, email, overLimit: { $ne: true } }, { projection: { paymentId: 1 } }).toArray(),
  ]);
  const ids = new Set([...holds, ...redemptions].map((r) => String(r.paymentId)));
  if (exceptPaymentId) ids.delete(String(exceptPaymentId));
  return ids;
}

// Room left under maxUses (null = unlimited), counting held and used uses.
const underMaxUses = {
  $expr: {
    $or: [
      { $eq: [{ $ifNull: ['$maxUses', null] }, null] },
      { $lt: [{ $add: [{ $ifNull: ['$usedCount', 0] }, { $ifNull: ['$reservedCount', 0] }] }, '$maxUses'] },
    ],
  },
};

// Order time: holds one use of `coupon` for this payment. Throws the generic coupon error
// when the last use was taken meanwhile or this email already holds/used its share.
export async function reserveCoupon({ coupon, email, paymentId, now = new Date() }) {
  const db = await getDb();
  const coupons = db.collection('coupons');
  const res = await coupons.updateOne({ _id: coupon._id, isActive: true, ...underMaxUses }, { $inc: { reservedCount: 1 } });
  if (res.modifiedCount !== 1) throw badRequest(COUPON_ERROR, { couponCode: COUPON_ERROR });
  const perEmail = coupon.maxUsesPerEmail || 1;
  try {
    // perEmailOne turns on the unique (couponId, email) index, which settles two racing orders.
    await db.collection('couponHolds').insertOne({
      couponId: coupon._id,
      email,
      paymentId,
      perEmailOne: perEmail === 1,
      expiresAt: new Date(now.getTime() + HOLD_MS),
      createdAt: now,
    });
  } catch (err) {
    await coupons.updateOne({ _id: coupon._id, reservedCount: { $gt: 0 } }, { $inc: { reservedCount: -1 } });
    if (err?.code === 11000) throw badRequest(COUPON_ERROR, { couponCode: COUPON_ERROR });
    throw err;
  }
  // Includes this hold; an earlier redemption or a parallel hold pushes it over.
  if ((await emailUses(db, coupon, email, { now })).size > perEmail) {
    await releaseCouponHold(paymentId);
    throw badRequest(COUPON_ERROR, { couponCode: COUPON_ERROR });
  }
}

// Gives a held use back (payment failed, abandoned, order not created, or hold expired).
// findOneAndDelete makes it count once even when several callers race.
export async function releaseCouponHold(paymentId) {
  const db = await getDb();
  const hold = await db.collection('couponHolds').findOneAndDelete({ paymentId });
  if (hold) {
    await db.collection('coupons').updateOne({ _id: hold.couponId, reservedCount: { $gt: 0 } }, { $inc: { reservedCount: -1 } });
  }
  return Boolean(hold);
}

// Cron: releases holds whose time ran out. A late payment still works; its use is then
// checked against the limits again at fulfilment.
export async function releaseExpiredHolds({ max = 200, now = new Date() } = {}) {
  const db = await getDb();
  const expired = await db.collection('couponHolds').find({ expiresAt: { $lte: now } }, { projection: { paymentId: 1 } }).limit(max).toArray();
  let released = 0;
  for (const { paymentId } of expired) if (await releaseCouponHold(paymentId)) released += 1;
  return released;
}

// Moves the use to `usedCount`: from this payment's hold when it still exists, otherwise
// directly if the limits still allow it. Returns true when the use fits within the limits.
async function consumeUse(db, payment) {
  const coupons = db.collection('coupons');
  const hold = await db.collection('couponHolds').findOneAndDelete({ paymentId: payment._id });
  if (hold) {
    const res = await coupons.updateOne(
      { _id: payment.couponId },
      [{ $set: { usedCount: { $add: [{ $ifNull: ['$usedCount', 0] }, 1] }, reservedCount: { $max: [0, { $add: [{ $ifNull: ['$reservedCount', 0] }, -1] }] }, updatedAt: new Date() } }]
    );
    return res.matchedCount === 1;
  }
  const coupon = await coupons.findOne({ _id: payment.couponId });
  if (!coupon) return false;
  const email = payment.customer?.email || null;
  if ((await emailUses(db, coupon, email, { exceptPaymentId: payment._id })).size >= (coupon.maxUsesPerEmail || 1)) return false;
  const res = await coupons.updateOne({ _id: coupon._id, ...underMaxUses }, { $inc: { usedCount: 1 }, $set: { updatedAt: new Date() } });
  return res.modifiedCount === 1;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Records the coupon use for a paid payment, counted once per payment. Returns
// { redeemed, overLimit }; overLimit means the caller must not apply the coupon's grants.
export async function redeem(payment) {
  if (!payment?.couponId) return { redeemed: false, overLimit: false };
  const db = await getDb();
  const redemptions = db.collection('couponRedemptions');
  try {
    await redemptions.insertOne({
      couponId: payment.couponId,
      paymentId: payment._id,
      email: payment.customer?.email || null,
      userId: payment.userId || null,
      amountPaise: payment.price?.finalPaise ?? null,
      overLimit: null,
      counted: false,
      createdAt: new Date(),
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }

  // Only the run that flips `counted` touches the coupon counters.
  const claimed = await redemptions.findOneAndUpdate({ paymentId: payment._id, counted: false }, { $set: { counted: true } });
  if (!claimed) {
    // Another run owns it: wait briefly for its decision (verify and webhook often overlap).
    for (let i = 0; i < 20; i += 1) {
      const record = await redemptions.findOne({ paymentId: payment._id }, { projection: { overLimit: 1 } });
      if (record && typeof record.overLimit === 'boolean') return { redeemed: true, overLimit: record.overLimit };
      await sleep(250);
    }
    throw new ApiError(409, 'This payment is still being processed. Please refresh in a moment.');
  }

  const ok = await consumeUse(db, payment);
  await redemptions.updateOne({ paymentId: payment._id }, { $set: { overLimit: !ok } });
  if (ok) return { redeemed: true, overLimit: false };

  // Rare now that orders reserve a use; the owner decides (refund or grant by hand).
  const owner = process.env.NOTIFY_EMAIL;
  if (owner) {
    try {
      await enqueue({
        to: owner,
        template: 'owner_coupon_over_limit',
        data: {
          couponCode: payment.couponCode || null,
          paymentId: payment._id.toString(),
          orderId: payment.providerOrderId,
          email: payment.customer?.email || null,
          amountPaise: payment.price?.finalPaise ?? null,
        },
        priority: 1,
        dedupeKey: `coupon_over_limit:${payment._id}`,
      });
    } catch (err) {
      // A bad NOTIFY_EMAIL must not block fulfilment; database errors still propagate.
      if (!String(err?.message || '').startsWith('enqueue:')) throw err;
      console.error('[coupons] over-limit alert not queued', err.message);
    }
  }
  return { redeemed: true, overLimit: true };
}

// --- Admin coupon editing -------------------------------------------------

function grantsFrom(raw, v) {
  const value = raw?.categoryAccess ?? null;
  if (value === null || value === '' || value === 'none') return { categoryAccess: null };
  if (value === 'all') return { categoryAccess: 'all' };
  if (!Array.isArray(value)) {
    v.fail('grants', 'Category access must be "all", a list of categories, or empty');
    return { categoryAccess: null };
  }
  const ids = [];
  for (const item of value.slice(0, 100)) {
    const id = toObjectId(String(item));
    if (!id) {
      v.fail('grants', 'Unknown category in coupon access');
      break;
    }
    if (!ids.some((x) => x.equals(id))) ids.push(id);
  }
  return { categoryAccess: ids.length ? ids : null };
}

// Builds the stored fields from an admin request. Category ids in `grants` must
// still be checked against the categories collection by the caller.
export function buildCouponInput(body, { isCreate, existing = null }) {
  const v = new Validator();
  const doc = {};
  const has = (key) => isCreate || body[key] !== undefined;

  if (has('code')) {
    const code = normalizeCode(body.code);
    if (!CODE_PATTERN.test(code)) v.fail('code', 'Code must be 8-32 characters: A-Z, 0-9 or -');
    doc.code = code;
  }
  if (has('kind')) doc.kind = v.oneOf('kind', body.kind, COUPON_KINDS, { label: 'Discount type' });
  if (has('value') || doc.kind) {
    const kind = doc.kind || existing?.kind;
    const value = body.value !== undefined ? body.value : existing?.value;
    if (kind === 'percent_off') doc.value = v.number('value', value, { required: true, integer: true, min: 1, max: 100, label: 'Percent off' });
    else if (kind === 'final_price') doc.value = v.number('value', value, { required: true, integer: true, min: MIN_PAISE, max: 10000000, label: 'Final price (paise)' });
    else if (kind === 'amount_off') doc.value = v.number('value', value, { required: true, integer: true, min: 1, max: 10000000, label: 'Amount off (paise)' });
  }
  if (has('plans')) {
    const plans = v.list('plans', body.plans, { maxItems: PLAN_CODES.length, label: 'Plans' }) || [];
    if (plans.length === 0) v.fail('plans', 'Choose at least one plan');
    else if (plans.some((p) => !PLAN_CODES.includes(p))) v.fail('plans', 'Unknown plan');
    doc.plans = plans;
  }
  // null = unlimited.
  if (has('maxUses')) doc.maxUses = v.number('maxUses', body.maxUses, { integer: true, min: 1, max: 1000000, label: 'Max uses' });
  if (has('maxUsesPerEmail')) {
    doc.maxUsesPerEmail = v.number('maxUsesPerEmail', body.maxUsesPerEmail, { integer: true, min: 1, max: 1000, label: 'Uses per email' }) ?? 1;
  }
  if (has('allowedEmails')) {
    const emails = v.list('allowedEmails', body.allowedEmails, { maxItems: 500, maxLength: 254, label: 'Allowed emails' }) || [];
    doc.allowedEmails = [];
    for (const raw of emails) {
      const email = v.email('allowedEmails', raw, { label: 'Allowed email' });
      if (email) doc.allowedEmails.push(email);
    }
  }
  if (has('expiresAt')) {
    if (body.expiresAt === null || body.expiresAt === undefined || body.expiresAt === '') doc.expiresAt = null;
    else {
      const date = new Date(body.expiresAt);
      if (Number.isNaN(date.getTime())) v.fail('expiresAt', 'Expiry date is not valid');
      else doc.expiresAt = date;
    }
  }
  if (has('isActive')) doc.isActive = body.isActive === undefined ? true : body.isActive === true;
  if (has('grants')) doc.grants = grantsFrom(body.grants, v);
  if (has('note')) doc.note = v.string('note', body.note, { max: 500, label: 'Note' }) || '';
  v.assert();
  return doc;
}

export function serializeCoupon(coupon) {
  const grant = coupon.grants?.categoryAccess ?? null;
  return {
    id: coupon._id.toString(),
    code: coupon.code,
    kind: coupon.kind,
    value: coupon.value,
    plans: coupon.plans || [],
    maxUses: coupon.maxUses ?? null,
    usedCount: coupon.usedCount || 0,
    reservedCount: coupon.reservedCount || 0,
    maxUsesPerEmail: coupon.maxUsesPerEmail || 1,
    allowedEmails: coupon.allowedEmails || [],
    expiresAt: coupon.expiresAt || null,
    isActive: coupon.isActive === true,
    grants: { categoryAccess: Array.isArray(grant) ? grant.map(String) : grant },
    note: coupon.note || '',
    createdBy: coupon.createdBy ? String(coupon.createdBy) : null,
    createdAt: coupon.createdAt,
    updatedAt: coupon.updatedAt || null,
  };
}
