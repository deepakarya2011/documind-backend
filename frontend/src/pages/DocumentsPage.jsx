// Documents page: uploader + indexed table + confirm-before-delete.
import { useState } from 'react'
import { useToast } from '../components/common/Toast.jsx'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import PDFUploader from '../components/documents/PDFUploader.jsx'
import DocumentList from '../components/documents/DocumentList.jsx'

export default function DocumentsPage({ docs }) {
  const { push } = useToast()
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)

  const confirmRemove = async () => {
    if (!pending) return
    setBusy(true)
    await docs.remove(pending)
    setBusy(false)
    setPending(null)
  }

  return (
    <div className="page-inner wide">
      <div className="page-head">
        <h1>Documents</h1>
        <p>Upload PDFs to index them. Answers cite the exact file and page.</p>
      </div>
      <PDFUploader onFiles={docs.upload} uploading={docs.uploading} progress={docs.progress} push={push} />
      <div style={{ height: 16 }} />
      <DocumentList
        documents={docs.documents}
        loading={docs.loading}
        removingId={docs.removingId}
        onRemove={setPending}
        onBrowse={<Button onClick={() => document.querySelector('.dropzone')?.click()}>Upload a PDF</Button>}
      />
      <Modal
        open={!!pending}
        title="Remove document?"
        confirmLabel="Remove"
        busy={busy}
        onConfirm={confirmRemove}
        onCancel={() => !busy && setPending(null)}
      >
        “{pending?.filename}” and its {pending?.chunks ?? 0} indexed chunks will be
        removed. Other documents are unaffected.
      </Modal>
    </div>
  )
}
