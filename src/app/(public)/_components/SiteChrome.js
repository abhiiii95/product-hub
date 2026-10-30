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
          <Link href="/#plans">Plans</Link>
          {user && showDashboard ? (
            <Link className="btn btn-sm btn-primary" href="/dashboard">Dashboard</Link>
          ) : !user ? (
            <Link className="btn btn-sm" href="/login">Login</Link>
          ) : null}
          <ThemeToggle compact />
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
        <nav className="pub-footer-links" aria-label="Policies">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refund-policy">Refund policy</Link>
          <Link href="/shipping-policy">Shipping policy</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <p className="muted small">
          {SITE.name} by {SITE.company} · <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          {wa && (
            <>
              {' '}· <a href={wa} rel="noopener noreferrer" target="_blank">WhatsApp</a>
            </>
          )}
        </p>
        <p className="muted small">
          © {new Date().getFullYear()} {SITE.company}
          {SITE.gstin && <> · GSTIN {SITE.gstin}</>}
        </p>
      </div>
    </footer>
  );
}
