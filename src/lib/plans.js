// Reseller plans. Prices are in paise (₹1 = 100 paise). No auto-renew:
// access ends at `planEndsAt`. Pure data + helpers, safe to import anywhere.

export const MIN_PAISE = 100;

export const PLANS = {
  m1: {
    code: 'm1',
    name: 'Starter Reseller',
    days: 30,
    paise: 29900,
    tier: 'limited',
    categoryLimit: 2,
    pickAtPurchase: true,
    support: 'chat',
    features: [
      'Aapki chuni hui 2 categories ka catalog',
      'One-click copy, Meesho-ready attributes',
      'Single image ya saari images ZIP',
      'AI se naya title/description (daily limit)',
      'Order hum ship karte hain, chat support',
    ],
  },
  m3: {
    code: 'm3',
    name: 'Pro Reseller',
    days: 90,
    paise: 49900,
    tier: 'all',
    // null = no limit (every category is included).
    categoryLimit: null,
    pickAtPurchase: false,
    support: 'chat+call',
    features: [
      'Saari categories, saare products',
      'Naye product aur stock alerts email par',
      'Copy, ZIP download, AI titles sab included',
      'Chat + call support',
      'Order hum ship karte hain',
    ],
  },
};

export const PLAN_CODES = Object.keys(PLANS);

// First m1 purchase per email and per phone; ends 2026-12-31 23:59:59 IST.
export const LAUNCH_OFFER = { plan: 'm1', paise: 9900, until: new Date('2026-12-31T18:29:59Z') };

export function getPlan(code) {
  return Object.prototype.hasOwnProperty.call(PLANS, code) ? PLANS[code] : null;
}

// How many categories a reseller on this plan picks themselves (0 = all included / none).
export function selfLimitForPlan(code) {
  return getPlan(code)?.categoryLimit || 0;
}

export function isLaunchOfferLive(now = new Date()) {
  return now.getTime() <= LAUNCH_OFFER.until.getTime();
}

// Public shape used by GET /api/plans and the home page.
export function publicPlans() {
  return PLAN_CODES.map((code) => {
    const p = PLANS[code];
    return {
      code: p.code,
      name: p.name,
      days: p.days,
      paise: p.paise,
      tier: p.tier,
      categoryLimit: p.categoryLimit,
      pickAtPurchase: p.pickAtPurchase,
      support: p.support,
      features: [...p.features],
    };
  });
}
