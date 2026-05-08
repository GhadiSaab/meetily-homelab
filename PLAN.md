# Meetily Homelab Fork — Project Plan

## What This Is

A fork of [Meetily](https://github.com/Zackriya-Solutions/meetily) adapted for a personal homelab setup.
The goal: record work meetings on a Windows PC (Teams desktop app), transcribe via an existing
self-hosted Whisper API at work or Groq, send only the text transcript to a self-hosted homelab
backend, and access summaries + Q&A on demand via a web UI hosted on the homelab.

---

## Architecture

```
Work PC (Windows — Tauri desktop app)
  ├── Captures mic + system audio (both sides of the meeting)
  ├── Sends audio to transcription API (self-hosted Whisper at work OR Groq)
  ├── Receives transcript text back
  ├── Audio deleted locally after transcription
  └── POSTs transcript (text only, ~50KB) to homelab via HTTPS

Homelab (k3s + Traefik reverse proxy)
  └── FastAPI backend
        ├── Receives and stores transcripts (SQLite)
        ├── On demand: Gemini API for summaries, action items, Q&A
        └── Web UI to browse meetings and trigger analysis
```

**Key properties:**
- Audio never leaves the work network (goes to work's Whisper API only)
- Only plain text crosses to the homelab
- Homelab endpoint is public-facing via Traefik, protected by a secret API key header
- No Tailscale needed on work laptop
- No local GPU/Whisper model required on the work PC

---

## What Changes vs Upstream Meetily

### Tauri Client (Windows desktop app)

| Change | File(s) | Detail |
|--------|---------|--------|
| Remove local Whisper engine | `src-tauri/src/whisper_engine/` | Delete whisper-rs local inference entirely |
| Remove Whisper model download UI | `src/components/WhisperModelManager.tsx` | No longer needed |
| Remove Parakeet, Deepgram, ElevenLabs providers | `src-tauri/src/audio/transcription/` | Keep only Groq + custom OpenAI-compatible |
| Add "Self-hosted Whisper" transcription option | `src/components/TranscriptSettings.tsx` | URL + API key fields for work's Whisper instance |
| Make backend URL configurable | `src-tauri/src/api/api.rs` line 20 | Replace hardcoded `localhost:5167` with value from settings |
| Add secret API key header on all homelab requests | `src-tauri/src/api/api.rs` | Send `X-API-Key: <secret>` header |
| Update CSP whitelist | `src-tauri/tauri.conf.json` | Replace localhost entries with homelab domain |
| Update auto-updater URL | `src-tauri/tauri.conf.json` lines 114-119 | Point to this fork's GitHub releases |
| Delete audio locally after transcription | transcription flow | Add cleanup after successful transcript POST |

### Backend (homelab — FastAPI + Docker)

| Change | File(s) | Detail |
|--------|---------|--------|
| Remove local Whisper server | `docker-compose.yml` | Delete whisper-server service entirely |
| Remove Ollama service | `docker-compose.yml` | Delete ollama service |
| Remove Ollama/local LLM code | `app/transcript_processor.py` lines 120, 235-287 | Remove `chat_ollama_model()` and Ollama provider |
| Add Gemini as summary provider | `app/transcript_processor.py` + `app/db.py` | Add Gemini API client alongside existing Groq/Claude |
| Add API key authentication middleware | `app/main.py` | Validate `X-API-Key` header on all endpoints, reject otherwise |
| Open CORS only to known origins | `app/main.py` lines 44-50 | Replace `allow_origins=["*"]` with homelab domain + Tauri origin |
| Add audio deletion endpoint/logic | backend | Ensure audio blobs are deleted immediately after transcription |

### What Stays Untouched

- Audio capture engine (WASAPI, mic + system audio mix) — the hard part, don't touch
- VAD (voice activity detection) filtering
- Speaker diarization
- SQLite database schema
- Tauri Windows build/packaging pipeline (`.msi` / `.exe` release)
- React/Next.js UI structure (just remove Whisper model management sections)

---

## Transcription Provider Settings (new UI)

The settings screen will offer two transcription options:

```
Transcription Provider
  ○ Groq          [API Key: ____________]
  ○ Self-hosted   [URL: ________________]  [API Key: ____________]
```

Both use the OpenAI-compatible `/v1/audio/transcriptions` endpoint format.
The self-hosted option is for the existing Whisper instance available on the work network.

---

## Summary Provider

Gemini API added as the primary summary/Q&A provider on the homelab backend.
Existing Claude/Groq summary providers kept as fallback options.

Settings on homelab backend (env vars):
```
GEMINI_API_KEY=...
API_SECRET_KEY=...          # secret the Tauri client must send
DATABASE_PATH=/data/meetings.db
```

---

## Deployment on Homelab (k3s)

Backend deployed as a Kubernetes workload in the existing GitOps repo (`gitops-homelab/`):
- Namespace: `meetily`
- Traefik IngressRoute with HTTPS
- Sealed secret for `GEMINI_API_KEY` and `API_SECRET_KEY`
- PVC for SQLite database persistence
- Follows same pattern as existing apps (immich, influxdb, etc.)

---

## Build & Release

Tauri already builds a Windows `.msi` installer via PowerShell scripts (`build.ps1`).
After changes, build locally or via GitHub Actions and distribute the `.msi` for installation
on the work PC.

Auto-updater will point to this fork's GitHub releases:
`https://github.com/GhadiSaab/meetily-homelab/releases/latest/download/latest.json`

---

## Progress

### Done ✅

**Backend (5 commits)**
- `docker-compose.yml` — stripped to single `meetily-backend` service; removed whisper-server, ollama, model-downloader, web-ui
- `transcript_processor.py` — removed all Ollama code; added Gemini via pydantic-ai `GeminiModel`/`GoogleProvider`
- `main.py` — `X-API-Key` middleware (rejects unauthorized requests); added gemini to provider check
- `requirements.txt` — replaced `ollama` with `google-generativeai`
- `temp.env` — documents `API_SECRET_KEY`, `GEMINI_API_KEY`, and other required vars

**Frontend — Tauri client**
- `api.rs` — `get_server_address()` reads from Tauri store key `serverAddress` (fallback: localhost:5167); new `get_api_secret_key()` adds `X-API-Key` header to every homelab request
- `SidebarProvider.tsx` — reads `serverAddress` from Tauri store on init; removed hardcoded whisper server URL
- `tauri.conf.json` — CSP updated to allow `https:`; auto-updater pointed to `GhadiSaab/meetily-homelab` releases

**Frontend — Settings UI**
- `HomelabSettings.tsx` — new settings tab: server URL input, API secret key (show/hide), Save + Test Connection buttons; reads/writes `serverAddress` and `apiSecretKey` from Tauri `store.json`
- `settings/page.tsx` — Homelab tab added as default first tab

**Frontend — Transcription providers**
- `api_provider.rs` — new `ApiTranscriptionProvider`: encodes audio Vec<f32> → WAV in-memory, POSTs to any OpenAI-compatible `/audio/transcriptions` endpoint
- `engine.rs` — Groq and selfHostedWhisper skip local model validation; initialize `ApiTranscriptionProvider` with correct endpoint/key; selfHostedWhisper reads URL from store key `whisperEndpoint`
- `setting.rs` — `selfHostedWhisper` maps to `whisperApiKey` column
- `TranscriptSettings.tsx` — only Groq and Self-hosted Whisper options; URL field for self-hosted; Save button persists config and endpoint to store

---

## Still To Do ⏳

### Tauri client cleanup
- [ ] Remove local Whisper engine entirely (`src-tauri/src/whisper_engine/`) — heavy Rust code no longer needed
- [ ] Remove `WhisperModelManager.tsx` and `ParakeetModelManager.tsx` components
- [ ] Remove Parakeet engine (`src-tauri/src/parakeet_engine/`) — no longer needed

### k3s Deployment (waiting on instructions from user)
- [ ] Create `meetily/` namespace manifest in `gitops-homelab/`
- [ ] Deployment + Service for `meetily-backend`
- [ ] Traefik `IngressRoute` with HTTPS for backend
- [ ] SealedSecret for `API_SECRET_KEY` and `GEMINI_API_KEY`
- [ ] PVC for SQLite database persistence
- [ ] Kustomization wired into the GitOps root

### Build & Release
- [ ] Set up GitHub Actions workflow to build Windows `.msi` on push to `main`
- [ ] Test end-to-end: work PC → transcription API → homelab → Gemini summary → web UI
- [ ] Distribute `.msi` to work PC

### Nice-to-have (future)
- [ ] SummaryModelSettings.tsx — expose Gemini as the summary provider option in the UI (currently backend-only config)
- [ ] Web UI for browsing meetings accessible from any device via Traefik (currently only the Tauri app can browse)
- [ ] Auto-delete audio on the work PC after successful transcript POST (currently manual)
