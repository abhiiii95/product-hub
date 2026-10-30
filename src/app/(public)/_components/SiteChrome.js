import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { SITE, whatsappLink } from '@/lib/site';

// Public header. `user` is the signed-in user (or null); `showDashboard`
// lets /renew hide the Dashboard link for an expired plan.
export function SiteHeader({ user, showDashboard = true }) {
  return (
    <header className="pub-header">
      <div className="pub-container pub-header-inner">
        <Link href="/" className="brand pub-brand" aria-label={`${SITE.name} home`}>
          <span className="brand-mark" aria-hidden="true">PH</span>
          <span>{SITE.name}</span>
        </Link>
        <nav className="pub-nav" aria-label="Main">
          <Link className="pub-nav-link" href="/#how">How it works</Link>
          <Link className="pub-nav-link" href="/#plans">Pricing</Link>
          <Link className="pub-nav-link" href="/#faq">FAQ</Link>
          <ThemeToggle compact />
          {user && showDashboard ? (
            <Link className="btn btn-sm btn-primary" href="/dashboard">Dashboard</Link>
          ) : !user ? (
            <Link className="btn btn-sm" href="/login">Log in</Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const wa = whatsappLink(SITE.whatsapp);
  return (
    <footer className="pub-footer">
      <div className="pub-container">
        <div className="pub-footer-grid">
          <div>
            <Link href="/" className="brand pub-brand">
              <span className="brand-mark" aria-hidden="true">PH</span>
              <span>{SITE.name}</span>
            </Link>
            <p className="muted small pub-footer-about">A ready product catalog for resellers, by {SITE.company}.</p>
          </div>
          <nav aria-label="Product">
            <h3>Product</h3>
            <Link href="/#how">How it works</Link>
            <Link href="/#plans">Pricing</Link>
            <Link href="/#faq">FAQ</Link>
            <Link href="/login">Log in</Link>
          </nav>
          <nav aria-label="Policies">
            <h3>Policies</h3>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund-policy">Refund policy</Link>
            <Link href="/shipping-policy">Shipping policy</Link>
          </nav>
          <div>
            <h3>Contact</h3>
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
            {wa && <a href={wa} rel="noopener noreferrer" target="_blank">WhatsApp</a>}
            <Link href="/contact">Contact page</Link>
          </div>
        </div>
        <p className="muted small pub-footer-bottom">
          © {new Date().getFullYear()} {SITE.company}
          {SITE.gstin && <> · GSTIN {SITE.gstin}</>}
        </p>
      </div>
    </footer>
  );
}
