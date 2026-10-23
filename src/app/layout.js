import './globals.css';

export const metadata = {
  title: 'Product Hub',
  description: 'Product management and marketplace listing workspace',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
