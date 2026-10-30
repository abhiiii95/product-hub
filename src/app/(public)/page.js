import Link from 'next/link';
import { formatRupees, SITE } from '@/lib/site';
import PlanCards, { percentOff } from './_components/PlanCards';
import LockedCatalog from './_components/LockedCatalog';
import OfferPopup from './_components/OfferPopup';
import ContactDetails from './_components/ContactDetails';
import { publicLaunchOffer, publicPlans } from './_components/planData';
import { publicCatalogPreview } from './_components/catalogPreview';

export const metadata = {
  title: 'Product Hub · Ready products to sell on Meesho, shipped by CaseStores',
  description:
    'Ready products to sell on Meesho: one-tap copy of titles and descriptions, images as a ZIP, and CaseStores ships every order. First month ₹99.',
};

// Simple 24px stroke icons; they inherit the text colour.
const ICONS = {
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  spark: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.5 6.5 2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  check: <path d="m5 12 4 4 10-10" />,
};

// Below this many active products the home page shows no product counts.
const SHOW_COUNT_FROM = 40;

function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const FEATURES = [
  { icon: 'copy', title: 'Listing content, ready to paste', text: 'Every product comes with a title, description and attributes you can copy in one click.' },
  { icon: 'image', title: 'All images in one ZIP', text: 'Download every product photo at once, or pick single images for your listing.' },
  { icon: 'spark', title: 'Rewrite with AI', text: 'Generate a fresh title and description so your listing does not look like everyone else’s.' },
  { icon: 'grid', title: 'Every product, every plan', text: 'For now, every plan includes the full catalog. New products are added as they come in.' },
  { icon: 'list', title: 'Your private tracker', text: 'Track what you have listed on each marketplace. Only you can see your tracker.' },
  { icon: 'truck', title: 'We pack and ship', text: 'Send us your order details and we handle packing and shipping for you.' },
];

const STEPS = [
  { title: 'Choose a plan', text: 'Pick Starter or Pro and pay by UPI, card or netbanking.' },
  { title: 'Get your login', text: 'Your login details arrive by email right after payment.' },
  { title: 'List and sell', text: 'Copy the content and images, list on your marketplace and set your own price.' },
  { title: 'Send us orders', text: 'Share the order details with us. We pack and ship.' },
];

const FAQ = [
  {
    q: 'Who ships the orders?',
    a: 'We do. You sell on your marketplace, then share the order details with us and we handle packing and shipping.',
  },
  {
    q: 'Will other resellers sell the same products?',
    a: 'Yes. Use the AI rewrite to create your own title and description so your listing stands out. You can also set your own price and add your own photos.',
  },
  {
    q: 'Can I get a refund?',
    a: (
      <>
        Refunds are not available once access is granted. Duplicate or failed payments are refunded in full. See our{' '}
        <Link href="/refund-policy">refund policy</Link> or write to <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
      </>
    ),
  },
  {
    q: 'What happens when my plan ends?',
    a: 'Your access pauses and products are shown blurred. There is no auto-debit, so you renew when you are ready. You can move from Starter to Pro at any time.',
  },
  {
    q: 'Do I need GST to sell on Meesho?',
    a: 'Meesho’s rules apply to your own seller account. Check Meesho’s supplier help, and confirm tax questions with a CA.',
  },
  {
    q: 'How often are new products added?',
    a: 'New products are added regularly. Pro members also get email alerts for new products and stock changes.',
  },
  {
    q: 'Do you guarantee sales?',
    a: 'No. We provide the catalog, listing content, images and shipping. Your sales depend on how you list and price.',
  },
];

function SectionHead({ eyebrow, title, lead, id }) {
  return (
    <div className="home-head">
      {eyebrow && <p className="home-eyebrow">{eyebrow}</p>}
      <h2 id={id}>{title}</h2>
      {lead && <p className="home-lead">{lead}</p>}
    </div>
  );
}

// Hero visual: a framed preview built from the real (blurred) catalog thumbnails.
function HeroVisual({ thumbs, total }) {
  return (
    <div className="home-visual" aria-hidden="true">
      <div className="home-window">
        <div className="home-window-bar">
          <span /><span /><span />
        </div>
        <div className="home-window-body">
          <div className="home-mock-grid">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="home-mock-thumb">
                {thumbs[i] ? <img src={thumbs[i]} alt="" width="240" height="240" /> : null}
              </div>
            ))}
          </div>
          <div className="home-mock-lines">
            <div className="home-mock-row">
              <span className="home-mock-label">Title</span>
              <span className="home-mock-btn">Copy</span>
            </div>
            <span className="home-mock-line" style={{ width: '92%' }} />
            <span className="home-mock-line" style={{ width: '70%' }} />
            <div className="home-mock-row">
              <span className="home-mock-label">Description</span>
              <span className="home-mock-btn">Copy</span>
            </div>
            <span className="home-mock-line" style={{ width: '96%' }} />
            <span className="home-mock-line" style={{ width: '88%' }} />
            <span className="home-mock-line" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
      <div className="home-float">
        <Icon name="check" size={16} />
        {total > 0 ? (
          <span><strong className="home-float-num">{total}</strong> products ready to list</span>
        ) : (
          <span>Ready to copy and list</span>
        )}
      </div>
    </div>
  );
}

export default async function HomePage() {
  const plans = publicPlans();
  const offer = publicLaunchOffer();
  const preview = await publicCatalogPreview();
  const categories = preview?.categories || [];
  const productTotal = preview?.productTotal || 0;
  // A small count reads as "nothing here", so numbers appear only once the catalog is big enough.
  const shownTotal = productTotal >= SHOW_COUNT_FROM ? productTotal : 0;
  const starter = plans.find((p) => p.code === 'm1');
  const offerLive = Boolean(offer?.active && starter);
  const entryPrice = offerLive ? offer.paise : plans.length ? Math.min(...plans.map((p) => p.paise)) : null;
  const pct = offerLive ? percentOff(offer.paise, starter.paise) : 0;

  return (
    <>
      <section className="home-hero">
        <div className="pub-container home-hero-grid">
          <div className="home-hero-copy">
            {offerLive ? (
              <p className="home-pill">
                <span className="home-pill-dot" /> Launch offer · {pct}% off your first month
              </p>
            ) : (
              <p className="home-pill">{SITE.name} by {SITE.company}</p>
            )}
            <h1>Ready products to sell on Meesho. We ship every order.</h1>
            <p className="home-hero-lead">
              Copy titles, descriptions and photos in one tap. List on Meesho, WhatsApp or Instagram. When you get an order, we pack and ship it.
            </p>
            <div className="home-cta">
              <Link className="btn btn-primary btn-lg home-cta-main" href={offerLive ? '/buy?plan=m1' : '#plans'}>
                {offerLive ? `Start for ${formatRupees(offer.paise)}` : 'View plans'}
              </Link>
              <Link className="btn btn-lg home-cta-second" href="#how">How it works</Link>
            </div>
            {offerLive && (
              <p className="home-cta-note">
                First month {formatRupees(offer.paise)}, then {formatRupees(starter.paise)} a month. No auto-debit.
              </p>
            )}
            <ul className="home-trust">
              <li><Icon name="check" size={16} /> Secure payment by Razorpay</li>
              <li><Icon name="check" size={16} /> Login by email in minutes</li>
              <li><Icon name="check" size={16} /> Run by {SITE.company}</li>
            </ul>
          </div>
          <HeroVisual thumbs={preview?.products || []} total={shownTotal} />
        </div>
      </section>

      <section className="home-stats" aria-label="At a glance">
        <div className="pub-container">
          <dl className="home-stats-grid">
            {shownTotal > 0 ? (
              <div className="home-stat-main">
                <dt>Products ready</dt>
                <dd>{shownTotal}</dd>
              </div>
            ) : (
              <div>
                <dt>Copy listing content</dt>
                <dd>1 tap</dd>
              </div>
            )}
            <div>
              <dt>Starting at</dt>
              <dd>{entryPrice ? formatRupees(entryPrice) : '—'}</dd>
            </div>
            <div>
              <dt>Auto-debit</dt>
              <dd>None</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>By us</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="home-section" aria-labelledby="features-title">
        <div className="pub-container">
          <SectionHead id="features-title" eyebrow="Features" title="Everything you need to list faster" lead="Spend your time selling, not writing listings or editing photos." />
          <ul className="home-features">
            {FEATURES.map((f) => (
              <li key={f.title} className="home-card">
                <span className="home-icon"><Icon name={f.icon} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-section home-section-alt" id="catalog" aria-labelledby="catalog-title">
        <div className="pub-container">
          <SectionHead
            id="catalog-title"
            eyebrow="Catalog"
            title={
              shownTotal > 0 ? (
                <>
                  <span className="home-count">{shownTotal}</span>
                  products ready to list
                </>
              ) : (
                'Products ready to list'
              )
            }
            lead="Products are blurred until you subscribe. Tap any product to see the plans."
          />
          {preview === null ? (
            <p className="muted home-center">The catalog preview could not be loaded. Please check back in a few minutes.</p>
          ) : preview.products.length === 0 ? (
            <p className="muted home-center">New products are coming soon.</p>
          ) : (
            <LockedCatalog thumbs={preview.products} total={productTotal} showCount={shownTotal > 0}>
              <PlanCards plans={plans} offer={offer} />
            </LockedCatalog>
          )}
          {categories.length > 1 && (
            <ul className="home-cat-chips" aria-label="Categories">
              {categories.map((c) => (
                <li key={c.name}>
                  {c.name} <span>{c.productCount}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="home-section" id="how" aria-labelledby="how-title">
        <div className="pub-container">
          <SectionHead id="how-title" eyebrow="How it works" title="Start selling in four steps" />
          <ol className="home-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="home-step-num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="home-section home-section-alt" id="plans" aria-labelledby="plans-title">
        <div className="pub-container">
          <SectionHead id="plans-title" eyebrow="Pricing" title="Simple plans, no auto-debit" lead="Pay once for the period you choose. Renew when you are ready." />
          <PlanCards plans={plans} offer={offer} />
        </div>
      </section>

      <section className="home-section" id="faq" aria-labelledby="faq-title">
        <div className="pub-container home-faq-grid">
          <div>
            <p className="home-eyebrow">FAQ</p>
            <h2 id="faq-title">Questions, answered</h2>
            <p className="home-lead">Cannot find what you are looking for? Write to us and we will get back to you.</p>
            <div id="contact" className="home-contact">
              <ContactDetails />
            </div>
          </div>
          <div className="pub-faq">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section home-final">
        <div className="pub-container">
          <div className="home-band">
            <div>
              <h2>Ready to start selling?</h2>
              <p>{offerLive ? `First month ${formatRupees(offer.paise)}. Get your login by email in minutes.` : 'Choose a plan and get your login by email in minutes.'}</p>
            </div>
            <Link className="btn btn-lg home-band-btn" href={offerLive ? '/buy?plan=m1' : '#plans'}>{offerLive ? `Start for ${formatRupees(offer.paise)}` : 'View plans'}</Link>
          </div>
        </div>
      </section>
      {offerLive && (
        <>
          <OfferPopup price={formatRupees(offer.paise)} listPrice={formatRupees(starter.paise)} percentOff={pct} />
          <div className="home-sticky">
            <div>
              <strong>{formatRupees(offer.paise)}</strong> <s>{formatRupees(starter.paise)}</s>
              <span>first month</span>
            </div>
            <Link className="btn btn-primary" href="/buy?plan=m1">Start now</Link>
          </div>
        </>
      )}
    </>
  );
}
