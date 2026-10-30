import './globals.css';
import { themeInitScript } from '@/lib/theme';

export const metadata = {
  title: 'Product Hub',
  description: 'Product management and marketplace listing workspace',
  // No robots rule here: the public site is indexable. The (app) layout,
  // /login and /renew opt out with their own `robots: { index: false }`.
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#12151a' },
  ],
};

export default function RootLayout({ children }) {
  return (
    // data-theme is set by the inline script before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
