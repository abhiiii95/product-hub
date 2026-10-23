'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { FeedbackProvider } from './Feedback';
import ThemeToggle from './ThemeToggle';
import { ROLE_LABELS } from '@/lib/constants';
import { api } from '@/lib/client';

const UserContext = createContext(null);
export const useCurrentUser = () => useContext(UserContext);

const NAV = [
  { section: 'Workspace' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/products', label: 'Product Catalog' },
  { href: '/listings', label: 'Listing Workspace' },
  { section: 'Admin', admin: true },
  { href: '/products/new', label: 'Add Product', admin: true },
  { href: '/categories', label: 'Categories & Fields', admin: true },
  { href: '/inventory', label: 'Inventory', admin: true },
  { href: '/pricing', label: 'Pricing Calculator', admin: true },
  { href: '/users', label: 'User Management', admin: true },
  { section: 'Account' },
  { href: '/account', label: 'Account Settings' },
];

function isCurrent(pathname, href) {
  if (href === '/products') return pathname === '/products' || (/^\/products\/[^/]+/.test(pathname) && pathname !== '/products/new');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ user, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const admin = user.role === 'admin';

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
              <span className="badge badge-primary">{ROLE_LABELS[user.role]}</span>
            </div>
          </header>
          {open && <div className="backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
          <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">PH</span>
              Product Hub
            </div>
            <nav className="nav">
              {NAV.filter((item) => !item.admin || admin).map((item) =>
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
                  <span className="badge badge-primary">{ROLE_LABELS[user.role]}</span>
                </div>
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
            {children}
            </div>
          </main>
        </div>
      </FeedbackProvider>
    </UserContext.Provider>
  );
}
