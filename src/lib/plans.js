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
      'Catalog for 2 categories of your choice',
      'One-click copy, Meesho-ready attributes',
      'Download single images or all images as a ZIP',
      'New titles and descriptions with AI (daily limit)',
      'We ship your orders, chat support',
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
      'All categories and all products',
      'New product and stock alerts by email',
      'Copy, ZIP download and AI titles included',
      'Chat + call support',
      'We ship your orders',
    ],
  },
};

export const PLAN_CODES = Object.keys(PLANS);

// While the catalog is small, every active plan (Starter included) sees every
// category. Set OPEN_CATALOG=no to bring back Starter's 2-category limit; nothing
// else changes (support level, prices and Pro stay as they are). Server-side only.
export const OPEN_CATALOG = process.env.OPEN_CATALOG !== 'no';
const OPEN_CATALOG_FEATURE = 'All categories and all products, for now';

// First m1 purchase per email and per phone; ends 2026-12-31 23:59:59 IST.
export const LAUNCH_OFFER = { plan: 'm1', paise: 9900, until: new Date('2026-12-31T18:29:59Z') };

export function getPlan(code) {
  return Object.prototype.hasOwnProperty.call(PLANS, code) ? PLANS[code] : null;
}

// How many categories a reseller on this plan picks themselves (0 = all included / none).
export function selfLimitForPlan(code) {
  if (OPEN_CATALOG) return 0;
  return getPlan(code)?.categoryLimit || 0;
}

export function isLaunchOfferLive(now = new Date()) {
  return now.getTime() <= LAUNCH_OFFER.until.getTime();
}

// Public shape used by GET /api/plans and the home page.
export function publicPlans() {
  return PLAN_CODES.map((code) => {
    const p = PLANS[code];
    const limited = p.categoryLimit && !OPEN_CATALOG;
    return {
      code: p.code,
      name: p.name,
      days: p.days,
      paise: p.paise,
      tier: p.tier,
      categoryLimit: limited ? p.categoryLimit : null,
      pickAtPurchase: p.pickAtPurchase && !OPEN_CATALOG,
      support: p.support,
      features: p.categoryLimit && OPEN_CATALOG ? [OPEN_CATALOG_FEATURE, ...p.features.slice(1)] : [...p.features],
    };
  });
}
