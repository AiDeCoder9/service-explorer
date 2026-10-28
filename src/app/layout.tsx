import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { DemoControls } from '@/components/DemoControls';
import './globals.css';

export const metadata: Metadata = {
  title: 'Service Explorer · MedEx',
  description: 'Browse and compare health services by provider, with live filters.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to results</a>
        {children}
        <footer className="footer">
          <Link href="/data-issues">Data issues and how we handled them</Link>
          <DemoControls />
        </footer>
      </body>
    </html>
  );
}
