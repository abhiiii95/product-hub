import { Inter } from 'next/font/google';
import './globals.css';
import { themeInitScript } from '@/lib/theme';

// Self-hosted by Next at build time; exposed as --font-sans for globals.css.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const metadata = {
  title: 'Product Hub',
  description: 'Product management and marketplace listing workspace',
  // No robots rule here: the public site is indexable. The (app) layout,
  // /login and /renew opt out with their own `robots: { index: false }`.
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111113',
};

export default function RootLayout({ children }) {
  return (
    // Dark by default; the inline script switches to light before paint if chosen.
    <html lang="en" className={inter.variable} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
