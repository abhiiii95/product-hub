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
          <p className="muted">Is link mein order ki jaankari nahi hai. Plans page se dobara shuru karo.</p>
          <Link className="btn btn-primary" href="/#plans">Plans dekho</Link>
        </div>
      )}
    </div>
  );
}
