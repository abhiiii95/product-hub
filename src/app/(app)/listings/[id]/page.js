import ListingDetail from './ListingDetail';

export const metadata = { title: 'Listing · Product Hub' };

export default async function ListingPage({ params }) {
  const { id } = await params;
  return <ListingDetail id={id} />;
}
