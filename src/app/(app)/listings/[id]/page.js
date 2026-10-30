import { requirePageAdmin } from '@/lib/auth';
import ListingDetail from './ListingDetail';

export const metadata = { title: 'Listing · Product Hub' };

// Shared listing content is edited by the admin only; resellers use /my-listings.
export default async function ListingPage({ params }) {
  await requirePageAdmin();
  const { id } = await params;
  return <ListingDetail id={id} />;
}
