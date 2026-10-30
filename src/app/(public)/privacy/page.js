import { SITE } from '@/lib/site';
import LegalPage from '../_components/LegalPage';

export const metadata = {
  title: 'Privacy Policy · Product Hub',
  description: 'How Product Hub by CaseStores collects, uses and protects your personal data.',
};

export default function PrivacyPage() {
  const officer = SITE.grievanceOfficer || {};
  return (
    <LegalPage
      title="Privacy Policy"
      summary="We keep only your name, email, phone number and payment reference. We never store card or UPI details; Razorpay handles those. Your data is used only to run the service and is never sold. To view, correct or delete your data, email us."
    >
      <h2>1. Who we are</h2>
      <p>
        {SITE.name} is run by {SITE.company}. This policy explains what personal data we collect when you visit the site, buy a
        plan or use the service, and how we handle it.
      </p>

      <h2>2. Data we collect</h2>
      <ul>
        <li>
          <strong>Account and purchase details:</strong> your name, email address and phone number.
        </li>
        <li>
          <strong>Payment reference:</strong> order and payment IDs, amount, plan and status, received from our payment partner
          Razorpay. <strong>We never see or store your card, UPI or bank details</strong>; Razorpay processes them directly.
        </li>
        <li>
          <strong>Usage data:</strong> sign-in sessions, the categories you pick, your listing tracker and basic technical logs
          (such as browser type) needed to keep the service secure. For fraud and abuse prevention we keep a one-way hash of your IP
          address, not the address itself.
        </li>
      </ul>

      <h2>3. Why we use it</h2>
      <ul>
        <li>to create your account, deliver your login details and give you access for your plan,</li>
        <li>to process payments and refunds,</li>
        <li>to send service emails such as receipts, plan reminders and product updates (you can turn updates off), and</li>
        <li>to provide support, prevent fraud and misuse, and meet legal obligations.</li>
      </ul>
      <p>We do not sell your personal data and we do not use it for third-party advertising.</p>

      <h2>4. Who we share it with</h2>
      <p>Only with service providers who help us run {SITE.name}, and only what they need:</p>
      <ul>
        <li>
          <strong>Razorpay</strong>, for payments,
        </li>
        <li>
          <strong>our email provider</strong>, to send account and service emails, and
        </li>
        <li>
          <strong>our hosting and database providers</strong>, which store the service data.
        </li>
      </ul>
      <p>We may also disclose data when required by law or to protect our rights and users.</p>

      <h2>5. How long we keep it</h2>
      <p>
        We keep account data while your account exists and for a reasonable period afterwards so you can renew. Payment records
        are kept for as long as tax and accounting laws require. Technical logs and security records are kept for a short time
        and then deleted.
      </p>

      <h2>6. Your rights</h2>
      <p>
        You can ask us to show, correct or delete your personal data, or to stop marketing emails, by writing to{' '}
        <a href={`mailto:${SITE.email}`}>{SITE.email}</a>. Some data (such as payment records) may need to be kept for legal
        reasons even after you ask for deletion.
      </p>

      <h2>7. Security</h2>
      <p>
        Passwords are stored hashed, connections use HTTPS, and access to data inside our team is limited to people who need it.
      </p>

      <h2>8. Grievances and contact</h2>
      <p>
        For any privacy question or complaint, contact our grievance officer
        {officer.name ? <>, {officer.name},</> : null} at{' '}
        <a href={`mailto:${officer.email || SITE.email}`}>{officer.email || SITE.email}</a>.
      </p>
      {SITE.address && (
        <p className="pre-wrap">
          Postal address: {SITE.address}
        </p>
      )}

      <h2>9. Changes</h2>
      <p>We may update this policy. The effective date at the top shows the latest version.</p>
    </LegalPage>
  );
}
