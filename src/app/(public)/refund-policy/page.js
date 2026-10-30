import { SITE } from '@/lib/site';
import LegalPage from '../_components/LegalPage';

export const metadata = {
  title: 'Refund Policy · Product Hub',
  description: 'Refund policy for Product Hub subscriptions by CaseStores.',
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      summary="Access milne ke baad refund nahi milta. Agar payment do baar kat gaya ya fail hone par bhi paise kate, to 7 din ke andar poora refund original payment method mein milega. Email karo order details ke saath."
    >
      <h2>1. Digital access is non-refundable</h2>
      <p>
        {SITE.name} plans give immediate access to a digital catalog. Once your login details have been delivered, the plan
        cannot be cancelled or refunded, including when you stop using the service before the plan ends.
      </p>

      <h2>2. Duplicate or failed charges</h2>
      <p>You get a full refund if:</p>
      <ul>
        <li>you were charged more than once for the same purchase, or</li>
        <li>money was taken from your account but the payment failed and no plan was activated.</li>
      </ul>
      <p>
        These refunds go back to the original payment method within <strong>7 days</strong> of us confirming the issue. Your bank
        or payment app may take a few extra working days to show the credit.
      </p>

      <h2>3. How to request a refund</h2>
      <p>
        Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> with:
      </p>
      <ul>
        <li>the email address and phone number used for the purchase,</li>
        <li>the payment date and amount, and</li>
        <li>the payment reference or UPI/bank transaction ID, if you have it.</li>
      </ul>

      <h2>4. Plan changes</h2>
      <p>
        Plans do not renew automatically, so you will never be charged again without buying a new plan yourself. You can move
        from Starter to Pro at any time by buying the Pro plan.
      </p>
    </LegalPage>
  );
}
