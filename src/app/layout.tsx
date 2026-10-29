import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { DemoControls } from '@/components/DemoControls';
import { ThemeToggle } from '@/components/ThemeToggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'Service Explorer · MedEx',
  description: 'Browse and compare health services by provider, with live filters.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}" }} />
      </head>
      <body>
        <a className="skip" href="#main">Skip to results</a>
        <div className="sitebar">
          <Link href="/" className="brand"><img className="brand-logo" src="/medex-logo.png" width={640} height={250} alt="MedEx Health Services" /><span className="brand-name">Explorer</span></Link>
          <ThemeToggle />
        </div>
        {children}
        <footer className="footer">
          <Link href="/data-issues">Why some data looks different</Link>
          <DemoControls />
        </footer>
      </body>
    </html>
  );
}
