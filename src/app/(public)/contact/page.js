import { SITE } from '@/lib/site';
import ContactDetails from '../_components/ContactDetails';
import LegalPage from '../_components/LegalPage';

export const metadata = {
  title: 'Contact · Product Hub',
  description: 'Contact Product Hub by CaseStores for plans, payments and support.',
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      summary="Write to us with any question about your plan, payment, login or orders. Please include your registered email and phone number."
    >
      <p>
        Support for {SITE.name} is by chat on email{SITE.whatsapp ? ' and WhatsApp' : ''}. Please include the email and phone
        number you used to buy your plan so we can find your account quickly.
      </p>
      <ContactDetails />
      {SITE.gstin && <p className="muted small">GSTIN: {SITE.gstin}</p>}
    </LegalPage>
  );
}
