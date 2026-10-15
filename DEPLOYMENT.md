# GitHub and Vercel deployment

## What Vercel will host

Vercel serves the React/Vite frontend from `frontend/dist`. The FastAPI service
is a separate service: it loads the embedding model and keeps uploaded PDF
vectors in memory, so deploying only the Vercel frontend does not deploy the
chat API or preserve uploaded documents across backend restarts.

## Push this project to GitHub

1. Create an empty repository on GitHub (do not add a README or `.gitignore`).
2. In PowerShell, from this project folder, run:

```powershell
git init
git add .
git status
```

Check that `.env`, `venv`, `frontend/node_modules`, and `frontend/dist` are not
listed. Then commit and connect your GitHub repository:

```powershell
git commit -m "Prepare DocuMind for deployment"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the remote URL with the repository URL from GitHub. Git will prompt for
GitHub authentication if it is not already configured.

## Deploy the frontend to Vercel

1. In Vercel, choose **Add New → Project**, then import the GitHub repository.
2. Keep the project root at the repository root. The included `vercel.json`
   installs and builds the app from `frontend/` and serves `frontend/dist`.
3. Add the environment variable `VITE_API_URL` with the public URL of the
   deployed FastAPI backend (for example `https://your-api.example.com`). Do
   not use `localhost` in Vercel settings.
4. Deploy. Vercel will build again on later pushes to the production branch.

## Deploy the backend to Render

The root `render.yaml` is a Render Blueprint for the FastAPI service. In
Render, choose **New + → Blueprint**, connect this GitHub repository, and
select that file. The service uses the `backend` directory, the `standard`
2 GB plan, and the command `uvicorn main:app --host 0.0.0.0 --port $PORT`.

When Render prompts for `OPENROUTER_API_KEY`, enter your real OpenRouter key.
The model is set to `openai/gpt-4o-mini`. After the service is created, copy its
`onrender.com` URL. The health check is `/api/health`.

Set the backend's `FRONTEND_ORIGINS` environment variable to your exact
production Vercel origin, such as `https://your-app.vercel.app` (no trailing
slash). If you use a Vercel preview URL, add that origin as well, comma
separated. Then redeploy the backend.

Use this service for a working demo. Uploaded PDFs and their vector index are
held in process memory by this app, so re-upload documents after a backend
restart or redeploy. A Render disk alone would not preserve this in-memory
index; persistence needs an application storage change.

Finally, set `VITE_API_URL` to the Render service URL in Vercel and redeploy
the frontend. Vite embeds that variable during the build.
