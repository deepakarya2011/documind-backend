// Accessible confirmation dialog. Renders nothing when closed.
import { useEffect } from 'react'
import Button from './Button.jsx'

export default function Modal({
  open, title, children, confirmLabel = 'Delete',
  onConfirm, onCancel, busy = false,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">{title}</div>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
