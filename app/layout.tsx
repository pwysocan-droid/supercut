import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SUPERCUT',
  description: 'AI-powered video supercut generator',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
