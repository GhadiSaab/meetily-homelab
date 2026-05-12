"""Backend smoke tests — run with: pytest tests/ -v"""
import pytest
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from fastapi.testclient import TestClient

# Patch DATABASE_PATH before importing main to use in-memory temp db
import tempfile
_tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmp.close()
os.environ['DATABASE_PATH'] = _tmp.name
os.environ.pop('API_SECRET_KEY', None)  # no auth for tests

from main import app  # noqa: E402

client = TestClient(app)


def test_health():
    r = client.get('/health')
    assert r.status_code == 200
    assert r.json() == {'status': 'ok'}


def test_health_bypasses_api_key_middleware():
    """Health must return 200 even when API_SECRET_KEY is set."""
    import main as m
    original = m._API_SECRET_KEY
    m._API_SECRET_KEY = 'supersecret'
    try:
        r = client.get('/health')
        assert r.status_code == 200
    finally:
        m._API_SECRET_KEY = original


def test_get_meetings_empty():
    r = client.get('/get-meetings')
    assert r.status_code == 200
    assert r.json() == []


def test_save_and_get_meeting():
    payload = {
        'meeting_title': 'Test Meeting',
        'transcripts': [
            {'id': 't1', 'text': 'Hello world', 'timestamp': '2026-01-01T00:00:00Z'}
        ]
    }
    r = client.post('/save-transcript', json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data['status'] == 'success'
    meeting_id = data['meeting_id']

    # List includes it
    meetings = client.get('/get-meetings').json()
    assert any(m['id'] == meeting_id for m in meetings)

    # Fetch detail
    detail = client.get(f'/get-meeting/{meeting_id}').json()
    assert detail['id'] == meeting_id
    assert len(detail['transcripts']) == 1
    assert detail['transcripts'][0]['text'] == 'Hello world'


def test_get_meeting_not_found():
    r = client.get('/get-meeting/does-not-exist')
    assert r.status_code == 404


def test_delete_meeting():
    # Create one
    r = client.post('/save-transcript', json={
        'meeting_title': 'To Delete',
        'transcripts': [{'id': 'x1', 'text': 'bye', 'timestamp': '2026-01-01T00:00:00Z'}]
    })
    mid = r.json()['meeting_id']

    # Delete it
    r = client.post('/delete-meeting', json={'meeting_id': mid})
    assert r.status_code == 200

    # Gone
    r = client.get(f'/get-meeting/{mid}')
    assert r.status_code == 404


def test_update_meeting_title():
    r = client.post('/save-transcript', json={
        'meeting_title': 'Original',
        'transcripts': [{'id': 'u1', 'text': 'hi', 'timestamp': '2026-01-01T00:00:00Z'}]
    })
    mid = r.json()['meeting_id']

    r = client.post('/save-meeting-title', json={'meeting_id': mid, 'title': 'Renamed'})
    assert r.status_code == 200

    detail = client.get(f'/get-meeting/{mid}').json()
    assert detail['title'] == 'Renamed'


def test_get_summary_not_found():
    r = client.get('/get-summary/no-such-meeting')
    assert r.status_code == 404


def test_api_key_middleware_rejects():
    import main as m
    original = m._API_SECRET_KEY
    m._API_SECRET_KEY = 'secret123'
    try:
        r = client.get('/get-meetings')
        assert r.status_code == 401

        r = client.get('/get-meetings', headers={'X-API-Key': 'secret123'})
        assert r.status_code == 200
    finally:
        m._API_SECRET_KEY = original


def test_save_model_config():
    r = client.post('/save-model-config', json={
        'provider': 'gemini',
        'model': 'gemini-1.5-flash',
        'whisperModel': 'small',
        'apiKey': 'test-key-123'
    })
    assert r.status_code == 200

    cfg = client.get('/get-model-config').json()
    assert cfg['provider'] == 'gemini'
    assert cfg['model'] == 'gemini-1.5-flash'
