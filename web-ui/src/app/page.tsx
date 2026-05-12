import { api } from '@/lib/api';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MeetingsPage() {
  let meetings: { id: string; title: string }[] = [];
  let error: string | null = null;

  try {
    meetings = await api.getMeetings();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Meetings</h1>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: 16, marginBottom: 20, color: '#dc2626' }}>
          Could not connect to backend: {error}
        </div>
      )}

      {!error && meetings.length === 0 && (
        <p style={{ color: '#6b7280' }}>No meetings yet. Start recording on your work PC to see them here.</p>
      )}

      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {meetings.map((m) => (
          <li key={m.id}>
            <Link
              href={`/meetings/${m.id}`}
              style={{
                display: 'block',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '14px 18px',
                color: '#111',
                fontWeight: 500,
                transition: 'border-color 0.15s',
              }}
            >
              {m.title || 'Untitled Meeting'}
              <span style={{ float: 'right', color: '#9ca3af', fontSize: 12, fontWeight: 400 }}>{m.id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
