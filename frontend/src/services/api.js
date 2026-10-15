// Thin Axios wrapper around the FastAPI backend.
// Base URL is configurable: set VITE_API_URL in frontend/.env, else port 8000.
import axios from 'axios'

const SESSION_KEY = 'documind.session.v1'
function sessionId() {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : 'http://127.0.0.1:8000'),
  timeout: 120000, // embeddings + OpenRouter can take a while on first run
})
api.interceptors.request.use((config) => {
  config.headers['X-Session-ID'] = sessionId()
  return config
})

function friendlyError(err) {
  const data = err?.response?.data
  const detail = data?.detail
  if (typeof detail === 'string' && detail) return detail
  if (detail?.message) {
    const extra = (detail.failed || []).map((f) => `${f.filename}: ${f.error}`).join('\n')
    return extra ? `${detail.message}\n${extra}` : detail.message
  }
  if (err?.code === 'ECONNREFUSED' || err?.message?.includes('Network Error'))
    return 'Cannot reach the backend. Start it with uvicorn on port 8000.'
  return err?.message || 'Something went wrong.'
}

export async function getHealth() {
  try {
    const { data } = await api.get('/api/health')
    return data
  } catch (err) {
    throw new Error(friendlyError(err))
  }
}

export async function listDocuments() {
  try {
    const { data } = await api.get('/api/documents')
    if (!Array.isArray(data)) throw new Error('The API did not return a document list. Check the Vercel API route.')
    return data
  } catch (err) {
    throw new Error(friendlyError(err))
  }
}

export async function uploadDocuments(fileList, onProgress) {
  const tooLarge = [...fileList].find((file) => file.size > 4 * 1024 * 1024)
  if (tooLarge) throw new Error(`${tooLarge.name} exceeds Vercel's 4 MB PDF upload limit.`)
  const form = new FormData()
  for (const f of fileList) form.append('files', f)
  try {
    const { data } = await api.post('/api/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
    return data // { uploaded: [...], failed: [...] }
  } catch (err) {
    // 422 from FastAPI carries { message, failed } - surface per-file errors.
    if (err?.response?.status === 422) throw new Error(friendlyError(err))
    throw new Error(friendlyError(err))
  }
}

export async function deleteDocument(id) {
  try {
    const { data } = await api.delete(`/api/documents/${id}`)
    return data
  } catch (err) {
    throw new Error(friendlyError(err))
  }
}

// URL for the raw PDF of a document (react-pdf loads this directly).
// Relative on purpose: the configured api.baseURL applies to XHR only,
// while <Document file={...}> fetches its own URL and needs the origin too.
export function documentFileUrl(documentId) {
  const base = api.getUri()
  return `${base.replace(/\/+$/, '')}/api/documents/${encodeURIComponent(documentId)}/file`
}

export async function sendChat(question, history) {
  try {
    const { data } = await api.post('/api/chat', { question, history })
    return data // { answer, sources: [{filename, page, score}], found }
  } catch (err) {
    throw new Error(friendlyError(err))
  }
}

export async function getChatSuggestions(history = []) {
  try {
    const { data } = await api.post('/api/chat/suggestions', { history })
    return data.suggestions || []
  } catch (err) {
    if (err?.response?.status === 404) {
      throw new Error('The running backend has not loaded AI suggestions yet. Restart FastAPI, reload DocuMind, then try again.')
    }
    throw new Error(friendlyError(err))
  }
}

export async function clearAll() {
  try {
    await api.delete('/api/documents') // wipes index + registry
    await api.delete('/api/chat/history').catch(() => {})
  } catch (err) {
    throw new Error(friendlyError(err))
  }
}
