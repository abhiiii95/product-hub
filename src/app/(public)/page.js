import Link from 'next/link';
import { formatRupees, SITE } from '@/lib/site';
import PlanCards from './_components/PlanCards';
import ContactDetails from './_components/ContactDetails';
import { publicLaunchOffer, publicPlans } from './_components/planData';
import { publicCatalogPreview } from './_components/catalogPreview';

export const metadata = {
  title: 'Product Hub · Ready catalog for resellers by CaseStores',
  description:
    'Ready product catalog for resellers: one-click copy of titles and descriptions, images as a ZIP, and CaseStores ships every order. Plans from ₹299.',
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
  { icon: 'grid', title: 'Choose your categories', text: 'Starter gives you two categories of your choice. Pro unlocks the full catalog.' },
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
function HeroVisual({ preview }) {
  const thumbs = (preview || []).flatMap((c) => c.thumbs).slice(0, 4);
  const first = preview?.[0];
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
        <span>{first ? `${first.productCount} products in ${first.name}` : 'Title copied'}</span>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const plans = publicPlans();
  const offer = publicLaunchOffer();
  const preview = await publicCatalogPreview();
  const productTotal = (preview || []).reduce((sum, c) => sum + c.productCount, 0);
  const categoryTotal = (preview || []).length;
  const lowest = plans.length ? Math.min(...plans.map((p) => p.paise)) : null;

  return (
    <>
      <section className="home-hero">
        <div className="pub-container home-hero-grid">
          <div className="home-hero-copy">
            {offer?.active ? (
              <p className="home-pill">
                <span className="home-pill-dot" /> Launch offer: first month of Starter for {formatRupees(offer.paise)}
              </p>
            ) : (
              <p className="home-pill">{SITE.name} by {SITE.company}</p>
            )}
            <h1>A ready product catalog for resellers.</h1>
            <p className="home-hero-lead">
              Copy listing content in one click, download every image as a ZIP and sell on your marketplace. When an order comes in, we pack and ship it.
            </p>
            <div className="home-cta">
              <Link className="btn btn-primary btn-lg" href="#plans">View plans</Link>
              <Link className="btn btn-lg" href="#how">How it works</Link>
            </div>
            <ul className="home-trust">
              <li><Icon name="check" size={16} /> No auto-debit</li>
              <li><Icon name="check" size={16} /> Login by email in minutes</li>
              <li><Icon name="check" size={16} /> We handle shipping</li>
            </ul>
          </div>
          <HeroVisual preview={preview} />
        </div>
      </section>

      <section className="home-stats" aria-label="At a glance">
        <div className="pub-container">
          <dl className="home-stats-grid">
            <div>
              <dt>Products</dt>
              <dd>{productTotal > 0 ? `${productTotal}+` : 'New'}</dd>
            </div>
            <div>
              <dt>Categories</dt>
              <dd>{categoryTotal > 0 ? categoryTotal : '—'}</dd>
            </div>
            <div>
              <dt>Plans from</dt>
              <dd>{lowest ? formatRupees(lowest) : '—'}</dd>
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

      <section className="home-section home-section-alt" aria-labelledby="catalog-title">
        <div className="pub-container">
          <SectionHead id="catalog-title" eyebrow="Catalog" title="What is in the catalog" lead="Products are shown blurred here. You see the full catalog after you subscribe." />
          {preview === null ? (
            <p className="muted home-center">The catalog preview could not be loaded. Please check back in a few minutes.</p>
          ) : preview.length === 0 ? (
            <p className="muted home-center">New products are coming soon.</p>
          ) : (
            <ul className="home-cats">
              {preview.map((c) => (
                <li key={c.name} className="home-cat">
                  <div className="home-cat-thumbs">
                    {c.thumbs.length === 0 ? (
                      <span className="home-cat-placeholder" aria-hidden="true">{c.name.slice(0, 1).toUpperCase()}</span>
                    ) : (
                      c.thumbs.map((src, i) => (
                        // Server-proxied, lightly blurred thumbnails (/api/public/catalog-image); no Cloudinary URL.
                        <img key={src} src={src} alt={`${c.name} product ${i + 1}`} loading="lazy" width="240" height="240" />
                      ))
                    )}
                  </div>
                  <div className="home-cat-body">
                    <strong>{c.name}</strong>
                    <span>{c.productCount} {c.productCount === 1 ? 'product' : 'products'}</span>
                  </div>
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
              <p>Choose a plan and get your login by email in minutes.</p>
            </div>
            <Link className="btn btn-lg home-band-btn" href="#plans">View plans</Link>
          </div>
        </div>
      </section>
    </>
  );
}
