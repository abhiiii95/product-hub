'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { FeedbackProvider } from './Feedback';
import ThemeToggle from './ThemeToggle';
import { ROLES, ROLE_LABELS } from '@/lib/constants';
import { PLANS } from '@/lib/plans';
import { SITE, digitsOnly, whatsappLink } from '@/lib/site';
import { api } from '@/lib/client';

const UserContext = createContext(null);
export const useCurrentUser = () => useContext(UserContext);

const ADMIN_NAV = [
  { section: 'Workspace' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/products', label: 'Product Catalog' },
  { href: '/listings', label: 'Listing Workspace' },
  { section: 'Admin' },
  { href: '/products/new', label: 'Add Product' },
  { href: '/categories', label: 'Categories & Fields' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/pricing', label: 'Pricing Calculator' },
  { href: '/users', label: 'User Management' },
  { href: '/subscriptions', label: 'Subscriptions' },
  { href: '/coupons', label: 'Coupons' },
  { section: 'Account' },
  { href: '/account', label: 'Account Settings' },
];

// Resellers work in their own tracker, never in the shared Listing Workspace.
const RESELLER_NAV = [
  { section: 'Workspace' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/products', label: 'Product Catalog' },
  { href: '/my-listings', label: 'My Listings' },
  { href: '/my-categories', label: 'My Categories' },
  { section: 'Account' },
  { href: '/account', label: 'Account Settings' },
];

// The UI calls listing users "Reseller" (ROLE_LABELS keeps the older wording).
export function roleLabel(role) {
  return role === ROLES.LISTING_USER ? 'Reseller' : ROLE_LABELS[role] || role;
}

function dayDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

// Support details for the reseller's plan: chat for everyone, chat + call on the all-categories tier.
function SupportInfo({ plan }) {
  const call = plan?.tier === 'all';
  const chat = whatsappLink(SITE.whatsapp);
  return (
    <div className="plan-support small">
      <div>
        <strong>{call ? 'Chat + call support' : 'Chat support'}</strong>
      </div>
      <div className="row plan-support-links">
        {chat ? (
          <a href={chat} target="_blank" rel="noopener noreferrer">
            WhatsApp chat
          </a>
        ) : (
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        )}
        {call && SITE.phone && <a href={`tel:${digitsOnly(SITE.phone)}`}>Call {SITE.phone}</a>}
      </div>
    </div>
  );
}

function PlanBanner({ plan }) {
  if (!plan) return null;
  if (!plan.active) {
    return (
      <div className="alert alert-error plan-banner" role="status">
        <span>Aapka plan khatam ho gaya hai.</span>
        <Link href="/renew" className="btn btn-sm btn-primary">
          Renew
        </Link>
      </div>
    );
  }
  if (plan.daysLeft === null || plan.daysLeft === undefined || plan.daysLeft > 7) return null;
  return (
    <div className="alert alert-warning plan-banner" role="status">
      <span>
        <strong>Plan {plan.daysLeft} din mein khatam</strong>
        {plan.endsAt && <span className="muted"> ({dayDate(plan.endsAt)})</span>}. Renew karke access chalu rakho.
      </span>
      <Link href="/renew" className="btn btn-sm btn-primary">
        Renew
      </Link>
    </div>
  );
}

function isCurrent(pathname, href) {
  if (href === '/products') return pathname === '/products' || (/^\/products\/[^/]+/.test(pathname) && pathname !== '/products/new');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ user, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const admin = user.role === ROLES.ADMIN;
  const reseller = user.role === ROLES.LISTING_USER;
  const nav = admin ? ADMIN_NAV : RESELLER_NAV;
  const label = roleLabel(user.role);
  const plan = reseller ? user.plan : null;

  useEffect(() => setOpen(false), [pathname]);

  const logout = async () => {
    setLoggingOut(true);
    await api('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  return (
    <UserContext.Provider value={user}>
      <FeedbackProvider>
        <div className="shell">
          <header className="topbar">
            <button type="button" className="btn btn-sm" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}>
              ☰ Menu
            </button>
            <strong>Product Hub</strong>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <ThemeToggle compact />
              <span className="badge badge-primary">{label}</span>
            </div>
          </header>
          {open && <div className="backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
          <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">PH</span>
              Product Hub
            </div>
            <nav className="nav">
              {nav.map((item) =>
                item.section ? (
                  <div key={item.section} className="nav-section">
                    {item.section}
                  </div>
                ) : (
                  <Link key={item.href} href={item.href} aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}>
                    {item.label}
                  </Link>
                )
              )}
            </nav>
            <div className="sidebar-footer">
              <div className="who">
                <strong className="truncate">{user.name}</strong>
                <span className="muted truncate">{user.email}</span>
                <div>
                  <span className="badge badge-primary">{label}</span>
                </div>
                {plan && (
                  <div className="plan-info small">
                    <span>{PLANS[plan.planCode]?.name || 'Plan'}</span>
                    {plan.endsAt && <span className="muted"> · till {dayDate(plan.endsAt)}</span>}
                  </div>
                )}
                {plan && <SupportInfo plan={plan} />}
              </div>
              <ThemeToggle />
              <button type="button" className="btn btn-block" onClick={logout} disabled={loggingOut}>
                {loggingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </aside>
          <main className="main" id="main">
            <div className="main-inner">
            {user.mustChangePassword && pathname !== '/account' && (
              <div className="alert alert-warning">
                You are using a temporary password. <Link href="/account">Change it in Account Settings</Link>.
              </div>
            )}
            {plan && <PlanBanner plan={plan} />}
            {children}
            </div>
          </main>
        </div>
      </FeedbackProvider>
    </UserContext.Provider>
  );
}
