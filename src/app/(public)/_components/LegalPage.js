import { formatLongDate, SITE } from '@/lib/site';

// Shared frame for policy pages: title, effective date, Hinglish summary, body.
export default function LegalPage({ title, summary, children }) {
  return (
    <article className="pub-container pub-narrow pub-legal">
      <h1>{title}</h1>
      <p className="muted small">
        {SITE.name} by {SITE.company} · Effective {formatLongDate(SITE.effectiveDate)}
      </p>
      {summary && (
        <aside className="pub-summary" aria-label="Short summary">
          <strong>Short mein:</strong> {summary}
        </aside>
      )}
      {children}
    </article>
  );
}
