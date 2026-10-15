// Source citations beneath an assistant answer: filename + page.
import { FileText } from 'lucide-react'

export default function SourceCitation({ sources }) {
  if (!sources?.length) return null
  return (
    <div className="sources">
      <div className="sources-title">Sources · {sources.length}</div>
      <div>
        {sources.map((s, i) => (
          <span className="source-chip" key={`${s.filename}-${s.page}-${i}`} title={`Relevance ${s.score ?? '—'}`}>
            <FileText size={12} /> {s.filename} · p. {s.page}
          </span>
        ))}
      </div>
    </div>
  )
}
