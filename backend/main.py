"""FastAPI backend for the AI PDF Chatbot (RAG).

React Frontend -> FastAPI -> pdf_processor -> embeddings -> ChromaDB
-> OpenRouter.

Run (Windows PowerShell, from project root):
    .\\venv\\Scripts\\python.exe -m uvicorn backend.main:app --port 8000

RAG flow: process_pdf validates + chunks -> MiniLM embeds (CUDA if
available) -> VectorStore keeps {source, page} metadata -> run_rag
retrieves top-k then calls OpenRouter with strict CONTEXT-only prompt.
Secrets stay on this backend; React never sees OPENROUTER_API_KEY.
"""

from __future__ import annotations

import sys
import os
import time
import uuid
from pathlib import Path
from threading import Lock
from typing import Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR.parent / ".env")
load_dotenv()

from pdf_processor import PDFProcessingError, TextChunk, process_pdf  # noqa: E402
from rag_pipeline import RAGError, create_client, generate_chat_suggestions  # noqa: E402
from rag_pipeline import get_api_key, get_model_name, run_rag  # noqa: E402
from vector_store import VectorStore  # noqa: E402

app = FastAPI(title="AI PDF Chatbot API", version="1.0.0")

frontend_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]
frontend_origins.extend(["http://localhost:5173", "http://127.0.0.1:5173"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(frontend_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_store = VectorStore()
_store_lock = Lock()
_started_at = time.time()
documents: Dict[str, Dict] = {}
class HealthResponse(BaseModel):
    status: str = "ok"
    model: str
    documents: int
    chunks: int
    uptime_seconds: int
    cuda_available: bool
    api_key_configured: bool


class DocumentInfo(BaseModel):
    id: str
    filename: str
    pages: int
    chunks: int
    characters: int


class UploadResponse(BaseModel):
    uploaded: List[DocumentInfo]
    failed: List[Dict[str, str]] = Field(default_factory=list)


class SourceCitation(BaseModel):
    filename: str
    page: int
    score: float


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: List[Dict[str, str]] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceCitation] = Field(default_factory=list)
    found: bool


class SuggestionsRequest(BaseModel):
    history: List[Dict[str, str]] = Field(default_factory=list)


class SuggestionsResponse(BaseModel):
    suggestions: List[str] = Field(default_factory=list)


def _cuda_available() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def _safe_history(history: List[Dict[str, str]]) -> List[Dict[str, str]]:
    clean = [
        {"role": m.get("role", ""), "content": m.get("content", "")}
        for m in history
        if isinstance(m, dict)
        and m.get("role") in ("user", "assistant")
        and str(m.get("content", "")).strip()
    ]
    return clean[-6:]
@app.get("/api/health", response_model=HealthResponse)
def health():
    try:
        key_ok = get_api_key() is not None
    except RAGError:
        key_ok = True  # configured-but-invalid; chat explains, health stays 200
    with _store_lock:
        doc_count, chunk_count = len(documents), _store.count
    return HealthResponse(
        status="ok", model=get_model_name(), documents=doc_count,
        chunks=chunk_count, uptime_seconds=int(time.time() - _started_at),
        cuda_available=_cuda_available(), api_key_configured=key_ok,
    )


@app.post("/api/documents/upload", response_model=UploadResponse, status_code=201)
async def upload_documents(files: List[UploadFile] = File(...)):
    """Upload + process PDFs. Partial success returns 201 with `failed` list."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
    uploaded: List[DocumentInfo] = []
    failed: List[Dict[str, str]] = []
    for f in files:
        filename = f.filename or "unnamed.pdf"
        try:
            raw = await f.read()
            if len(raw) > 50 * 1024 * 1024:
                raise PDFProcessingError(f'"{filename}" exceeds 50 MB limit.')
            doc_id = uuid.uuid4().hex[:12]
            stored_name = f"{doc_id}__{filename}"
            pdf, chunks = process_pdf(filename, raw)
            renamed = [TextChunk(text=c.text, source=stored_name,
                                 page=c.page, chunk_index=c.chunk_index)
                       for c in chunks]
            with _store_lock:
                _store.add_chunks(renamed)
                documents[doc_id] = {"id": doc_id, "filename": filename,
                                     "stored_name": stored_name,
                                     "pages": pdf.page_count, "chunks": len(renamed),
                                     "characters": pdf.total_characters}
            uploaded.append(DocumentInfo(id=doc_id, filename=filename,
                                          pages=pdf.page_count, chunks=len(renamed),
                                          characters=pdf.total_characters))
        except PDFProcessingError as exc:
            failed.append({"filename": filename, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001 - server stays alive
            failed.append({"filename": filename, "error": f"Unexpected: {exc}"})
        finally:
            await f.close()
    if not uploaded and failed:
        raise HTTPException(status_code=422, detail={"message": "All files failed.",
                                                     "failed": failed})
    return UploadResponse(uploaded=uploaded, failed=failed)


@app.get("/api/documents", response_model=List[DocumentInfo])
def list_documents():
    with _store_lock:
        return [DocumentInfo(id=d["id"], filename=d["filename"], pages=d["pages"],
                             chunks=d["chunks"], characters=d["characters"])
                for d in documents.values()]


@app.delete("/api/documents/{document_id}", status_code=200)
def delete_document(document_id: str):
    with _store_lock:
        doc = documents.get(document_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found.")
        _store.remove_by_source(doc["stored_name"])
        del documents[document_id]
    return {"status": "deleted", "id": document_id}


@app.delete("/api/documents", status_code=200)
def clear_documents():
    """Remove ALL docs + index (old Streamlit Clear button)."""
    with _store_lock:
        _store.reset()
        documents.clear()
    return {"status": "cleared"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question must not be empty.")
    with _store_lock:
        if _store.count == 0:
            raise HTTPException(status_code=400,
                                detail="No documents indexed - upload a PDF first.")
        name_map = {d["stored_name"]: d["filename"] for d in documents.values()}
    try:
        client = create_client()
    except RAGError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    try:
        result = run_rag(question=question, vector_store=_store,
                         chat_history=_safe_history(req.history), client=client)
        sources = [SourceCitation(filename=name_map.get(s.filename, s.filename),
                                   page=s.page, score=s.score)
                   for s in result.sources]
        return ChatResponse(answer=result.answer, sources=sources, found=result.found)
    except RAGError as exc:
        msg = str(exc)
        # Specific OpenRouter codes first (a 402/404/429 message must never
        # be swallowed by the generic "API key" check below; 429 is checked
        # before 402 because rate-limit bodies can mention credits).
        if "429" in msg or "rate limit" in msg.lower():
            raise HTTPException(status_code=429, detail=msg)
        if "402" in msg or "insufficient credit" in msg.lower():
            # Out of credits. 402 preserves the meaning for the React toast
            # without leaking anything secret.
            raise HTTPException(status_code=402, detail=msg)
        if "404" in msg or "OPENROUTER_MODEL" in msg:
            # Unknown/retired model route -> 404 with the fix in the message.
            raise HTTPException(status_code=404, detail=msg)
        if "403" in msg or "permission denied" in msg.lower():
            raise HTTPException(status_code=403, detail=msg)
        if "401" in msg or "API key" in msg:
            raise HTTPException(status_code=401, detail=msg)
        if "Could not reach" in msg:
            raise HTTPException(status_code=502, detail=msg)
        raise HTTPException(status_code=500, detail=msg)


@app.post("/api/chat/suggestions", response_model=SuggestionsResponse)
def chat_suggestions(req: SuggestionsRequest):
    """Return fresh question suggestions grounded in currently indexed PDFs."""
    safe_history = _safe_history(req.history)
    with _store_lock:
        if _store.count == 0:
            return SuggestionsResponse(suggestions=[])
    try:
        suggestions = generate_chat_suggestions(
            vector_store=_store,
            chat_history=safe_history,
            client=create_client(),
        )
        return SuggestionsResponse(suggestions=suggestions)
    except RAGError as exc:
        msg = str(exc)
        if "429" in msg or "rate limit" in msg.lower():
            raise HTTPException(status_code=429, detail=msg)
        if "402" in msg or "insufficient credit" in msg.lower():
            raise HTTPException(status_code=402, detail=msg)
        if "404" in msg or "OPENROUTER_MODEL" in msg:
            raise HTTPException(status_code=404, detail=msg)
        if "403" in msg or "permission denied" in msg.lower():
            raise HTTPException(status_code=403, detail=msg)
        if "401" in msg or "API key" in msg:
            raise HTTPException(status_code=401, detail=msg)
        raise HTTPException(status_code=502, detail=msg)


@app.delete("/api/chat/history", status_code=200)
def clear_history():
    """History lives in React state; endpoint kept for API symmetry."""
    return {"status": "cleared"}
