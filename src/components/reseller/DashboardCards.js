'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/client';
import { getPlan } from '@/lib/plans';
import { SITE, whatsappLink } from '@/lib/site';
import { RESELLER_LISTING_STATUSES, RESELLER_LISTING_STATUS_LABELS } from '@/lib/constants';

const TIER_LABELS = { all: 'All categories', limited: 'Selected categories' };

// Plan end date, days left, tier and a renew link.
export function ResellerPlanCard({ plan, access }) {
  if (!plan) return null;
  const name = getPlan(plan.planCode)?.name || 'Plan';
  const endingSoon = plan.active && plan.daysLeft !== null && plan.daysLeft <= 7;
  return (
    <div className={`card rs-plan-card${endingSoon ? ' is-ending' : ''}`}>
      <div className="card-header">
        <h2>My plan</h2>
        <span className={plan.active ? (endingSoon ? 'badge badge-warning' : 'badge badge-success') : 'badge badge-danger'}>
          {plan.active ? 'Active' : 'Ended'}
        </span>
      </div>
      <dl className="kv">
        <dt>Plan</dt>
        <dd>{name}</dd>
        <dt>Access</dt>
        <dd>
          {access?.all ? TIER_LABELS.all : `${TIER_LABELS.limited}${access?.categoryCount != null ? ` (${access.categoryCount})` : ''}`}
        </dd>
        <dt>Ends on</dt>
        <dd>{formatDate(plan.endsAt, false)}</dd>
        <dt>Days left</dt>
        <dd>
          <strong className={endingSoon ? 'rs-days-warn' : undefined}>{plan.daysLeft ?? '—'}</strong>
        </dd>
      </dl>
      {endingSoon && <p className="small rs-days-warn">Your plan ends soon. Renew now to keep working without a break.</p>}
      <div className="form-actions">
        {!access?.all && (
          <Link className="btn" href="/my-categories">
            My categories
          </Link>
        )}
        <Link className="btn btn-primary" href="/renew">
          Renew plan
        </Link>
      </div>
    </div>
  );
}

// Support options depend on the plan: chat for everyone, call on the all-access plan.
export function ResellerSupportCard({ support }) {
  const withCall = support === 'chat+call';
  const wa = whatsappLink(SITE.whatsapp);
  return (
    <div className="card">
      <div className="card-header">
        <h2>Support</h2>
        <span className="badge badge-info">{withCall ? 'Chat + call' : 'Chat'}</span>
      </div>
      <p className="small muted">{withCall ? 'Your plan includes chat and call support.' : 'Your plan includes chat support.'}</p>
      <dl className="kv">
        <dt>Email</dt>
        <dd>
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </dd>
        {wa && (
          <>
            <dt>WhatsApp chat</dt>
            <dd>
              <a href={wa} target="_blank" rel="noopener noreferrer">
                {SITE.whatsapp}
              </a>
            </dd>
          </>
        )}
        {withCall && SITE.phone && (
          <>
            <dt>Call</dt>
            <dd>
              <a href={`tel:${SITE.phone.replace(/[^\d+]/g, '')}`}>{SITE.phone}</a>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

// The reseller's own tracker records by status (all portals), linking into My Listings.
export function TrackerSummary({ counts }) {
  if (!counts) return null;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-header">
        <h2>My Listings</h2>
        <Link href="/my-listings" className="small">
          View all ({total}) →
        </Link>
      </div>
      {total === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          You are not tracking any listings yet. Open a product and set its status in &apos;My tracker&apos;.
        </p>
      ) : (
        <div className="rs-count-chips" style={{ marginBottom: 0 }}>
          {RESELLER_LISTING_STATUSES.map((s) => (
            <Link key={s} className={`rs-count-chip rs-tone-${s}`} href={`/my-listings?status=${s}`}>
              <span>{RESELLER_LISTING_STATUS_LABELS[s]}</span>
              <strong>{counts[s] ?? 0}</strong>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
