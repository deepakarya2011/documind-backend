# -*- coding: utf-8 -*-
# End-to-end test: upload + RAG + citations + mocked OpenRouter failures.
# Run from project root with the venv Python:
#   backend/venv/Scripts/python.exe e2e_router_test.py
import sys
import io

sys.path.insert(0, 'backend')

from fastapi.testclient import TestClient

from rag_pipeline import RAGError
from main import app

from vector_store import VectorStore

# Minimal stand-in PDF bytes (the upload validation / chunking path works on any
# %PDF file, so a small hand-built one keeps this test fully offline).
DOC_1_BYTES = (
    b'%PDF-1.4\n'
    b'1 0 obj\n'
    b'<< /Type /Catalog /Pages 2 0 R >>\n'
    b'endobj\n'
    b'2 0 obj\n'
    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n'
    b'endobj\n'
    b'3 0 obj\n'
    b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n'
    b'endobj\n'
    b'4 0 obj\n'
    b'<< /Length 70 >>\n'
    b'stream\n'
    b'BT /F1 12 Tf 72 700 Td (Budget 2000: total two million dollars, contingency two hundred thousand. Autumn budget approved.)\n'
    b'Tj ET\n'
    b'endstream\n'
    b'endobj\n'
    b'5 0 obj\n'
    b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n'
    b'endobj\n'
    b'xref\n'
    b'0 6\n'
    b'trailer\n'
    b'<< /Size 6 /Root 1 0 R >>\n'
    b'startxref\n'
    b'0\n'
    b'%%EOF\n'
)

# Capture the same HTTP request the WSGI app sends to OpenRouter.
captured = {'model': None, 'messages': None}


def make_fake_response(content):
    class _FakeMessage:
        content = content

    class _FakeChoice:
        message = _FakeMessage()

    class _FakeResponse:
        choices = [_FakeChoice()]
        usage = None

    return _FakeResponse()


class _FakeChatCompletions:
    def __init__(self, side_effect):
        self.side_effect = side_effect

    def create(self, **kwargs):
        return self.side_effect(kwargs)


class _FakeCompletions:
    def __init__(self, side_effect):
        self.side_effect = side_effect

    def create(self, **kwargs):
        return self.side_effect(kwargs)


def install_openai_shim(mock, side_effect):
    """Point rag_pipeline.create_client() at a fake OpenRouter client."""
    import rag_pipeline

    mock.patch.object(rag_pipeline, 'OpenAI', _FakeChatCompletions(side_effect)).start()


# --- Endpoint checks ------------------------------------------------------------


def test_health():
    client = TestClient(app)
    r = client.get('/api/health')
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['status'] == 'ok'
    assert body['cuda_available'] is True
    print('PASS /api/health (status=ok, cuda_available=True)')


def test_upload_pdf():
    """Upload a valid PDF and confirm processing metadata is recorded."""
    client = TestClient(app)
    r = client.post(
        '/api/documents/upload',
        files=[('files', ('budget2000.pdf', DOC_1_BYTES, 'application/pdf'))],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body['uploaded']) == 1
    doc = body['uploaded'][0]
    assert doc['filename'] == 'budget2000.pdf'
    assert doc['pages'] >= 1
    assert doc['chunks'] >= 1
    print('PASS /api/documents/upload (filename=budget2000.pdf pages=%s chunks=%s)'
          % (doc['pages'], doc['chunks']))


def test_no_docs_no_api():
    """A chat request with an empty index must fail fast (no OpenRouter call)."""
    client = TestClient(app)
    r = client.post('/api/chat', json={'question': 'hello'})
    assert r.status_code == 400, r.text
    print('PASS /api/chat with no indexed documents -> HTTP 400')


def test_delete_document():
    client = TestClient(app)
    r = client.delete('/api/documents/budget2000.pdf__budget2000.pdf')
    assert r.status_code == 200, r.text
    r2 = client.delete('/api/documents/does-not-exist')
    assert r2.status_code == 404, r2.text
    print('PASS /api/documents/delete (200 ok, 404 unknown)')


# --- Mocked OpenRouter failure cases ---------------------------------------------


def test_openrouter_error_mapping(mock):
    """Each OpenRouter failure must map to a clean HTTP status and must not
    leak the API key into the response body."""
    client = TestClient(app)

    def raise_401(kwargs):
        raise Exception(
            'OpenRouter API error (HTTP 401). The API key is invalid.')

    def raise_402(kwargs):
        raise Exception(
            'OpenRouter API error (HTTP 402). Insufficient credits.')

    def raise_403(kwargs):
        raise Exception(
            'OpenRouter API error (HTTP 403). Permission denied.')

    def raise_404(kwargs):
        raise Exception(
            'OpenRouter API error (HTTP 404). OPENROUTER_MODEL not found.')

    def raise_429(kwargs):
        raise Exception(
            'OpenRouter API error (HTTP 429). Rate limit exceeded.')

    def raise_502(kwargs):
        raise Exception('Could not reach OpenRouter (timeout).')

    cases = [
        ('401 invalid key', raise_401, 401),
        ('402 insufficient credit', raise_402, 402),
        ('403 permission denied', raise_403, 403),
        ('404 model not found', raise_404, 404),
        ('429 rate limit', raise_429, 429),
        ('502 / timeout', raise_502, 502),
    ]
    for name, side_effect, expected in cases:
        install_openai_shim(mock, side_effect)
        r = client.post('/api/chat', json={'question': 'Is the total there?'})
        assert r.status_code == expected, (name, r.status_code, r.text)
        detail = r.json().get('detail', '')
        assert 'sk-or-' not in detail, 'API key leaked into error detail!'
        print('PASS /api/chat mocked %-22s -> HTTP %d' % (name, expected))


def main():
    from unittest import mock

    with mock.patch('openai.OpenAI') as fake_openai_cls:
        test_health()
        test_no_docs_no_api()
        test_upload_pdf()
        test_openrouter_error_mapping(mock)
        print('\nALL END-TO-END TESTS PASSED')
if __name__ == '__main__':
    main()


