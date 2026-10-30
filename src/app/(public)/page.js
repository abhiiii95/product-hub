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

const STEPS = [
  { title: 'Plan lo', text: 'Starter ya Pro, jo aapke liye sahi ho. Payment UPI, card ya netbanking se.' },
  { title: 'Login mail par', text: 'Payment ke baad login details turant aapki email par aati hain.' },
  { title: 'Copy karo aur becho', text: 'Title, description aur images copy karo, apne portal par list karo, apni price lagao.' },
  { title: 'Order aaye to humein bhejo', text: 'Order details chat par bhejo. Packing aur shipping hum karte hain.' },
];

const FAQ = [
  {
    q: 'Order kaun ship karta hai?',
    a: 'Hum (CaseStores). Aap apne portal par becho, packing aur shipping hum karte hain. Order details chat par bhejo.',
  },
  {
    q: 'Kya same product kai reseller bech rahe honge?',
    a: 'Haan. AI se naya title/description banao taaki aapki listing alag dikhe; apni price aur photos bhi add kar sakte ho.',
  },
  {
    q: 'Refund milega?',
    a: (
      <>
        Access milne ke baad refund nahi. Double ya failed payment par poora refund. Contact:{' '}
        <a href={`mailto:${SITE.email}`}>{SITE.email}</a>. Poori details{' '}
        <Link href="/refund-policy">Refund policy</Link> mein.
      </>
    ),
  },
  {
    q: 'Plan khatam hone par kya hoga?',
    a: 'Access band, products blur dikhenge; auto-debit nahi, khud renew karo; Starter se Pro par kabhi bhi ja sakte ho.',
  },
  {
    q: 'Kya sale ki guarantee hai?',
    a: 'Nahi. Hum catalog, content, images aur shipping dete hain.',
  },
];

export default async function HomePage() {
  const plans = publicPlans();
  const offer = publicLaunchOffer();
  const preview = await publicCatalogPreview();

  return (
    <>
      <section className="pub-hero">
        <div className="pub-container">
          <p className="pub-eyebrow">{SITE.name} by {SITE.company}</p>
          <h1>Ready catalog, one-click copy, images ZIP, hum ship karte hain</h1>
          <p className="pub-lead">
            Resellers ke liye taiyaar product catalog. Title aur description ek click mein copy karo, saari images ZIP mein
            download karo, apne portal par becho. Order aaye to humein bhejo, packing aur shipping hum karte hain.
          </p>
          <div className="pub-cta-row">
            <Link className="btn btn-primary pub-btn-lg" href="#plans">Plans dekho</Link>
            <Link className="btn pub-btn-lg" href="#how">Kaise kaam karta hai</Link>
          </div>
          {offer?.active && (
            <p className="pub-hero-note">Launch offer: Starter ka pehla mahina sirf {formatRupees(offer.paise)}.</p>
          )}
        </div>
      </section>

      <section className="pub-section" aria-labelledby="catalog-title">
        <div className="pub-container">
          <h2 id="catalog-title">Catalog mein kya hai</h2>
          {preview === null ? (
            <p className="muted">Catalog preview abhi load nahi ho paaya. Thodi der baad dobara dekho.</p>
          ) : preview.length === 0 ? (
            <p className="muted">Naye products jaldi add ho rahe hain.</p>
          ) : (
            <ul className="pub-cats">
              {preview.map((c) => (
                <li key={c.name} className="pub-cat">
                  <div className="pub-cat-thumbs" aria-hidden={c.thumbs.length === 0 ? 'true' : undefined}>
                    {c.thumbs.length === 0 ? (
                      <span className="pub-cat-placeholder">{c.name.slice(0, 1).toUpperCase()}</span>
                    ) : (
                      c.thumbs.map((src, i) => (
                        // Server-proxied, lightly blurred thumbnails (/api/public/catalog-image); no Cloudinary URL.
                        <img key={src} src={src} alt={`${c.name} product ${i + 1}`} loading="lazy" width="240" height="240" />
                      ))
                    )}
                  </div>
                  <div className="pub-cat-body">
                    <strong>{c.name}</strong>
                    <span className="muted small">{c.productCount} products</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="pub-section pub-section-alt" id="how" aria-labelledby="how-title">
        <div className="pub-container">
          <h2 id="how-title">Kaise kaam karta hai</h2>
          <ol className="pub-steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong>
                <span className="muted">{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="pub-section" id="plans" aria-labelledby="plans-title">
        <div className="pub-container">
          <h2 id="plans-title">Plans</h2>
          <p className="muted">Auto-renew nahi. Plan khatam hone par aap khud renew karte ho.</p>
          <PlanCards plans={plans} offer={offer} />
        </div>
      </section>

      <section className="pub-section pub-section-alt" id="faq" aria-labelledby="faq-title">
        <div className="pub-container pub-narrow">
          <h2 id="faq-title">FAQ</h2>
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

      <section className="pub-section" id="contact" aria-labelledby="contact-title">
        <div className="pub-container pub-narrow">
          <h2 id="contact-title">Contact</h2>
          <p className="muted">Sawal ho to likho, chat support WhatsApp/email par milta hai.</p>
          <ContactDetails />
        </div>
      </section>
    </>
  );
}
