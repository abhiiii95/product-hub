import Link from 'next/link';
import { getCurrentUser, publicUser } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import BuyForm from '../_components/BuyForm';
import { publicLaunchOffer, publicPlans } from '../_components/planData';
import LogoutButton from '../../renew/LogoutButton';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Plan kharido · Product Hub',
  description: 'Buy a Product Hub reseller plan. Login details arrive by email right after payment.',
};

// The buy page must render even if the session lookup fails, so a failure means "signed out".
async function signedInReseller() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== ROLES.LISTING_USER) return null;
    const me = publicUser(user);
    // phone is not part of publicUser; it is the buyer's own number, used only to prefill.
    return { name: me.name, email: me.email, phone: user.phone || '' };
  } catch {
    return null;
  }
}

export default async function BuyPage({ searchParams }) {
  const params = await searchParams;
  const requested = typeof params?.plan === 'string' ? params.plan : '';
  const plans = publicPlans();
  const offer = publicLaunchOffer();
  const reseller = await signedInReseller();

  return (
    <div className="pub-container pub-narrow pub-page">
      <p className="small">
        <Link href="/#plans">← Back to plans</Link>
      </p>
      <h1>Plan kharido</h1>
      <p className="muted">Your login details are emailed to you right after payment. Plans do not renew automatically.</p>
      {reseller && (
        <div className="alert alert-info row-between" role="note">
          <span style={{ flex: '1 1 14rem', minWidth: 0 }}>
            This plan will be added to your account (<strong style={{ overflowWrap: 'anywhere' }}>{reseller.email}</strong>). To buy for someone else, sign out first.
          </span>
          <LogoutButton redirectTo={`/buy${requested ? `?plan=${encodeURIComponent(requested)}` : ''}`} />
        </div>
      )}
      <div className="card">
        {reseller ? (
          <BuyForm plans={plans} offer={offer} initialPlan={requested} prefill={reseller} lockEmail />
        ) : (
          <BuyForm plans={plans} offer={offer} initialPlan={requested} />
        )}
      </div>
    </div>
  );
}
