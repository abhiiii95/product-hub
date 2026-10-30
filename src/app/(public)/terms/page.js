import Link from 'next/link';
import { SITE } from '@/lib/site';
import LegalPage from '../_components/LegalPage';

export const metadata = {
  title: 'Terms of Service · Product Hub',
  description: 'Terms for using the Product Hub reseller catalog subscription by CaseStores.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="This is a digital subscription that gives you access to our product catalog. Follow each marketplace's rules, do not share your login and do not scrape data. We do not guarantee sales or earnings. Misuse can lead to your access being stopped."
    >
      <h2>1. About these terms</h2>
      <p>
        These terms apply to {SITE.name}, a service run by {SITE.company} (&quot;we&quot;, &quot;us&quot;). By buying a plan or using
        the service you (&quot;you&quot;, the reseller) agree to them. If you do not agree, please do not buy or use the service.
      </p>

      <h2>2. What you get</h2>
      <p>
        {SITE.name} is a digital subscription. For the period of your plan you get access to an online product catalog: product
        details, listing text you can copy or rewrite, and product images you can download, within the categories your plan
        includes. You can list these products on your own sales channels. When you receive an order, you send the order details
        to us and {SITE.company} packs and ships the product to your customer, as described in our{' '}
        <Link href="/shipping-policy">Shipping policy</Link>.
      </p>
      <p>
        Plans run for a fixed number of days and <strong>do not renew automatically</strong>. Access ends when the plan ends. You
        can renew or upgrade at any time. Product availability, prices and the catalog can change during your plan.
      </p>

      <h2>3. Your account</h2>
      <ul>
        <li>Your login is for you alone. Do not share, sell, rent or resell your access or the catalog to anyone else.</li>
        <li>Keep your password safe and change the temporary password we email you after your first login.</li>
        <li>Give us correct contact details so we can deliver access and support.</li>
      </ul>

      <h2>4. Your responsibilities as a reseller</h2>
      <ul>
        <li>
          Follow the rules, policies and listing guidelines of every marketplace or platform where you sell (for example
          Meesho, Flipkart, Amazon, Instagram or WhatsApp). You are responsible for your own listings, prices, taxes and dealings
          with your customers.
        </li>
        <li>Do not make false claims about products, and do not use the content in a misleading or unlawful way.</li>
        <li>
          Do not scrape, bulk-copy with automated tools, mirror or redistribute the catalog, and do not try to get around access
          limits or security.
        </li>
      </ul>

      <h2>5. No income guarantee</h2>
      <p>
        We provide the catalog, content, images and shipping. We do not promise any number of sales, orders, income or profit.
        Your results depend on your own selling effort, pricing and the marketplaces you use.
      </p>

      <h2>6. Payments and refunds</h2>
      <p>
        Prices are shown before you pay and are charged once per plan through our payment partner. Refunds are covered by our{' '}
        <Link href="/refund-policy">Refund policy</Link>.
      </p>

      <h2>7. Suspension and termination</h2>
      <p>
        We may suspend or end your access, without refund, if you break these terms, for example by sharing your login,
        reselling access, scraping the catalog or misusing the service. You can stop using the service at any time.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        The service is provided &quot;as is&quot;. To the extent the law allows, we are not liable for indirect or consequential losses,
        including lost profits, lost sales or marketplace account actions. Our total liability for any claim about the
        service is limited to the amount you paid for the plan in question.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms. The effective date at the top shows the latest version. Continuing to use the service after a
        change means you accept the updated terms.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of India
        {SITE.jurisdictionCity ? <>, and the courts at {SITE.jurisdictionCity} have jurisdiction over any dispute</> : null}.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>. See also our{' '}
        <Link href="/privacy">Privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
