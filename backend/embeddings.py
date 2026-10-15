"""Local embedding model for the AI PDF Chatbot.

Wraps the sentence-transformers model ``all-MiniLM-L6-v2`` (384-dimensional)
behind the interface ChromaDB expects (``EmbeddingFunction``).

Design notes
------------
* The model is loaded **once** into a module-level singleton so Streamlit's
  re-run loop never pays the download/load cost twice.
* The device is chosen automatically: ``cuda`` when available (your RTX 4050),
  otherwise ``cpu``.
* A lock serialises ``encode`` calls because Streamlit can run several browser
  sessions in parallel threads inside one process.
"""

from __future__ import annotations

import threading
from typing import List

import numpy as np
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

# Public model id — downloaded from Hugging Face on first use (~90 MB).
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# ---------------------------------------------------------------------------
# Singleton model cache
# ---------------------------------------------------------------------------
_model = None
_model_lock = threading.Lock()
_encode_lock = threading.Lock()


def pick_device() -> str:
    """Return ``"cuda"`` when a usable GPU is present, else ``"cpu"``."""
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        # torch missing/broken → fall back to CPU rather than crash the app.
        pass
    return "cpu"


def get_model():
    """Load (once) and return the shared ``SentenceTransformer`` instance."""
    global _model
    with _model_lock:
        if _model is None:
            from sentence_transformers import SentenceTransformer

            device = pick_device()
            _model = SentenceTransformer(MODEL_NAME, device=device)
        return _model


class SentenceTransformerEmbeddingFunction(EmbeddingFunction[Documents]):
    """ChromaDB embedding function backed by the local MiniLM model.

    Subclassing ``EmbeddingFunction`` (rather than passing a plain callable)
    matches the official Chroma cookbook and satisfies chromadb 1.x's
    protocol: ``__call__(self, input: Documents) -> Embeddings``.
    """

    def __init__(self, model_name: str = MODEL_NAME) -> None:
        self.model_name = model_name
        # Reuse the process-wide singleton instead of loading a second copy.
        self._model = get_model()

    def __call__(self, input: Documents) -> Embeddings:
        """Embed a list of texts; returns a list of 384-float vectors."""
        texts = [t for t in input if isinstance(t, str)]
        if not texts:
            return []
        with _encode_lock:
            vectors = self._model.encode(
                texts,
                batch_size=64,
                convert_to_numpy=True,
                normalize_embeddings=True,  # cosine-friendly, faster convergence
                show_progress_bar=False,
            )
        vectors = np.atleast_2d(vectors)
        return [v.astype(np.float32).tolist() for v in vectors]

    @staticmethod
    def name() -> str:
        """Identifier Chroma uses when describing the collection."""
        return "sentence-transformers"

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, SentenceTransformerEmbeddingFunction)
            and self.model_name == other.model_name
        )

    def __hash__(self) -> int:
        return hash(("SentenceTransformerEmbeddingFunction", self.model_name))


def get_embedding_function() -> SentenceTransformerEmbeddingFunction:
    """Factory used by the app — loads the model on first call only."""
    return SentenceTransformerEmbeddingFunction()
