'use client';

export default function Error({ reset }) {
  return (
    <div className="card">
      <h1>Something went wrong</h1>
      <p className="muted">The page could not be loaded. Please try again.</p>
      <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
