import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import LoginForm from './LoginForm';
import ThemeToggle from '@/components/ThemeToggle';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · Product Hub' };

export default async function LoginPage({ searchParams }) {
  if (await getCurrentUser()) redirect('/dashboard');
  const params = await searchParams;
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="brand" style={{ padding: '0 0 1rem' }}>
          <span className="brand-mark" aria-hidden="true">PH</span>
          Product Hub
        </div>
        <h1>Sign in</h1>
        <p className="muted small">Accounts are created by the Admin. Contact them if you need access.</p>
        {params?.expired && <div className="alert alert-info">Your session has ended. Please sign in again.</div>}
        <LoginForm />
        <div className="row mt-1" style={{ justifyContent: 'center' }}>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
