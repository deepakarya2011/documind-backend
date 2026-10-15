"""ChromaDB vector store for the AI PDF Chatbot.

Responsibilities
----------------
* Own a **per-session** in-memory (ephemeral) ChromaDB collection — nothing is
  written to disk, so "Clear chat" and browser tabs stay fully independent.
* Add extracted :class:`pdf_processor.TextChunk` objects with their
  ``source`` (filename) and ``page`` metadata intact.
* Answer similarity queries and return plain dicts that the RAG pipeline
  turns into citations.

Chroma computes distances with the **cosine** metric (configured at collection
creation). We expose ``score = 1 - distance`` so higher is better (0..1).
"""

from __future__ import annotations

import uuid
from typing import Dict, List, Optional

import chromadb

from embeddings import SentenceTransformerEmbeddingFunction, get_embedding_function
from pdf_processor import TextChunk

# Chroma identifiers may only contain [a-zA-Z0-9._-] and be 3-63 chars.
COLLECTION_NAME = "pdf_chunks"
# Chroma's default max batch size is 5461; stay well below it.
ADD_BATCH_SIZE = 500


class VectorStore:
    """Thin, beginner-friendly wrapper around one ChromaDB collection."""

    def __init__(
        self,
        embedding_function: Optional[SentenceTransformerEmbeddingFunction] = None,
    ) -> None:
        # anonymized_telemetry=False → no usage data leaves the machine.
        self._client = chromadb.EphemeralClient(
            chromadb.Settings(anonymized_telemetry=False)
        )
        # Reuse the app-wide model singleton (loads MiniLM only once).
        self._embedding_function = embedding_function or get_embedding_function()
        # Unique per-instance name: chromadb's EphemeralClient shares one
        # process-wide system, so a fixed name would leak chunks between
        # browser sessions (and between tests).
        self._collection_name = f"{COLLECTION_NAME}_{uuid.uuid4().hex[:12]}"
        self._collection = self._get_or_create_collection()

    def _get_or_create_collection(self):
        return self._client.get_or_create_collection(
            name=self._collection_name,
            embedding_function=self._embedding_function,
            metadata={"hnsw:space": "cosine"},  # similarity search with cosine
        )

    # -------------------------------------------------------------------------
    # Writes
    # -------------------------------------------------------------------------
    def add_chunks(self, chunks: List[TextChunk]) -> int:
        """Persist chunks (text + source + page) into the collection.

        Returns:
            The number of chunks stored.
        """
        if not chunks:
            return 0

        # Fixed-size batches keep memory flat for very large PDFs.
        for start in range(0, len(chunks), ADD_BATCH_SIZE):
            batch = chunks[start : start + ADD_BATCH_SIZE]
            self._collection.upsert(
                # Deterministic IDs ⇒ re-processing the same file replaces old
                # chunks instead of duplicating them.
                ids=[f"{c.source}:{c.page}:{c.chunk_index}" for c in batch],
                documents=[c.text for c in batch],
                metadatas=[
                    {"source": c.source, "page": c.page, "chunk_index": c.chunk_index}
                    for c in batch
                ],
            )
        return len(chunks)

    # -------------------------------------------------------------------------
    # Reads
    # -------------------------------------------------------------------------
    @property
    def count(self) -> int:
        """Number of chunks currently indexed."""
        return self._collection.count()

    def similarity_search(self, query: str, k: int = 4) -> List[Dict]:
        """Return the ``k`` most relevant chunks for ``query``.

        Each result::

            {"text": str, "source": str, "page": int, "score": float}

        ``score`` is cosine similarity (1 = identical, higher is better).
        """
        if not query.strip() or self.count == 0:
            return []

        # Chroma warns if n_results > number of stored items, so clamp it.
        n_results = max(1, min(k, self.count))
        raw = self._collection.query(
            query_texts=[query],
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )

        results: List[Dict] = []
        documents = raw.get("documents") or [[]]
        metadatas = raw.get("metadatas") or [[]]
        distances = raw.get("distances") or [[]]
        for doc, meta, distance in zip(documents[0], metadatas[0], distances[0]):
            meta = meta or {}
            results.append(
                {
                    "text": doc,
                    "source": str(meta.get("source", "unknown")),
                    "page": int(meta.get("page", 0)),
                    "score": round(1.0 - float(distance), 4),
                }
            )
        return results

    # -------------------------------------------------------------------------
    # Maintenance
    # -------------------------------------------------------------------------
    def remove_by_source(self, source: str) -> int:
        """Delete every chunk whose metadata ``source`` equals ``source``.

        Used by ``DELETE /api/documents/{id}`` so removing one PDF never
        touches the others. Returns the number of chunks removed.
        """
        existing = self._collection.get(where={"source": source})
        ids = existing.get("ids") or []
        if ids:
            self._collection.delete(ids=list(ids))
        return len(ids)

    def reset(self) -> None:
        """Delete and recreate the collection (used by the Clear button)."""
        try:
            self._client.delete_collection(self._collection_name)
        except Exception:
            # Collection may not exist yet — recreating below is enough.
            pass
        self._collection = self._get_or_create_collection()
