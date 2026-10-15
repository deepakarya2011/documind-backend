// Viewer state: which document is open, which page, and text-highlight targets.
// Lives at app level so chat citations, document lists and the panel share it.
import { useCallback, useMemo, useState } from 'react'

const DEFAULT_PAGE = 1

export default function usePdfViewer(documents = []) {
  const [open, setOpen] = useState(false)
  const [activeDocId, setActiveDocId] = useState(null)
  const [page, setPage] = useState(DEFAULT_PAGE)
  // { text } target for the backend-provided snippet to locate on the page.
  const [highlight, setHighlight] = useState(null)

  const activeDoc = useMemo(
    () => documents.find((d) => d?.id === activeDocId) || null,
    [documents, activeDocId],
  )

  const openDocument = useCallback((docId, docPage = 1, target = null) => {
    if (!docId) return
    setActiveDocId((prev) => {
      if (prev !== docId) {
        setPage(Number.isFinite(docPage) && docPage > 0 ? Math.floor(docPage) : DEFAULT_PAGE)
        setHighlight(target)
      } else if (Number.isFinite(docPage) && docPage > 0) {
        setPage(Math.floor(docPage))
        setHighlight(target)
      }
      return docId
    })
    setOpen(true)
  }, [])

  const openPage = useCallback((docPage, target = null) => {
    if (Number.isFinite(docPage) && docPage > 0) setPage(Math.floor(docPage))
    if (target) setHighlight(target)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setHighlight(null)
  }, [])

  return {
    open, activeDoc, activeDocId, page, highlight,
    openDocument, openPage, setPage, close,
  }
}
