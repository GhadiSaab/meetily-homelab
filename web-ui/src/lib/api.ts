// Server-side: talks directly to the backend using internal BACKEND_URL + API_SECRET_KEY.
// Client-side (browser): routes through /api/backend/* proxy so the key never hits the browser.
function baseUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side rendering / server components
    return process.env.BACKEND_URL ?? 'http://localhost:5167';
  }
  // Browser — use the proxy route (same origin, no key exposure)
  return '/api/backend';
}

function authHeaders(): HeadersInit {
  if (typeof window === 'undefined') {
    const key = process.env.API_SECRET_KEY ?? '';
    return key ? { 'Content-Type': 'application/json', 'X-API-Key': key } : { 'Content-Type': 'application/json' };
  }
  return { 'Content-Type': 'application/json' };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface Meeting {
  id: string;
  title: string;
}

export interface Transcript {
  id: string;
  text: string;
  timestamp: string;
  audio_start_time?: number;
  audio_end_time?: number;
  duration?: number;
}

export interface MeetingDetails {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  transcripts: Transcript[];
}

export interface SummarySection {
  title: string;
  blocks: string[];
}

export interface SummaryResponse {
  status: 'processing' | 'completed' | 'error';
  meetingName?: string;
  meeting_id: string;
  data: Record<string, SummarySection | string | string[]> | null;
  error?: string;
}

export interface ModelConfig {
  provider: string;
  model: string;
  whisperModel?: string;
  apiKey?: string;
}

export const api = {
  getMeetings: () => apiFetch<Meeting[]>('/get-meetings'),

  getMeeting: (id: string) => apiFetch<MeetingDetails>(`/get-meeting/${id}`),

  deleteMeeting: (meeting_id: string) =>
    apiFetch<{ message: string }>('/delete-meeting', {
      method: 'POST',
      body: JSON.stringify({ meeting_id }),
    }),

  updateTitle: (meeting_id: string, title: string) =>
    apiFetch<{ message: string }>('/save-meeting-title', {
      method: 'POST',
      body: JSON.stringify({ meeting_id, title }),
    }),

  processTranscript: (meeting_id: string, text: string, model: string, model_name: string) =>
    apiFetch<{ process_id: string }>('/process-transcript', {
      method: 'POST',
      body: JSON.stringify({ meeting_id, text, model, model_name }),
    }),

  getSummary: (meeting_id: string) => apiFetch<SummaryResponse>(`/get-summary/${meeting_id}`),

  getModelConfig: () => apiFetch<ModelConfig>('/get-model-config'),

  saveModelConfig: (cfg: ModelConfig) =>
    apiFetch<{ status: string }>('/save-model-config', {
      method: 'POST',
      body: JSON.stringify({ ...cfg, whisperModel: cfg.whisperModel ?? 'small' }),
    }),

  health: () => apiFetch<{ status: string }>('/health'),
};
