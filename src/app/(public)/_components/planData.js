import { LAUNCH_OFFER, isLaunchOfferLive, publicPlans as libPublicPlans } from '@/lib/plans';

// Plain, serialisable plan data for server pages and the client buy form.
// The plan list and the offer window come from src/lib/plans.js; this only
// shapes them for the components (shortest plan first, offer as planCode/ISO date).
export function publicPlans() {
  return libPublicPlans().sort((a, b) => a.days - b.days);
}

// { planCode, paise, until, active } or null. The server quote is the real price;
// this only decides what the cards advertise.
export function publicLaunchOffer(now = new Date()) {
  if (!LAUNCH_OFFER) return null;
  return {
    planCode: LAUNCH_OFFER.plan,
    paise: LAUNCH_OFFER.paise,
    until: LAUNCH_OFFER.until.toISOString(),
    active: isLaunchOfferLive(now),
  };
}
