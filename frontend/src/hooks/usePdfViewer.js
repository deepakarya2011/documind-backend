// Viewer state: which document is open, which page, and text-highlight targets.
// Also owns the map of document ID -> browser-local File object URL so the
// viewer renders the ORIGINAL PDF the user selected (no server fetch needed).
// Lives at app level so chat citations, document lists and the panel share it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_PAGE = 1

export default function usePdfViewer() {
  const [open, setOpen] = useState(false)
  const [activeDocId, setActiveDocId] = useState(null)
  const [page, setPage] = useState(DEFAULT_PAGE)
  // { text } target for the backend-provided snippet to locate on the page.
  const [highlight, setHighlight] = useState(null)
  // docId -> object URL created from the user's browser File object.
  const [fileUrls, setFileUrls] = useState({})
  const urlsRef = useRef(fileUrls)

  // Revoke all object URLs only when the whole app unmounts (session end).
  // Never revoked while active — react-pdf re-fetches by URL internally.
  useEffect(() => () => {
    Object.values(urlsRef.current).forEach((u) => u && URL.revokeObjectURL(u))
  }, [])

  const registerFile = useCallback((docId, file) => {
    if (!docId || !(file instanceof File)) return
    setFileUrls((prev) => {
      const next = { ...prev }
      // If this doc already had a URL, revoke the old one and replace it.
      if (next[docId]) URL.revokeObjectURL(next[docId])
      next[docId] = URL.createObjectURL(file)
      urlsRef.current = next
      return next
    })
  }, [])

  const releaseFiles = useCallback((docIds) => {
    setFileUrls((prev) => {
      const next = { ...prev }
      docIds.forEach((id) => {
        if (next[id]) URL.revokeObjectURL(next[id])
        delete next[id]
      })
      urlsRef.current = next
      return next
    })
  }, [])

  const activeDoc = useMemo(
    () => (activeDocId
      ? { id: activeDocId, fileUrl: fileUrls[activeDocId] || null }
      : null),
    [activeDocId, fileUrls],
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
    open, activeDoc, activeDocId, page, highlight, fileUrls,
    registerFile, releaseFiles, openDocument, openPage, setPage, close,
  }
}
