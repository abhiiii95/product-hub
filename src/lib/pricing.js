// Admin-only pricing maths. Safe to import on the client (pure functions, no data).

const toAmount = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
};

const round2 = (num) => Math.round(num * 100) / 100;

export function computePricing({ purchaseCost, packagingCost, additionalCost, sellingPrice } = {}) {
  const purchase = toAmount(purchaseCost);
  const packaging = toAmount(packagingCost);
  const additional = toAmount(additionalCost);
  const selling = toAmount(sellingPrice);
  const totalCost = round2(purchase + packaging + additional);
  const profit = round2(selling - totalCost);
  // A zero selling price has no meaningful margin; avoid dividing by zero.
  const margin = selling > 0 ? round2((profit / selling) * 100) : null;
  return {
    purchaseCost: purchase,
    packagingCost: packaging,
    additionalCost: additional,
    sellingPrice: selling,
    totalCost,
    profit,
    margin,
  };
}
