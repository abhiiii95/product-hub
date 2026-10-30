import { getCurrentUser } from '@/lib/auth';
import { SiteFooter, SiteHeader } from './_components/SiteChrome';

export const dynamic = 'force-dynamic';

// The public site must render even if the session lookup fails (e.g. the
// database is briefly unreachable), so a failure just means "signed out".
async function safeCurrentUser() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

export default async function PublicLayout({ children }) {
  const user = await safeCurrentUser();
  return (
    <div className="pub">
      <a className="pub-skip" href="#main">Skip to content</a>
      <SiteHeader user={user ? { name: user.name } : null} />
      <main id="main" className="pub-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
