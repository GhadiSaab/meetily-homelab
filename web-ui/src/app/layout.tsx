import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meetily',
  description: 'Meeting transcript and summary viewer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{ background: '#1e293b', color: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Meetily</a>
          <span style={{ flex: 1 }} />
          <a href="/settings" style={{ color: '#94a3b8', fontSize: 14 }}>Settings</a>
        </header>
        <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
