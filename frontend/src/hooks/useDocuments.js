// Document state: list / upload / delete against the FastAPI backend.
// Contract: listDocuments() -> [{id,filename,pages,chunks,characters}],
// uploadDocuments(files, onProgress) -> {uploaded[], failed[]}.
import { useCallback, useEffect, useState } from 'react'
import { listDocuments, uploadDocuments, deleteDocument } from '../services/api.js'

export default function useDocuments(push, viewer) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [removingId, setRemovingId] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setDocuments(await listDocuments())
    } catch { /* offline — pages show their own banner */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const upload = useCallback(async (files) => {
    if (!files?.length || uploading) return
    setUploading(true)
    setProgress(0)
    try {
      const { uploaded, failed } = await uploadDocuments(files, setProgress)
      // Map each uploaded document ID to the browser-local File object so the
      // PDF viewer can render the original file without a server fetch.
      uploaded?.forEach((doc) => {
        const file = files.find((f) => f.name === doc.filename)
        if (file) viewer?.registerFile(doc.id, file)
      })
      await refresh()
      if (uploaded?.length)
        push?.(`Indexed: ${uploaded.map((d) => d.filename).join(', ')}`, 'success')
      failed?.forEach((f) => push?.(`${f.filename} — ${f.error}`, 'error'))
    } catch (err) {
      push?.(`Upload failed — ${err.message}`, 'error')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }, [uploading, refresh, push, viewer])

  const remove = useCallback(async (doc) => {
    setRemovingId(doc.id)
    try {
      await deleteDocument(doc.id)
      viewer?.releaseFiles([doc.id]) // free the object URL of the removed doc
      await refresh()
      push?.(`Removed ${doc.filename}`, 'success')
    } catch (err) {
      push?.(`Could not remove ${doc.filename} — ${err.message}`, 'error')
    } finally {
      setRemovingId(null)
    }
  }, [refresh, push, viewer])

  return { documents, loading, uploading, progress, removingId, refresh, upload, remove }
}
