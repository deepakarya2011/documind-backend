// Auto-growing composer: Enter sends, Shift+Enter adds a line.
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Paperclip } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function ChatInput({ onSend, sending, disabled, docCount }) {
  const [value, setValue] = useState('')
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [value])

  const submit = () => {
    const text = value.trim()
    if (!text || sending || disabled) return
    onSend(text)
    setValue('')
  }

  return (
    <div className="composer">
      <div className="composer-box">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          maxLength={2000}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Ask a question about your documents..."
          aria-label="Ask a question"
        />
        <div className="composer-toolbar">
          <button className="attach-btn" onClick={() => navigate('/documents')} aria-label="Upload or manage PDFs" title="Upload a PDF">
            <Paperclip size={16} /><span>{docCount ? `${docCount} document${docCount === 1 ? '' : 's'}` : 'Add a PDF'}</span>
          </button>
          <button className="send-btn" onClick={submit} disabled={sending || disabled || !value.trim()} aria-label="Send message" title="Send (Enter)">
            <ArrowUp size={17} />
          </button>
        </div>
      </div>
      <div className="composer-hint">
        {sending ? 'Generating answer...' : docCount ? 'Enter to send · Shift+Enter for a new line' : 'Add a PDF to start asking questions'}
      </div>
    </div>
  )
}
