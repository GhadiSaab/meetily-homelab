'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, MeetingDetails, SummaryResponse, ModelConfig } from '@/lib/api';
import Link from 'next/link';

type SummaryState = 'idle' | 'starting' | 'processing' | 'done' | 'error';

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [meeting, setMeeting] = useState<MeetingDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [summaryState, setSummaryState] = useState<SummaryState>('idle');
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    api.getMeeting(id).then(setMeeting).catch((e) => setLoadError(String(e)));
    api.getModelConfig().then(setModelConfig).catch(() => {});
    // Check if there's already a summary
    api.getSummary(id)
      .then((s) => {
        if (s.status === 'completed') { setSummary(s); setSummaryState('done'); }
        else if (s.status === 'processing') { setSummaryState('processing'); }
      })
      .catch(() => {});
  }, [id]);

  // Poll when processing
  useEffect(() => {
    if (summaryState !== 'processing') return;
    const timer = setInterval(async () => {
      try {
        const s = await api.getSummary(id);
        if (s.status === 'completed') {
          setSummary(s);
          setSummaryState('done');
          clearInterval(timer);
        } else if (s.status === 'error') {
          setSummaryError(s.error ?? 'Unknown error');
          setSummaryState('error');
          clearInterval(timer);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [summaryState, id]);

  const handleGenerateSummary = useCallback(async () => {
    if (!meeting) return;
    setSummaryState('starting');
    setSummaryError(null);
    try {
      const fullText = meeting.transcripts.map((t) => t.text).join('\n');
      const provider = modelConfig?.provider ?? 'gemini';
      const model = modelConfig?.model ?? 'gemini-1.5-flash';
      await api.processTranscript(id, fullText, provider, model);
      setSummaryState('processing');
    } catch (e) {
      setSummaryError(String(e));
      setSummaryState('error');
    }
  }, [meeting, id, modelConfig]);

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this meeting and all its data?')) return;
    setIsDeleting(true);
    try {
      await api.deleteMeeting(id);
      router.push('/');
    } catch (e) {
      alert(String(e));
      setIsDeleting(false);
    }
  }, [id, router]);

  if (loadError) return (
    <div>
      <Link href="/">← Back</Link>
      <p style={{ color: '#dc2626', marginTop: 16 }}>{loadError}</p>
    </div>
  );

  if (!meeting) return (
    <div>
      <Link href="/">← Back</Link>
      <p style={{ color: '#6b7280', marginTop: 16 }}>Loading…</p>
    </div>
  );

  const sectionOrder: string[] = summary?.data?.['_section_order'] as string[] ?? [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link href="/" style={{ color: '#6b7280', fontSize: 14 }}>← Meetings</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>
          {meeting.title || 'Untitled Meeting'}
        </h1>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>

      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>
        {new Date(meeting.created_at).toLocaleString()} · {meeting.transcripts.length} segments
      </p>

      {/* Summary Section */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Summary</h2>
          {(summaryState === 'idle' || summaryState === 'error') && (
            <button
              onClick={handleGenerateSummary}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}
            >
              Generate Summary
            </button>
          )}
          {(summaryState === 'starting' || summaryState === 'processing') && (
            <span style={{ color: '#2563eb', fontSize: 13 }}>
              {summaryState === 'starting' ? 'Starting…' : 'Processing… (refreshes automatically)'}
            </span>
          )}
        </div>

        {summaryError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: 14, color: '#dc2626', fontSize: 14 }}>
            {summaryError}
          </div>
        )}

        {summaryState === 'done' && summary?.data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {sectionOrder.map((key) => {
              const section = summary.data![key] as unknown as { title: string; blocks: { id: string; type: string; content: string; color: string }[] } | undefined;
              if (!section || !section.blocks?.length) return null;
              return (
                <div key={key} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{section.title}</h3>
                  <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {section.blocks.map((b, i) => (
                      <li key={b.id ?? i} style={{ fontSize: 14, color: b.color === 'gray' ? '#9ca3af' : '#374151', lineHeight: 1.5 }}>{b.content}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {summaryState === 'idle' && (
          <p style={{ color: '#9ca3af', fontSize: 14 }}>No summary yet. Click &ldquo;Generate Summary&rdquo; to create one.</p>
        )}
      </section>

      {/* Transcript Section */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>Transcript</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {meeting.transcripts.map((t) => (
            <div key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px' }}>
              <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>{t.timestamp}</p>
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>{t.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
