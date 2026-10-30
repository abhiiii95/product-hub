import Link from 'next/link';
import { formatRupees } from '@/lib/site';

export function monthsLabel(days) {
  const months = Math.max(1, Math.round(Number(days) / 30));
  return `${months} ${months === 1 ? 'mahina' : 'mahine'}`;
}

const TAGLINES = {
  m1: 'Ek mahina, apni pasand ki 2 categories.',
  m3: 'Poora catalog, 3 mahine, call support bhi.',
};

// Pro vs. buying Starter month after month, worked out from the real prices.
function valueLine(plan, plans) {
  const starter = plans.find((p) => p.code === 'm1');
  if (plan.code !== 'm3' || !starter) return '';
  const months = Math.max(1, Math.round(plan.days / 30));
  const perMonth = Math.floor(plan.paise / months / 100) * 100;
  const starterTotal = starter.paise * months;
  const saved = starterTotal - plan.paise;
  if (saved <= 0) return '';
  return `~${formatRupees(perMonth)}/mahina · ${months} mahine Starter = ${formatRupees(starterTotal)}, Pro = ${formatRupees(plan.paise)}, ${formatRupees(saved)} bachte hain.`;
}

// Server-rendered plan cards. `linkFor(code)` builds the button target.
export default function PlanCards({ plans, offer, linkFor = (code) => `/buy?plan=${code}`, ctaLabel = 'Plan lo' }) {
  if (!plans?.length) {
    return <p className="muted">Plans abhi load nahi ho paaye. Thodi der baad dobara dekho.</p>;
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
              {featured && <span className="pub-plan-badge">Best Value</span>}
              <h3 id={`plan-${plan.code}`}>{plan.name}</h3>
              <p className="pub-price">
                <strong>{formatRupees(plan.paise)}</strong>
                <span> / {monthsLabel(plan.days)}</span>
              </p>
              {tagline && <p className="pub-plan-tagline">{tagline}</p>}
              {offerHere && (
                <p className="pub-offer">
                  Pehla mahina sirf {formatRupees(offer.paise)}, phir {formatRupees(plan.paise)}/mahina. Auto-renew nahi, aap khud renew karte ho.
                </p>
              )}
              {extra && <p className="pub-plan-value">{extra}</p>}
              {plan.features.length > 0 && (
                <ul className="pub-ticks">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <Link className={`btn btn-block ${featured ? 'btn-primary' : ''}`} href={linkFor(plan.code)}>
                {ctaLabel}: {plan.name}
              </Link>
            </article>
          );
        })}
      </div>
      <p className="muted small pub-disclaimer">Kamai aapki selling par depend karti hai, hum sale ki guarantee nahi dete.</p>
    </>
  );
}
