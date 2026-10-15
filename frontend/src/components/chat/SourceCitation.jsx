// Source citations beneath an assistant answer: filename + page.
// Chips are clickable — they open the cited document/page in the viewer.
import { FileText } from 'lucide-react'

export default function SourceCitation({ sources, onCitationClick }) {
  if (!sources?.length) return null
  const open = (source) => onCitationClick?.({ filename: source.filename, page: source.page, docId: source.docId })
  return (
    <div className="sources">
      <div className="sources-title">Sources · {sources.length}</div>
      <div>
        {sources.map((s, i) => (
          <button
            className="source-chip"
            key={`${s.filename}-${s.page}-${i}`}
            title={onCitationClick ? `Open ${s.filename}, page ${s.page}` : `Relevance ${s.score ?? '—'}`}
            onClick={onCitationClick ? () => open(s) : undefined}
          >
            <FileText size={12} /> {s.filename} · p. {s.page}
          </button>
        ))}
      </div>
    </div>
  )
}
