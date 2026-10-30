import Link from 'next/link';
import { publicUser, requirePageUser } from '@/lib/auth';
import { formatLongDate } from '@/lib/site';
import { SiteFooter, SiteHeader } from '../(public)/_components/SiteChrome';
import PlanCards from '../(public)/_components/PlanCards';
import BuyForm from '../(public)/_components/BuyForm';
import { publicLaunchOffer, publicPlans } from '../(public)/_components/planData';
import PreviewGrid from './PreviewGrid';
import LogoutButton from './LogoutButton';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Plan renew karo · Product Hub',
  robots: { index: false, follow: false },
};

export default async function RenewPage({ searchParams }) {
  const user = await requirePageUser({ allowExpired: true });
  const me = publicUser(user);
  const plan = me.plan || null;
  const admin = user.role === 'admin';
  const active = admin || plan?.active === true;

  const params = await searchParams;
  const plans = publicPlans();
  const offer = publicLaunchOffer();
  const requested = typeof params?.plan === 'string' ? params.plan : '';
  const initialPlan = plans.some((p) => p.code === requested) ? requested : plan?.planCode || plans[0]?.code;

  return (
    <div className="pub">
      <a className="pub-skip" href="#main">Skip to content</a>
      <SiteHeader user={{ name: me.name }} showDashboard={active} />
      <main id="main" className="pub-main">
        {admin ? (
          // Admins have no plan; just send them back.
          <div className="pub-container pub-narrow pub-page">
            <div className="card pub-status">
              <h1>Ye page resellers ke liye hai</h1>
              <p className="muted">Admin account par plan nahi lagta.</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link className="btn btn-primary" href="/dashboard">Dashboard par jao</Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="pub-section pub-renew-top">
              <div className="pub-container">
                {active ? (
                  <div className="row-between">
                    <div>
                      <h1>Plan renew/upgrade karo</h1>
                      <p className="muted">
                        {plan?.endsAt ? <>Aapka plan {formatLongDate(plan.endsAt)} tak active hai. </> : null}
                        Naye din aapke current plan ke end ke baad judenge, koi din bekaar nahi jaayega.
                      </p>
                    </div>
                    <Link className="btn" href="/dashboard">Dashboard par jao</Link>
                  </div>
                ) : (
                  <>
                    <div className="row-between">
                      <div>
                        <h1>Aapka plan khatam ho gaya hai</h1>
                        <p className="muted">
                          {plan?.endsAt ? <>Plan {formatLongDate(plan.endsAt)} ko khatam hua. </> : null}
                          Renew karte hi saare products, copy aur downloads wapas khul jaayenge.
                        </p>
                      </div>
                      <LogoutButton />
                    </div>
                    <PreviewGrid />
                  </>
                )}
              </div>
            </section>

            <section className="pub-section pub-section-alt" aria-labelledby="renew-plans">
              <div className="pub-container">
                <h2 id="renew-plans">Plans</h2>
                <PlanCards plans={plans} offer={offer} linkFor={(code) => `/renew?plan=${code}#buy`} ctaLabel="Chuno" />
              </div>
            </section>

            <section className="pub-section" id="buy" aria-labelledby="renew-buy">
              <div className="pub-container pub-narrow">
                <h2 id="renew-buy">{active ? 'Renew ya upgrade karo' : 'Renew karo'}</h2>
                <div className="card">
                  <BuyForm
                    key={initialPlan}
                    plans={plans}
                    offer={offer}
                    initialPlan={initialPlan}
                    prefill={{ name: user.name, email: user.email, phone: user.phone }}
                    lockEmail
                  />
                </div>
              </div>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
