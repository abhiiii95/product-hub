import Link from 'next/link';
import { formatRupees } from '@/lib/site';

export function monthsLabel(days) {
  const months = Math.max(1, Math.round(Number(days) / 30));
  return `${months} ${months === 1 ? 'month' : 'months'}`;
}

const TAGLINES = {
  m1: 'Two categories of your choice for one month.',
  m3: 'The full catalog for three months, with call support.',
};

// Pro vs. buying Starter month after month, worked out from the real prices.
function valueLine(plan, plans) {
  const starter = plans.find((p) => p.code === 'm1');
  if (plan.code !== 'm3' || !starter) return '';
  const months = Math.max(1, Math.round(plan.days / 30));
  const perMonth = Math.floor(plan.paise / months / 100) * 100;
  const saved = starter.paise * months - plan.paise;
  if (saved <= 0) return '';
  return `About ${formatRupees(perMonth)} a month. You save ${formatRupees(saved)} compared with ${months} months of Starter.`;
}

// Server-rendered plan cards. `linkFor(code)` builds the button target.
export default function PlanCards({ plans, offer, linkFor = (code) => `/buy?plan=${code}`, ctaLabel = 'Get' }) {
  if (!plans?.length) {
    return <p className="muted">Plans could not be loaded. Please check back in a few minutes.</p>;
  }
  return (
    <>
      <div className="pub-plans">
        {plans.map((plan) => {
          const featured = plan.code === 'm3';
          const tagline = TAGLINES[plan.code];
          const offerHere = offer?.active && offer.planCode === plan.code;
          const extra = valueLine(plan, plans);
          return (
            <article key={plan.code} className={`pub-plan${featured ? ' featured' : ''}`} aria-labelledby={`plan-${plan.code}`}>
              <div className="pub-plan-head">
                <h3 id={`plan-${plan.code}`}>{plan.name}</h3>
                {featured && <span className="pub-plan-badge">Best value</span>}
              </div>
              {tagline && <p className="pub-plan-tagline">{tagline}</p>}
              <p className="pub-price">
                <strong>{formatRupees(plan.paise)}</strong>
                <span> / {monthsLabel(plan.days)}</span>
              </p>
              {offerHere && (
                <p className="pub-offer">
                  Launch offer: first month {formatRupees(offer.paise)}, then {formatRupees(plan.paise)} a month.
                </p>
              )}
              {extra && <p className="pub-plan-value">{extra}</p>}
              <Link className={`btn btn-block btn-lg ${featured ? 'btn-primary' : ''}`} href={linkFor(plan.code)}>
                {ctaLabel} {plan.name}
              </Link>
              {plan.features.length > 0 && (
                <ul className="pub-ticks">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
      <p className="muted small pub-disclaimer">Plans do not renew automatically. Your earnings depend on your own selling; we do not guarantee sales.</p>
    </>
  );
}
