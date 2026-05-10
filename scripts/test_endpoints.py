#!/usr/bin/env python3
"""
Endpoint smoke-test for meetily-homelab.
Tests the exact HTTP calls the Tauri app makes, without needing the app running.

Usage:
    pip install requests
    python scripts/test_endpoints.py

Environment variables (or edit the CONFIG block below):
    MEETILY_SERVER_URL   e.g. https://meetily.gsaab.dev:16384
    MEETILY_API_SECRET   the X-API-Key secret stored in the cluster
    GROQ_API_KEY         your Groq API key (starts with gsk_)
"""

import os
import sys
import struct
import math
import json
import requests

# ── CONFIG ────────────────────────────────────────────────────────────────────
SERVER_URL  = os.getenv("MEETILY_SERVER_URL",  "https://meetily.gsaab.dev:16384")
API_SECRET  = os.getenv("MEETILY_API_SECRET",  "")   # X-API-Key header
GROQ_KEY    = os.getenv("GROQ_API_KEY",         "")   # fetched from env or set manually

GROQ_TRANSCRIPTION_URL  = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo"

GEMINI_CHAT_URL   = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
GEMINI_MODEL_NAME = "models/gemma-4-31b-it"
# ──────────────────────────────────────────────────────────────────────────────

PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"
SKIP = "\033[93m- SKIP\033[0m"


def header(title: str):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print('─' * 60)


def _make_sine_wav(duration_s: float = 0.5, sample_rate: int = 16000) -> bytes:
    """Generate a minimal valid WAV file with a 440 Hz sine wave."""
    n_samples = int(sample_rate * duration_s)
    pcm = [int(32767 * math.sin(2 * math.pi * 440 * i / sample_rate)) for i in range(n_samples)]
    data = struct.pack(f"<{n_samples}h", *pcm)
    data_len = len(data)
    wav = b"RIFF"
    wav += struct.pack("<I", 36 + data_len)
    wav += b"WAVE"
    wav += b"fmt "
    wav += struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16)
    wav += b"data"
    wav += struct.pack("<I", data_len)
    wav += data
    return wav


# ── TEST 1: Homelab health check ──────────────────────────────────────────────
def test_homelab_health():
    header("TEST 1 — Homelab health  GET /health")
    url = f"{SERVER_URL}/health"
    try:
        r = requests.get(url, headers={"X-API-Key": API_SECRET}, timeout=10)
        print(f"  Status : {r.status_code}")
        print(f"  Body   : {r.text[:200]}")
        if r.status_code < 500:
            print(f"  Result : {PASS}")
            return True
        print(f"  Result : {FAIL}")
        return False
    except Exception as e:
        print(f"  Error  : {e}")
        print(f"  Result : {FAIL}")
        return False


# ── TEST 2: Fetch Gemini key from homelab ─────────────────────────────────────
def test_fetch_gemini_key() -> str | None:
    header("TEST 2 — Fetch Gemini key  GET /api/gemini-key")
    if not API_SECRET:
        print(f"  {SKIP}  MEETILY_API_SECRET not set")
        return None
    url = f"{SERVER_URL}/api/gemini-key"
    try:
        r = requests.get(url, headers={"X-API-Key": API_SECRET}, timeout=10)
        print(f"  Status : {r.status_code}")
        if r.status_code == 200:
            key = r.json().get("api_key", "")
            masked = key[:8] + "..." if len(key) > 8 else "(empty)"
            print(f"  Key    : {masked}")
            print(f"  Result : {PASS}")
            return key
        print(f"  Body   : {r.text[:200]}")
        print(f"  Result : {FAIL}")
        return None
    except Exception as e:
        print(f"  Error  : {e}")
        print(f"  Result : {FAIL}")
        return None


# ── TEST 3: Groq transcription ────────────────────────────────────────────────
def test_groq_transcription():
    header(f"TEST 3 — Groq transcription  POST {GROQ_TRANSCRIPTION_URL}")
    key = GROQ_KEY
    if not key:
        print(f"  {SKIP}  GROQ_API_KEY not set")
        return False
    wav = _make_sine_wav(duration_s=0.5)
    print(f"  WAV    : {len(wav)} bytes (0.5 s sine wave @ 16 kHz)")
    try:
        r = requests.post(
            GROQ_TRANSCRIPTION_URL,
            headers={"Authorization": f"Bearer {key}"},
            files={"file": ("audio.wav", wav, "audio/wav")},
            data={"model": GROQ_TRANSCRIPTION_MODEL},
            timeout=30,
        )
        print(f"  Status : {r.status_code}")
        if r.status_code == 200:
            text = r.json().get("text", "")
            print(f"  Text   : '{text}' (expected empty/silence)")
            print(f"  Result : {PASS}")
            return True
        print(f"  Body   : {r.text[:300]}")
        print(f"  Result : {FAIL}")
        return False
    except Exception as e:
        print(f"  Error  : {e}")
        print(f"  Result : {FAIL}")
        return False


# ── TEST 4: Gemini chat completion ────────────────────────────────────────────
def test_gemini_chat(gemini_key: str | None):
    header(f"TEST 4 — Gemini chat  POST {GEMINI_CHAT_URL}")
    key = gemini_key or os.getenv("GEMINI_API_KEY", "")
    if not key:
        print(f"  {SKIP}  No Gemini key available (run test 2 first or set GEMINI_API_KEY)")
        return False
    payload = {
        "model": GEMINI_MODEL_NAME,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user",   "content": "Reply with exactly: OK"},
        ],
        "max_tokens": 10,
    }
    try:
        r = requests.post(
            GEMINI_CHAT_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
        print(f"  Status : {r.status_code}")
        if r.status_code == 200:
            reply = r.json()["choices"][0]["message"]["content"].strip()
            print(f"  Reply  : '{reply}'")
            print(f"  Result : {PASS}")
            return True
        print(f"  Body   : {r.text[:300]}")
        print(f"  Result : {FAIL}")
        return False
    except Exception as e:
        print(f"  Error  : {e}")
        print(f"  Result : {FAIL}")
        return False


# ── TEST 5: Full summary flow simulation ──────────────────────────────────────
def test_summary_flow(gemini_key: str | None):
    header("TEST 5 — Full summary flow (transcript → Gemini)")
    key = gemini_key or os.getenv("GEMINI_API_KEY", "")
    if not key:
        print(f"  {SKIP}  No Gemini key available")
        return False

    sample_transcript = (
        "Alice: Good morning everyone. Let's review Q2 targets. "
        "Bob: Sales are up 12% from last quarter. "
        "Alice: Great. Action item: Bob to send the full report by Friday. "
        "Bob: Understood."
    )
    system_prompt = (
        "You are a meeting assistant. Summarize the following transcript "
        "into bullet points covering: key decisions, action items, and next steps."
    )
    payload = {
        "model": GEMINI_MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": sample_transcript},
        ],
        "max_tokens": 300,
    }
    try:
        r = requests.post(
            GEMINI_CHAT_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
        print(f"  Status : {r.status_code}")
        if r.status_code == 200:
            reply = r.json()["choices"][0]["message"]["content"].strip()
            print(f"  Summary:\n")
            for line in reply.splitlines():
                print(f"    {line}")
            print(f"\n  Result : {PASS}")
            return True
        print(f"  Body   : {r.text[:400]}")
        print(f"  Result : {FAIL}")
        return False
    except Exception as e:
        print(f"  Error  : {e}")
        print(f"  Result : {FAIL}")
        return False


# ── MAIN ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║          meetily-homelab endpoint smoke-test             ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print(f"\n  Server  : {SERVER_URL}")
    print(f"  Secret  : {'set' if API_SECRET else 'NOT SET — export MEETILY_API_SECRET'}")
    print(f"  Groq    : {'set' if GROQ_KEY else 'NOT SET — export GROQ_API_KEY'}")

    results = {}
    results["homelab_health"]    = test_homelab_health()
    gemini_key                   = test_fetch_gemini_key()
    results["fetch_gemini_key"]  = gemini_key is not None
    results["groq_transcription"]= test_groq_transcription()
    results["gemini_chat"]       = test_gemini_chat(gemini_key)
    results["summary_flow"]      = test_summary_flow(gemini_key)

    header("SUMMARY")
    passed = sum(1 for v in results.values() if v)
    total  = len(results)
    for name, ok in results.items():
        icon = PASS if ok else (SKIP if ok is None else FAIL)
        print(f"  {icon}  {name}")
    print(f"\n  {passed}/{total} tests passed\n")
    sys.exit(0 if passed == total else 1)
