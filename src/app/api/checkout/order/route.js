import { getDb, ObjectId } from '@/lib/db';
import { json, readJson, route, badRequest } from '@/lib/api';
import { getCurrentUser, ownCheckoutEmail } from '@/lib/auth';
import { Validator } from '@/lib/validate';
import { ROLES } from '@/lib/constants';
import { PLAN_CODES, getPlan, selfLimitForPlan } from '@/lib/plans';
import { quote, releaseCouponHold, reserveCoupon } from '@/lib/coupons';
import { createProviderOrder } from '@/lib/payments';
import { existingCategoryIds } from '@/lib/subscriptions';
import { normalizePhone } from '@/lib/users';
import { clientIp, hashKey, hit } from '@/lib/rateLimit';

// Public: creates a payment order. The price is always re-computed here, never taken from the client.
export const POST = route(async (request) => {
  const ipHash = hashKey(clientIp(request));
  await hit(`order:ip:${ipHash}`, 10, 3600);
  const body = await readJson(request);
  // Honeypot: real buyers never see this field.
  if (body.website !== undefined && body.website !== null && String(body.website).trim() !== '') {
    throw badRequest('Could not create the order. Please try again.');
  }

  const session = await getCurrentUser();
  const renewing = session?.role === ROLES.LISTING_USER;
  const v = new Validator();
  const name = v.string('name', body.name || (renewing ? session.name : ''), { required: true, max: 100, label: 'Name' });
  const email = renewing ? ownCheckoutEmail(session, body.email) : v.email('email', body.email);
  const phone = normalizePhone(body.phone || (renewing ? session.phone : ''));
  if (!phone) v.fail('phone', 'Enter a valid 10-digit Indian mobile number');
  const planCode = v.oneOf('planCode', body.planCode, PLAN_CODES, { label: 'Plan' });
  const couponCode = v.string('couponCode', body.couponCode, { max: 40, label: 'Coupon' });
  const rawCategoryIds = v.list('categoryIds', body.categoryIds, { maxItems: 10, maxLength: 24, label: 'Categories' }) || [];
  v.assert();
  await hit(`order:email:${hashKey(email)}`, 5, 3600);

  const plan = getPlan(planCode);
  const db = await getDb();
  const existing = await db.collection('users').findOne({ email }, { projection: { role: 1, isActive: 1 } });
  if (existing && (existing.role !== ROLES.LISTING_USER || !existing.isActive)) {
    // Same message for admins and deactivated accounts.
    throw badRequest('This email cannot be used for a purchase. Please contact support.');
  }

  // Someone paying for an existing reseller's email (not signed in as them) only adds plan
  // days; they must not choose that reseller's categories.
  const buyerIsOwner = !existing || Boolean(session && session._id.equals(existing._id));

  // Category picks only apply to plans that pick at purchase (m1).
  let requestedCategoryIds = [];
  if (selfLimitForPlan(plan.code) > 0 && buyerIsOwner && rawCategoryIds.length) {
    if (rawCategoryIds.length > plan.categoryLimit) throw badRequest(`Choose at most ${plan.categoryLimit} categories`, { categoryIds: 'Too many categories' });
    requestedCategoryIds = await existingCategoryIds(rawCategoryIds, { activeOnly: true });
    if (requestedCategoryIds.length !== rawCategoryIds.length) throw badRequest('Some categories are not available', { categoryIds: 'Unknown category' });
  }

  const q = await quote({ planCode, email, phone, couponCode });
  if (q.couponError) throw badRequest(q.couponError, { couponCode: q.couponError });

  const paymentId = new ObjectId();
  // Holds one coupon use until the payment ends, so parallel orders cannot share the last use.
  if (q.coupon) await reserveCoupon({ coupon: q.coupon, email, paymentId });
  let order;
  const now = new Date();
  try {
    order = await createProviderOrder({
      amountPaise: q.finalPaise,
      receipt: `ph_${paymentId.toString()}`,
      notes: { planCode, paymentId: paymentId.toString() },
    });
    await db.collection('payments').insertOne({
      _id: paymentId,
      provider: order.provider,
      providerOrderId: order.providerOrderId,
      planCode,
      price: {
        listPaise: q.listPaise,
        offerApplied: q.offerApplied,
        couponDiscountPaise: q.couponApplied ? q.listPaise - q.finalPaise : 0,
        finalPaise: q.finalPaise,
      },
      couponId: q.coupon?._id || null,
      couponCode: q.coupon?.code || null,
      customer: { name, email, phone },
      requestedCategoryIds,
      buyerUserId: session?._id || null,
      buyerIsOwner,
      userId: existing?._id || null,
      status: 'created',
      paidAt: null,
      fulfilledAt: null,
      failure: null,
      refund: null,
      events: [{ type: 'created', at: now }],
      ipHash,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    // No order was stored, so give the held coupon use back.
    if (q.coupon) await releaseCouponHold(paymentId).catch(() => {});
    throw err;
  }

  const out = {
    provider: order.provider,
    orderId: order.providerOrderId,
    amountPaise: q.finalPaise,
    currency: 'INR',
    planCode,
    planName: plan.name,
    offerApplied: q.offerApplied,
    couponApplied: q.couponApplied,
    prefill: { name, email, contact: phone },
    statusUrl: `/buy/status?order=${encodeURIComponent(order.providerOrderId)}`,
  };
  if (order.keyId) out.keyId = order.keyId;
  return json(out, { status: 201 });
});
