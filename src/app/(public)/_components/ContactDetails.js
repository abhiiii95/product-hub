import { digitsOnly, SITE, whatsappLink } from '@/lib/site';

// Contact list; phone, WhatsApp and address appear only when set in SITE.
export default function ContactDetails() {
  const wa = whatsappLink(SITE.whatsapp);
  return (
    <dl className="pub-contact">
      <div>
        <dt>Email</dt>
        <dd>
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </dd>
      </div>
      {wa && (
        <div>
          <dt>WhatsApp</dt>
          <dd>
            <a href={wa} target="_blank" rel="noopener noreferrer">{SITE.whatsapp}</a>
          </dd>
        </div>
      )}
      {SITE.phone && (
        <div>
          <dt>Phone</dt>
          <dd>
            <a href={`tel:+${digitsOnly(SITE.phone).length === 10 ? '91' : ''}${digitsOnly(SITE.phone)}`}>{SITE.phone}</a>
          </dd>
        </div>
      )}
      {SITE.address && (
        <div>
          <dt>Address</dt>
          <dd className="pre-wrap">{SITE.address}</dd>
        </div>
      )}
    </dl>
  );
}
