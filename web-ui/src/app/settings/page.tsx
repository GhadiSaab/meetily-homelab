'use client';

import { useEffect, useState } from 'react';
import { api, ModelConfig } from '@/lib/api';
import Link from 'next/link';

const PROVIDERS = ['gemini', 'claude', 'groq', 'openai'] as const;

export default function SettingsPage() {
  const [config, setConfig] = useState<ModelConfig>({ provider: 'gemini', model: 'gemini-1.5-flash', apiKey: '' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getModelConfig()
      .then((c) => setConfig({ ...c, apiKey: c.apiKey ?? '' }))
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.saveModelConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    }
  };

  const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 };
  const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/" style={{ color: '#6b7280', fontSize: 14 }}>← Back</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Settings</h1>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, maxWidth: 480 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Summary Model</h2>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={label}>Provider</label>
            <select
              value={config.provider}
              onChange={(e) => setConfig((c) => ({ ...c, provider: e.target.value }))}
              style={input}
            >
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label style={label}>Model name</label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
              style={input}
              placeholder="e.g. gemini-1.5-flash"
            />
          </div>

          <div>
            <label style={label}>API Key</label>
            <input
              type="password"
              value={config.apiKey ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
              style={input}
              placeholder="sk-…"
            />
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              Stored in the backend database. You can also set GEMINI_API_KEY env var on the backend instead.
            </p>
          </div>

          {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}

          <button
            type="submit"
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 500, alignSelf: 'flex-start' }}
          >
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
