import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Log',
  description: 'A minimal, honest fitness tracker — daily logs and a weekly verdict.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Log',
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon-180.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#15171b',
};

// Authenticated app: render dynamically so Clerk is not initialized during
// static prerender (it requires a real publishable key at request time).
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&family=Oswald:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClerkProvider
          afterSignInUrl="/today"
          afterSignUpUrl="/today"
          signInUrl="/sign-in"
          signUpUrl="/sign-in"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
