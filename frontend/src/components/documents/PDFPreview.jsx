// Citation preview popover: shows filename, page, and relevance score.
// The backend keeps authoritative page attribution; this is display-only.
import { FileText } from 'lucide-react'

export default function PDFPreview({ source }) {
  if (!source) return null
  return (
    <span className="source-chip" title={`Relevance score ${source.score ?? '—'}`}>
      <FileText size={12} /> {source.filename} · p. {source.page}
    </span>
  )
}
