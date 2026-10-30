import { json, readJson, route } from '@/lib/api';
import { getCurrentUser, ownCheckoutEmail } from '@/lib/auth';
import { Validator } from '@/lib/validate';
import { ROLES } from '@/lib/constants';
import { PLAN_CODES, getPlan, selfLimitForPlan } from '@/lib/plans';
import { quote } from '@/lib/coupons';
import { normalizePhone } from '@/lib/users';
import { clientIp, hashKey, hit } from '@/lib/rateLimit';

// Public: price preview for the buy form. Never reveals why a coupon failed.
export const POST = route(async (request) => {
  await hit(`quote:ip:${hashKey(clientIp(request))}`, 60, 3600);
  const body = await readJson(request);
  const session = await getCurrentUser();
  const v = new Validator();
  const planCode = v.oneOf('planCode', body.planCode, PLAN_CODES, { label: 'Plan' });
  // A signed-in reseller renews their own account.
  const email = session?.role === ROLES.LISTING_USER ? ownCheckoutEmail(session, body.email) : v.email('email', body.email);
  const phone = normalizePhone(body.phone);
  if (!phone) v.fail('phone', 'Enter a valid 10-digit Indian mobile number');
  const couponCode = v.string('couponCode', body.couponCode, { max: 40, label: 'Coupon' });
  v.assert();
  await hit(`quote:email:${hashKey(email)}`, 10, 3600);

  const q = await quote({ planCode, email, phone, couponCode });
  const plan = getPlan(planCode);
  const out = {
    listPaise: q.listPaise,
    finalPaise: q.finalPaise,
    offerApplied: q.offerApplied,
    couponApplied: q.couponApplied,
    pickCategories: { enabled: selfLimitForPlan(plan.code) > 0, max: selfLimitForPlan(plan.code) },
  };
  if (q.couponError) out.couponError = q.couponError;
  if (q.couponIgnored) out.couponIgnored = true;
  return json(out);
});
