import Dashboard from './Dashboard';

export const metadata = { title: 'Dashboard · Product Hub' };

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  return <Dashboard denied={Boolean(params?.denied)} />;
}
