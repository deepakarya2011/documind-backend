// History page: open / rename / delete persisted conversations.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { History, Pencil, Trash2, MessageSquarePlus } from 'lucide-react'
import { useToast } from '../components/common/Toast.jsx'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import Tooltip from '../components/common/Tooltip.jsx'
import EmptyState from '../components/common/EmptyState.jsx'

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

export default function HistoryPage({ chat }) {
  const { push } = useToast()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(null) // {id, title}
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const open = (id) => {
    chat.openConversation(id)
    navigate('/')
  }

  const saveRename = () => {
    if (!editing) return
    chat.renameConversation(editing.id, editing.title)
    setEditing(null)
    push('Conversation renamed', 'success')
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    chat.deleteConversation(deleting.id)
    setBusy(false)
    setDeleting(null)
    push('Conversation deleted', 'success')
  }

  return (
    <div className="page-inner">
      <div className="page-head">
        <h1>History</h1>
        <p>Conversations are stored in this browser. Open one to continue it.</p>
      </div>
      {chat.conversations.length === 0 ? (
        <EmptyState
          icon={<History size={22} />}
          title="No conversations yet"
          hint="Ask a question in Chat and it will appear here with its title and timestamp."
          action={<Button variant="primary" onClick={() => navigate('/')}><MessageSquarePlus size={15} /> Start chatting</Button>}
        />
      ) : (
        <div className="conv-list">
          {chat.conversations.map((c) => (
            <div
              key={c.id}
              className={`conv-item${c.id === chat.activeId ? ' active' : ''}`}
              onClick={() => open(c.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') open(c.id) }}
            >
              <div style={{ minWidth: 0 }}>
                {editing?.id === c.id ? (
                  <input
                    autoFocus
                    value={editing.title}
                    maxLength={80}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditing({ id: c.id, title: e.target.value })}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') saveRename()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    onBlur={saveRename}
                    style={{ background: 'var(--input-bg)', border: 'var(--border-thin)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px', fontSize: 13, width: 220 }}
                  />
                ) : (
                  <>
                    <div className="conv-title">{c.title}</div>
                    <div className="conv-sub">{fmtTime(c.updatedAt)} · {c.messages.length} messages</div>
                  </>
                )}
              </div>
              <span className="conv-count">{c.messages.filter((m) => m.role === 'user').length} questions</span>
              <Tooltip label="Rename">
                <button className="icon-btn" aria-label="Rename conversation" onClick={(e) => { e.stopPropagation(); setEditing({ id: c.id, title: c.title }) }}>
                  <Pencil size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Delete">
                <button className="icon-btn danger" aria-label="Delete conversation" onClick={(e) => { e.stopPropagation(); setDeleting(c) }}>
                  <Trash2 size={14} />
                </button>
              </Tooltip>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={!!deleting}
        title="Delete conversation?"
        confirmLabel="Delete"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => !busy && setDeleting(null)}
      >
        “{deleting?.title}” will be permanently removed from this browser.
      </Modal>
    </div>
  )
}
