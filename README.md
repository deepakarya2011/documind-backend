# 📄 AI PDF Chatbot (RAG) — React + FastAPI edition (OpenRouter)

Upload PDFs, ask questions in plain English, and get answers that cite the
exact **source filename and page numbers** — local embeddings + OpenRouter.

**Stack:** React (Vite) → FastAPI → PyMuPDF → MiniLM (CUDA when available)
→ ChromaDB → OpenRouter. React **never** calls OpenRouter — the key stays
on the backend.

## Project structure

```text
Ai PDA QA chatbot/
├── app.py / pdf_processor.py / embeddings.py / vector_store.py / rag_pipeline.py
│   # legacy Streamlit app + originals (kept untouched, still work)
├── backend/
│   ├── main.py             # FastAPI app: all endpoints + RAG wiring
│   ├── pdf_processor.py    # RAG copy used by the API
│   ├── embeddings.py       # RAG copy (MiniLM singleton, CUDA/CPU)
│   ├── vector_store.py     # RAG copy + remove_by_source() for per-doc delete
│   ├── rag_pipeline.py     # RAG copy (retrieve → OpenRouter → sources)
│   ├── requirements.txt    # backend deps (fastapi, uvicorn, …)
│   └── .env.example        # copy to project-root .env
├── frontend/
│   ├── package.json / vite.config.js / index.html / .env.example
│   └── src/
│       ├── main.jsx        # React entry point
│       ├── App.jsx         # layout + state (messages, docs, toasts)
│       ├── components/     # UploadZone, DocumentList, ChatMessage, EmptyState
│       ├── services/api.js # Axios wrapper (VITE_API_URL configurable)
│       └── styles/app.css  # dark theme, responsive
├── .env                    # YOUR REAL KEY (git-ignored, never commit)
└── README.md
```

## How the RAG workflow works (Python backend — learning focus)

```text
PDF ──extract──▶ pages ──chunk──▶ vectors ──store──▶ ChromaDB
                                                     │
Question ──embed──▶ similarity search ──top-k chunks─┘
                                                     │
        OpenRouter (context + strict prompt) ◀─────┘
                    ▼
        Answer + file.pdf · page N citations
```

1. **Extract** (`backend/pdf_processor.py`) — `process_pdf()` validates
   (`.pdf` extension + `%PDF` header), rejects password-protected and
   scanned/empty PDFs, extracts text **page by page** with PyMuPDF so every
   chunk keeps an exact page number. Chunks (1000 chars / 150 overlap) never
   span two pages → citations are always exact.
2. **Embed** (`backend/embeddings.py`) — `all-MiniLM-L6-v2` (384-dim) loads
   **once** as a process-wide singleton; device is `cuda` on your RTX 4050,
   `cpu` fallback otherwise.
3. **Store** (`backend/vector_store.py`) — ChromaDB ephemeral collection,
   cosine space; each chunk carries `{source, page, chunk_index}` metadata.
   Uploads use a unique source key `<doc_id>__<filename>` so same-name files
   never collide; `remove_by_source()` powers per-document delete.
4. **Retrieve + generate** (`backend/rag_pipeline.py`) — `run_rag()` embeds
   the question, fetches top-k chunks, builds a `CONTEXT` block tagged
   `[file | page]`, and calls OpenRouter (Chat Completions,
   `temperature=0.0`) with a strict answer-only-from-context prompt.
   No chunks → refusal sentence, no API call. OpenRouter failures map to
   `RAGError` (401 bad key, 402 no credits, 403 denied, 404 unknown model,
   429 rate limit, timeouts, refusals) → FastAPI returns
   401/402/403/404/429/502 JSON without leaking keys.

## Setup (Windows PowerShell)

```powershell
cd "D:\Projects\Python\Ai PDA QA chatbot"
.\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
# API key: create project-root .env with your OpenRouter key:
# Copy-Item backend\.env.example .env ; notepad .env  (set OPENROUTER_API_KEY)
cd frontend; npm install; cd ..
```

## Run (two separate terminals)

Terminal 1 — backend (port 8000):

```powershell
cd "D:\Projects\Python\Ai PDA QA chatbot"
.\venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000
# Docs: http://127.0.0.1:8000/docs · Health: /api/health
```

Terminal 2 — frontend (port 5173):

```powershell
cd "D:\Projects\Python\Ai PDA QA chatbot\frontend"
npm run dev
# Open http://localhost:5173
```

Frontend reads `VITE_API_URL` from `frontend/.env` (see `.env.example`);
default is `http://127.0.0.1:8000`. Backend CORS allows only local Vite.
## API reference

| Method | Endpoint | Success | Errors |
|---|---|---|---|
| GET | `/api/health` | 200 `{status, model, documents, chunks, uptime_seconds, cuda_available, api_key_configured}` | — |
| POST | `/api/documents/upload` (form field `files`, ≥1 PDF) | 201 `{uploaded: [{id, filename, pages, chunks, characters}], failed: []}` (partial success also 201) | 400 no files · 422 all failed |
| GET | `/api/documents` | 200 `[{id, filename, pages, chunks, characters}]` | — |
| DELETE | `/api/documents/{document_id}` (removes its chunks only) | 200 `{status: deleted, id}` | 404 unknown id |
| POST | `/api/chat` `{question, history?}` (≤6 prior turns) | 200 `{answer, sources: [{filename, page, score}], found}` | 400 empty/no docs · 401 bad key · 402 no credits · 403 denied · 404 unknown model · 429 rate limit · 502 unreachable |
| DELETE | `/api/chat/history` (history lives in React; symmetry endpoint) | 200 `{status: cleared}` | — |
| DELETE | `/api/documents` (wipes index — the old Clear button) | 200 `{status: cleared}` | — |

## Test checklist

1. `Invoke-RestMethod http://127.0.0.1:8000/api/health` → status ok.
2. Upload a text PDF → toast + sidebar entry with pages/chunks.
3. Upload a renamed `.txt` → 422 toast, app keeps running.
4. Ask *"What is this document about?"* → answer + filename · page chips.
5. Ask something unrelated → exact refusal sentence.
6. ✕ one doc → only its chunks disappear (others still answer).
7. Clear button → chat + index emptied.
8. Stop uvicorn → UI shows offline banner with restart command.

## Troubleshooting

| Symptom | Fix |
|---|---|
| *Cannot reach backend* | Terminal 1 running? `uvicorn backend.main:app --port 8000` from project root (NOT `uvicorn main:app` — there is no root-level `main.py`; the app lives in `backend/main.py`) |
| 401 / *key not found* | Check project-root `.env` → `OPENROUTER_API_KEY=sk-or-…` (get one at openrouter.ai/keys), restart uvicorn |
| 402 no credits | Top up at openrouter.ai/credits, then retry |
| 403 denied | Key lacks permission for this route — check OpenRouter key settings |
| 404 unknown model | `OPENROUTER_MODEL` route retired — pick a current one at openrouter.ai/models |
| 429 rate limit | Wait a minute / check credits at openrouter.ai/credits |
| *No selectable text* | Scanned PDF — OCR unsupported; use a text PDF |
| First question slow | MiniLM (~90 MB) downloads once, then cached; `cuda_available: true` on your GPU |
| `vite: command not found` | `npm install` was interrupted (esbuild postinstall) — rerun it |
| Legacy UI | `.\venv\Scripts\python.exe -m streamlit run app.py` still works unchanged |

## Security notes

- `OPENROUTER_API_KEY` lives only in project-root `.env` (git-ignored), read by
  `backend/main.py` via python-dotenv. React never sees it.
- Frontend sends PDFs + questions to FastAPI; FastAPI alone talks to OpenRouter.
- Backend errors are mapped to safe messages — no keys or tracebacks to UI.

