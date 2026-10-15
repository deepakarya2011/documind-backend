"""FastAPI adapter using durable Supabase storage on Vercel."""
from __future__ import annotations
import os, time, uuid
from pathlib import Path
from typing import Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent
load_dotenv(BASE.parent / ".env")
import sys
sys.path.insert(0, str(BASE))
from pdf_processor import PDFProcessingError, TextChunk, process_pdf
from rag_pipeline import RAGError, create_client, generate_chat_suggestions, get_model_name, run_rag
from supabase_store import SupabaseVectorStore

app = FastAPI(title="DocuMind API", version="1.0.0")
started = time.time()
class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: List[Dict[str, str]] = Field(default_factory=list)
class SuggestionsRequest(BaseModel):
    history: List[Dict[str, str]] = Field(default_factory=list)
class Citation(BaseModel):
    filename: str
    page: int
    score: float
class ChatResponse(BaseModel):
    answer: str
    sources: List[Citation] = Field(default_factory=list)
    found: bool

def store_for(session_id: str | None):
    if not session_id:
        raise HTTPException(400, "Missing session ID. Refresh the app and try again.")
    try: return SupabaseVectorStore(str(uuid.UUID(session_id)))
    except KeyError as exc: raise HTTPException(503, f"Server configuration is missing {exc.args[0]}.")
    except ValueError: raise HTTPException(400, "Invalid session ID.")

def map_rag_error(exc):
    msg = str(exc)
    for code, markers in ((429, ("429", "rate limit")), (402, ("402", "insufficient credit")),
                          (404, ("404", "OPENROUTER_MODEL")), (403, ("403", "permission denied")),
                          (401, ("401", "API key"))):
        if any(m.lower() in msg.lower() for m in markers): raise HTTPException(code, msg)
    raise HTTPException(502, msg)

@app.get("/api/health")
def health(x_session_id: str | None = Header(None, alias="X-Session-ID")):
    store = store_for(x_session_id)
    try: count, chunks = len(store.list_documents()), store.count
    except Exception as exc: raise HTTPException(503, str(exc))
    return {"status":"ok", "model":get_model_name(), "documents":count, "chunks":chunks,
            "uptime_seconds":int(time.time()-started), "cuda_available":False,
            "api_key_configured":bool(os.getenv("OPENROUTER_API_KEY"))}

@app.get("/api/documents")
def list_documents(x_session_id: str | None = Header(None, alias="X-Session-ID")):
    try: return [{k:d[k] for k in ("id","filename","pages","chunks","characters")} for d in store_for(x_session_id).list_documents()]
    except HTTPException: raise
    except Exception as exc: raise HTTPException(503, str(exc))

@app.post("/api/documents/upload", status_code=201)
async def upload_documents(files: List[UploadFile] = File(...), x_session_id: str | None = Header(None, alias="X-Session-ID")):
    store = store_for(x_session_id); uploaded=[]; failed=[]
    for f in files:
        name=f.filename or "unnamed.pdf"
        try:
            raw=await f.read()
            # Vercel function request bodies are limited to 4.5 MB; leave room
            # for multipart overhead so uploads remain below the platform cap.
            if len(raw)>4*1024*1024: raise PDFProcessingError(f'"{name}" exceeds the 4 MB Vercel upload limit.')
            pdf,chunks=process_pdf(name,raw); doc_id=uuid.uuid4().hex[:12]; stored=f"{doc_id}__{name}"
            renamed=[TextChunk(c.text,stored,c.page,c.chunk_index) for c in chunks]
            row=store.insert_document({"id":doc_id,"filename":name,"stored_name":stored,"pages":pdf.page_count,"chunks":len(chunks),"characters":pdf.total_characters})
            store.add_chunks(doc_id,renamed)
            uploaded.append({"id":doc_id,"filename":name,"pages":pdf.page_count,"chunks":len(chunks),"characters":pdf.total_characters})
        except PDFProcessingError as exc: failed.append({"filename":name,"error":str(exc)})
        except Exception as exc: failed.append({"filename":name,"error":str(exc)})
        finally: await f.close()
    if not uploaded and failed: raise HTTPException(422,{"message":"All files failed.","failed":failed})
    return {"uploaded":uploaded,"failed":failed}

@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str, x_session_id: str | None = Header(None, alias="X-Session-ID")):
    store=store_for(x_session_id)
    if not any(str(d["id"])==document_id for d in store.list_documents()): raise HTTPException(404,"Document not found.")
    store.delete_document(document_id); return {"status":"deleted","id":document_id}

@app.delete("/api/documents")
def clear_documents(x_session_id: str | None = Header(None, alias="X-Session-ID")):
    store_for(x_session_id).reset(); return {"status":"cleared"}

def safe_history(history):
    return [{"role":m.get("role"),"content":m.get("content")} for m in history if isinstance(m,dict) and m.get("role") in ("user","assistant") and str(m.get("content","")).strip()][-6:]

@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest, x_session_id: str | None = Header(None, alias="X-Session-ID")):
    store=store_for(x_session_id)
    try:
        if not store.count: raise HTTPException(400,"No documents indexed - upload a PDF first.")
        res=run_rag(req.question.strip(),store,safe_history(req.history),create_client())
        docs=store.list_documents(); names={d["stored_name"]:d["filename"] for d in docs}
        return ChatResponse(answer=res.answer,found=res.found,sources=[Citation(filename=names.get(s.filename,s.filename),page=s.page,score=s.score) for s in res.sources])
    except HTTPException: raise
    except RAGError as exc: map_rag_error(exc)
    except Exception as exc: raise HTTPException(502,str(exc))

@app.post("/api/chat/suggestions")
def suggestions(req: SuggestionsRequest, x_session_id: str | None = Header(None, alias="X-Session-ID")):
    store=store_for(x_session_id)
    try: return {"suggestions":generate_chat_suggestions(store,safe_history(req.history),create_client()) if store.count else []}
    except RAGError as exc: map_rag_error(exc)
    except Exception as exc: raise HTTPException(502,str(exc))

@app.delete("/api/chat/history")
def clear_history(): return {"status":"cleared"}
