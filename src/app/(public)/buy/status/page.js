import Link from 'next/link';
import StatusClient from './StatusClient';

export const metadata = {
  title: 'Payment status · Product Hub',
  robots: { index: false, follow: false },
};

export default async function BuyStatusPage({ searchParams }) {
  const params = await searchParams;
  const order = typeof params?.order === 'string' ? params.order.trim().slice(0, 64) : '';

  return (
    <div className="pub-container pub-narrow pub-page">
      {order ? (
        <StatusClient key={order} orderId={order} />
      ) : (
        <div className="card pub-status">
          <h1>Order ID missing</h1>
          <p className="muted">This link does not include order details. Please start again from the plans page.</p>
          <Link className="btn btn-primary" href="/#plans">View plans</Link>
        </div>
      )}
    </div>
  );
}
