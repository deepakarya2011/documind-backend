// Settings: theme + chat prefs + backend status. Never shows API keys.
import { useEffect, useState } from 'react'
import { useToast } from '../components/common/Toast.jsx'

const THEME_KEY = 'pdfchat.theme'
const PREFS_KEY = 'pdfchat.prefs.v1'

function loadPrefs() {
  try {
    return { showScores: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch { return { showScores: true } }
}

export function applyTheme() {
  document.documentElement.dataset.theme = 'dark'
  localStorage.setItem(THEME_KEY, 'dark')
}
export function currentTheme() {
  return 'dark'
}

export default function SettingsPage({ health, backendDown, onClearAll }) {
  const { push } = useToast()
  const [prefs, setPrefs] = useState(loadPrefs())
  const [clearing, setClearing] = useState(false)

  useEffect(() => { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) }, [prefs])

  const clear = async () => {
    if (!confirm('Remove ALL indexed documents and clear every conversation?')) return
    setClearing(true)
    try {
      await onClearAll()
      push('Everything cleared', 'success')
    } catch (err) {
      push(`Clear failed — ${err.message}`, 'error')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="page-inner">
      <div className="page-head">
        <h1>Settings</h1>
        <p>Appearance, chat behaviour, and backend status.</p>
      </div>

      <section className="set-card">
        <h2>Appearance</h2>
        <p>DocuMind uses its dark liquid-glass theme.</p>
        <div className="set-row">
          <label>Theme<small>Dark mode is always on.</small></label>
          <span className="theme-fixed">Dark</span>
        </div>
      </section>

      <section className="set-card">
        <h2>Chat</h2>
        <p>These preferences affect display only — retrieval always uses the backend top-k.</p>
        <div className="set-row">
          <label>Show relevance scores<small>Display the similarity score on each source citation.</small></label>
          <button
            className={`switch${prefs.showScores ? ' on' : ''}`}
            role="switch"
            aria-checked={!!prefs.showScores}
            onClick={() => setPrefs((p) => ({ ...p, showScores: !p.showScores }))}
            aria-label="Toggle relevance scores"
          />
        </div>
      </section>

      <section className="set-card">
        <h2>Backend &amp; model</h2>
        <p>Live status from GET /api/health. API keys are never shown here.</p>
        {backendDown || !health ? (
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>Backend offline — start uvicorn on port 8000.</p>
        ) : (
          <dl className="kv">
            <dt>Status</dt><dd>{health.status}</dd>
            <dt>Model</dt><dd>{health.model}</dd>
            <dt>Documents</dt><dd>{health.documents}</dd>
            <dt>Chunks</dt><dd>{health.chunks}</dd>
            <dt>Compute</dt><dd>{health.cuda_available ? 'CUDA GPU' : 'CPU'}</dd>
            <dt>API key</dt><dd>{health.api_key_configured ? 'Configured' : 'Missing — set OPENROUTER_API_KEY in .env'}</dd>
            <dt>Uptime</dt><dd>{Math.floor((health.uptime_seconds || 0) / 60)} min</dd>
          </dl>
        )}
      </section>

      <section className="set-card">
        <h2>Danger zone</h2>
        <p>Wipes the backend index and all local conversations.</p>
        <div className="set-row">
          <label>Clear everything<small>Deletes all documents, chunks, and chat history.</small></label>
          <button className="btn btn-danger" onClick={clear} disabled={clearing}>
            {clearing ? 'Clearing…' : 'Clear all data'}
          </button>
        </div>
      </section>
    </div>
  )
}
