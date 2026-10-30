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
  themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return (
    // data-theme is set by the inline script before hydration.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
