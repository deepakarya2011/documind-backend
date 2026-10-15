// Drag-and-drop / browse uploader. PDFs only; backend validates content.
// Uses the toast system instead of window.alert.
import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'

export default function PDFUploader({ onFiles, uploading, progress, push }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  const pick = (fileList) => {
    const all = Array.from(fileList || [])
    const pdfs = all.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (all.length !== pdfs.length)
      push?.('Only .pdf files are accepted — others were skipped.', 'error')
    if (pdfs.length) onFiles(pdfs)
  }

  return (
    <div
      className={`dropzone${drag ? ' drag' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Upload PDF documents"
      onClick={() => !uploading && inputRef.current?.click()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) inputRef.current?.click() }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (!uploading) pick(e.dataTransfer.files) }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        hidden
        onChange={(e) => { pick(e.target.files); e.target.value = '' }}
      />
      {uploading ? (
        <div>
          <strong>Uploading &amp; indexing… {progress}%</strong>
          <div className="progress-thin" style={{ maxWidth: 320, margin: '10px auto 0' }}>
            <i style={{ width: `${progress}%` }} />
          </div>
          <p style={{ marginTop: 8 }}>Large PDFs take a moment to embed.</p>
        </div>
      ) : (
        <>
          <span className="dropzone-icon"><UploadCloud size={28} /></span>
          <h3>Drag &amp; drop PDFs here, or click to browse</h3>
          <p>Multiple files supported · max 50 MB each · scanned PDFs are rejected with a clear error</p>
        </>
      )}
    </div>
  )
}
