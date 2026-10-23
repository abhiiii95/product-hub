import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Page not found</h1>
        <p className="muted">The page you were looking for does not exist or you do not have access to it.</p>
        <Link className="btn btn-primary" href="/dashboard">Go to dashboard</Link>
      </div>
    </div>
  );
}
