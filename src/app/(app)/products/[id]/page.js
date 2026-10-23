import ProductDetail from './ProductDetail';

export const metadata = { title: 'Product · Product Hub' };

export default async function ProductPage({ params }) {
  const { id } = await params;
  return <ProductDetail id={id} />;
}
