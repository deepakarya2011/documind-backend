// Indexed-document table with loading skeletons and empty state.
import { FolderOpen } from 'lucide-react'
import DocumentItem from './DocumentItem.jsx'
import EmptyState from '../common/EmptyState.jsx'
import LoadingSpinner from '../common/LoadingSpinner.jsx'

export default function DocumentList({ documents, loading, removingId, onRemove, onBrowse }) {
  if (loading) {
    return (
      <div className="doc-table" aria-label="Loading documents">
        {[0, 1].map((i) => (
          <div className="doc-row" key={i}>
            <div className="skeleton" style={{ width: 36, height: 36 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: 13, width: '45%', marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 11, width: '30%' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!documents.length) {
    return (
      <EmptyState
        icon={<FolderOpen size={22} />}
        title="No documents yet"
        hint="Upload a PDF to start asking questions. Text is extracted page by page so every answer can cite its source."
        action={onBrowse}
      />
    )
  }

  const totalChunks = documents.reduce((n, d) => n + (d.chunks || 0), 0)
  return (
    <>
      <div className="doc-table">
        {documents.map((d) => (
          <DocumentItem key={d.id} doc={d} removing={removingId === d.id} onRemove={onRemove} />
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        {documents.length} file{documents.length === 1 ? '' : 's'} · {totalChunks} chunks indexed
      </p>
    </>
  )
}
