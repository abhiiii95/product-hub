import { json, route } from '@/lib/api';
import { LAUNCH_OFFER, isLaunchOfferLive, publicPlans } from '@/lib/plans';

// Public: plan list for the home page and /buy. Static data, no login.
export const GET = route(async () => {
  return json({
    plans: publicPlans(),
    launchOffer: { plan: LAUNCH_OFFER.plan, paise: LAUNCH_OFFER.paise, until: LAUNCH_OFFER.until, active: isLaunchOfferLive() },
  });
});
