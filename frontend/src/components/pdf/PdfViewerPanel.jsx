// PDF viewer panel: react-pdf (PDF.js) rendering with page nav, zoom,
// fit-width, scroll, and highlight target support. Dark DocuMind theme.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2,
  X, FileText, Loader2, Lock, TriangleAlert, UploadCloud,
} from 'lucide-react'

// Worker must match the installed react-pdf/pdfjs version — resolved from
// the package so builds never drift. Vite bundles it as a module worker.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5]
const DEFAULT_ZOOM_INDEX = 2 // 1.0
const MAX_WIDTH_PADDING = 48 // panel padding accounted for fit-width

function isPasswordError(err) {
  return /password/i.test(String(err?.message || '')) || err?.name === 'PasswordException'
}

function PdfViewerPanel({ fileUrl, filename, page, onPageChange, highlight, onClose }) {
  const [numPages, setNumPages] = useState(0)
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const [fitWidth, setFitWidth] = useState(true)
  const [panelWidth, setPanelWidth] = useState(0)
  const [loadError, setLoadError] = useState(null)
  const scrollRef = useRef(null)
  const pageRefs = useRef({})

  // fileUrl is a browser-local object URL (URL.createObjectURL) of the File
  // the user selected — rendered offline, nothing is fetched from the server.
  const url = fileUrl || null
  const zoom = ZOOM_STEPS[zoomIndex]

  // Track available width for fit-to-width rendering.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    const update = () => setPanelWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fileUrl])

  const renderedWidth = useMemo(() => {
    if (fitWidth && panelWidth > MAX_WIDTH_PADDING) {
      return Math.min(panelWidth - MAX_WIDTH_PADDING, 1400)
    }
    return null // Page natural width at zoom
  }, [fitWidth, panelWidth, zoom])

  // Reset per-document state when the opened document changes.
  useEffect(() => {
    setNumPages(0)
    setLoadError(null)
    setZoomIndex(DEFAULT_ZOOM_INDEX)
    setFitWidth(true)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [fileUrl])

  const clampPage = useCallback(
    (next) => Math.min(Math.max(1, next), numPages || 1),
    [numPages],
  )

  const goToPage = useCallback(
    (next) => {
      const clamped = clampPage(next)
      onPageChange(clamped)
      const node = pageRefs.current[clamped]
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [clampPage, onPageChange],
  )

  // Scroll the requested page into view (citation jumps).
  const lastTargetRef = useRef(null)
  useEffect(() => {
    if (!numPages || !page) return
    if (lastTargetRef.current === page) return
    lastTargetRef.current = page
    const node = pageRefs.current[page]
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [page, numPages])

  // Locate + highlight cited text inside the page text layer.
  useEffect(() => {
    if (!highlight?.text || !page) return undefined
    const timer = setTimeout(() => {
      const container = pageRefs.current[page]
      if (!container) return
      const spans = container.querySelectorAll('.react-pdf__Page__textContent span')
      const needle = highlight.text.slice(0, 80).trim()
      if (!needle) return
      for (const span of spans) {
        if (span.textContent && span.textContent.includes(needle.slice(0, Math.min(40, needle.length)))) {
          const mark = document.createElement('mark')
          mark.className = 'pdf-highlight'
          mark.textContent = span.textContent
          span.replaceChildren(mark)
          span.scrollIntoView({ behavior: 'smooth', block: 'center' })
          break
        }
      }
    }, 600) // wait for text layer render
    return () => clearTimeout(timer)
  }, [highlight, page, numPages])

  const onDocumentLoadSuccess = useCallback(({ numPages: total }) => {
    setNumPages(total)
    setLoadError(null)
  }, [])

  const onDocumentLoadError = useCallback((err) => {
    setLoadError(err)
    setNumPages(0)
  }, [])

  if (!url) {
    // The browser File object is gone (page refreshed / new session).
    return (
      <div className="viewer-empty">
        <UploadCloud size={28} />
        <h3>PDF preview unavailable</h3>
        <p>
          The viewer shows the file you picked in this browser session, and that
          selection was lost when the page was reloaded. Please upload
          “{filename || 'the PDF'}” again from the Documents page — chat history
          and AI answers are not affected.
        </p>
      </div>
    )
  }

  return (
    <div className="pdf-viewer" role="complementary" aria-label="PDF viewer">
      <div className="pdf-viewer-bar">
        <div className="pdf-viewer-title" title={filename}>
          <FileText size={15} />
          <span>{filename || 'Document'}</span>
        </div>
        <div className="pdf-viewer-controls">
          <button className="icon-btn" onClick={() => goToPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          <span className="pdf-page-indicator">
            {page}{numPages ? ` / ${numPages}` : ''}
          </span>
          <button className="icon-btn" onClick={() => goToPage(page + 1)} disabled={!numPages || page >= numPages} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
          <span className="pdf-controls-sep" />
          <button className="icon-btn" onClick={() => { setFitWidth(false); setZoomIndex((i) => Math.max(0, i - 1)) }} disabled={zoomIndex <= 0 && !fitWidth} aria-label="Zoom out">
            <ZoomOut size={16} />
          </button>
          <button className="icon-btn" onClick={() => { setFitWidth(false); setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1)) }} disabled={zoomIndex >= ZOOM_STEPS.length - 1} aria-label="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button className={`icon-btn${fitWidth ? ' active' : ''}`} onClick={() => setFitWidth((v) => !v)} aria-label="Fit to width" title="Fit to width">
            <Maximize2 size={15} />
          </button>
          <span className="pdf-controls-sep" />
          <button className="icon-btn" onClick={onClose} aria-label="Close PDF viewer">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="pdf-viewer-scroll" ref={scrollRef}>
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="pdf-viewer-status">
              <Loader2 size={22} className="spin" />
              <span>Loading PDF…</span>
            </div>
          }
          error={
            <div className="pdf-viewer-status error">
              <TriangleAlert size={22} />
              <span>Could not load this PDF. It may be invalid or corrupted.</span>
            </div>
          }
        >
          {numPages > 0 && Array.from({ length: numPages }, (_, i) => (
            <div
              key={`page-${i + 1}`}
              className={`pdf-page-wrap${page === i + 1 ? ' current' : ''}`}
              ref={(node) => { pageRefs.current[i + 1] = node }}
              data-page={i + 1}
            >
              <Page
                pageNumber={i + 1}
                width={renderedWidth}
                scale={fitWidth ? undefined : zoom}
                renderTextLayer
                renderAnnotationLayer={false}
                loading={<div className="pdf-page-loading"><Loader2 size={18} className="spin" /></div>}
              />
              <div className="pdf-page-number">{i + 1} / {numPages}</div>
            </div>
          ))}
        </Document>

        {loadError && (
          <div className="pdf-viewer-banner">
            {isPasswordError(loadError) ? (
              <>
                <Lock size={16} />
                <span>This PDF is password-protected and cannot be displayed.</span>
              </>
            ) : (
              <>
                <TriangleAlert size={16} />
                <span>{loadError.message || 'This PDF could not be rendered. Try re-uploading it.'}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(PdfViewerPanel)
