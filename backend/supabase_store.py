"""Small Supabase pgvector adapter for Vercel's stateless Python functions."""
from __future__ import annotations

import os
from typing import Dict, List

import httpx
from pdf_processor import TextChunk


class SupabaseVectorStore:
    def __init__(self, session_id: str):
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        self.key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.session_id = session_id
        self.headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}",
                        "Content-Type": "application/json", "Prefer": "return=representation"}

    def _request(self, method: str, path: str, **kwargs):
        try:
            response = httpx.request(method, f"{self.url}/rest/v1/{path}", headers=self.headers,
                                     timeout=25, **kwargs)
            response.raise_for_status()
            return response.json() if response.content else []
        except Exception as exc:
            raise RuntimeError(f"Supabase request failed: {exc}") from exc

    def _embed(self, texts: List[str]) -> List[List[float]]:
        from rag_pipeline import get_api_key, RAGError
        key = get_api_key()
        if not key:
            raise RAGError("OpenRouter API key is missing.")
        try:
            r = httpx.post("https://openrouter.ai/api/v1/embeddings",
                           headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                           json={"model": os.getenv("OPENROUTER_EMBEDDING_MODEL", "openai/text-embedding-3-small"), "input": texts}, timeout=60)
            r.raise_for_status()
            return [row["embedding"] for row in sorted(r.json()["data"], key=lambda x: x["index"])]
        except Exception as exc:
            raise RuntimeError(f"Could not create document embeddings: {exc}") from exc

    def list_documents(self):
        return self._request("GET", "documents", params={"session_id": f"eq.{self.session_id}", "select": "id,filename,pages,chunks,characters,stored_name", "order": "created_at.asc"})

    @property
    def count(self):
        rows = self._request("GET", "pdf_chunks", params={"session_id": f"eq.{self.session_id}", "select": "id"})
        return len(rows)

    def insert_document(self, doc):
        return self._request("POST", "documents", json={**doc, "session_id": self.session_id})[0]

    def add_chunks(self, document_id: str, chunks: List[TextChunk]):
        total = 0
        for start in range(0, len(chunks), 32):
            batch = chunks[start:start + 32]
            vectors = self._embed([c.text for c in batch])
            rows = [{"session_id": self.session_id, "document_id": document_id, "content": c.text,
                     "source": c.source, "page": c.page, "chunk_index": c.chunk_index,
                     "embedding": v} for c, v in zip(batch, vectors)]
            self._request("POST", "pdf_chunks", json=rows)
            total += len(rows)
        return total

    def similarity_search(self, query: str, k: int = 4):
        if not query.strip(): return []
        vector = self._embed([query])[0]
        return self._request("POST", "rpc/match_pdf_chunks", json={"query_embedding": vector,
            "filter_session_id": self.session_id, "match_count": k})

    def delete_document(self, document_id: str):
        self._request("DELETE", "documents", params={"id": f"eq.{document_id}", "session_id": f"eq.{self.session_id}"})

    def reset(self):
        self._request("DELETE", "documents", params={"session_id": f"eq.{self.session_id}"})
