// One indexed document row: icon, name, stats, status, remove action.
import { FileText, Trash2 } from 'lucide-react'
import Tooltip from '../common/Tooltip.jsx'

function fmtChars(n) {
  if (n == null) return ''
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k chars`
  return `${n} chars`
}

export default function DocumentItem({ doc, removing, onRemove }) {
  return (
    <div className="doc-row">
      <span className="doc-icon"><FileText size={17} /></span>
      <div className="doc-meta">
        <div className="doc-name" title={doc.filename}>{doc.filename}</div>
        <div className="doc-sub">
          {doc.pages} pages · {doc.chunks} chunks · {fmtChars(doc.characters)}
        </div>
      </div>
      <span className={`status-pill ${removing ? 'status-busy' : 'status-ready'}`}>
        {removing ? 'Removing…' : 'Indexed'}
      </span>
      <Tooltip label={`Remove ${doc.filename}`}>
        <button className="icon-btn danger" onClick={() => onRemove(doc)} disabled={removing} aria-label={`Remove ${doc.filename}`}>
          <Trash2 size={15} />
        </button>
      </Tooltip>
    </div>
  )
}
