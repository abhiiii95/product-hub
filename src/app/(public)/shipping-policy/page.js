import { SITE } from '@/lib/site';
import LegalPage from '../_components/LegalPage';

export const metadata = {
  title: 'Shipping Policy · Product Hub',
  description: 'How Product Hub access is delivered and how CaseStores ships resellers’ orders.',
};

export default function ShippingPolicyPage() {
  return (
    <LegalPage
      title="Shipping Policy"
      summary="The plan is digital: your login details are emailed right after payment, usually within 15 minutes. CaseStores packs and ships the physical orders of your customers; resellers receive the details separately."
    >
      <h2>1. Delivery of your subscription</h2>
      <p>
        {SITE.name} is a digital service; nothing is shipped to you for the plan itself. After a successful payment we email your
        login details to the address you entered, immediately and usually within <strong>15 minutes</strong>.
      </p>
      <p>
        If you have not received the email within 15 minutes, check your spam or promotions folder, then write to{' '}
        <a href={`mailto:${SITE.email}`}>{SITE.email}</a> with the email and phone number you used.
      </p>

      <h2>2. Shipping of your customers’ orders</h2>
      <p>
        When one of your customers orders a catalog product from you, you send the order details to us and {SITE.company} packs
        and ships the product to that customer. Dispatch times, courier partners, delivery areas, charges and the process for
        returns are shared with resellers inside {SITE.name} and through our support channels, and may change from time to time.
      </p>
    </LegalPage>
  );
}
