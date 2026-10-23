import { formatMoney, formatPercent } from '@/lib/client';

// Admin-only cost/profit breakdown. Only rendered when the API returned pricing data.
export default function PricingCard({ pricing }) {
  if (!pricing) return null;
  return (
    <div className="card">
      <h2>Pricing &amp; profit</h2>
      <dl className="kv">
        <dt>Purchase cost</dt>
        <dd>{formatMoney(pricing.purchaseCost)}</dd>
        <dt>Packaging cost</dt>
        <dd>{formatMoney(pricing.packagingCost)}</dd>
        <dt>Additional cost</dt>
        <dd>{formatMoney(pricing.additionalCost)}</dd>
        <dt><strong>Total estimated cost</strong></dt>
        <dd><strong>{formatMoney(pricing.totalCost)}</strong></dd>
        <dt>Selling price</dt>
        <dd>{formatMoney(pricing.sellingPrice)}</dd>
        <dt><strong>Estimated profit</strong></dt>
        <dd>
          <strong style={{ color: pricing.profit < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatMoney(pricing.profit)}</strong>
        </dd>
        <dt>Estimated margin</dt>
        <dd>{pricing.margin === null ? 'N/A (no selling price)' : formatPercent(pricing.margin)}</dd>
      </dl>
      <p className="small muted mt-1">
        Estimate only – before marketplace commission, shipping deductions, taxes and return-related charges.
      </p>
    </div>
  );
}
