# Deploy DocuMind on Vercel

Vercel hosts the Vite frontend and FastAPI serverless function. Supabase stores PDF metadata and searchable chunks across function restarts. OpenRouter provides chat completions and text embeddings.

PDF uploads are capped at 4 MB to fit within Vercel Functions request body limits.

## 1. Create Supabase storage

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql` from this repository.
3. From Project Settings > API, copy the Project URL and the `service_role` secret key. Keep the secret key private; add it only to Vercel environment variables.

Supabase free projects can pause after a period of inactivity. Resume a paused project from the Supabase dashboard before using the app again.

## 2. Deploy on Vercel

1. Import this GitHub repository into Vercel. Keep Root Directory at the repository root.
2. Set these environment variables for Production (and Preview if needed):
   - `OPENROUTER_API_KEY` - your OpenRouter key
   - `OPENROUTER_MODEL` - for example `openai/gpt-4o-mini`
   - `SUPABASE_URL` - the Supabase Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - the Supabase `service_role` secret
   - `OPENROUTER_EMBEDDING_MODEL` - optional; default `openai/text-embedding-3-small`
3. Leave `VITE_API_URL` unset. Production frontend requests use the same Vercel domain.
4. Deploy. `vercel.json` builds `frontend/`; `api/[...path].py` routes `/api/*` to FastAPI.

## Local development

The original local Chroma/MiniLM backend still uses:

```powershell
python -m pip install -r requirements-local.txt
python -m uvicorn backend.main:app --port 8000
```

In another terminal, run the frontend with `cd frontend; npm install; npm run dev`. For local mode, the frontend calls `http://127.0.0.1:8000`.
