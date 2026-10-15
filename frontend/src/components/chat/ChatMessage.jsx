// One conversation turn: Markdown body, sources, copy/retry actions.
import { memo, useState } from 'react'
import { User, Bot, Copy, Check, RotateCcw } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer.jsx'
import SourceCitation from './SourceCitation.jsx'
import Tooltip from '../common/Tooltip.jsx'

function ChatMessage({ message, onRetry, retrying, documents, onCitationClick }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  if (isUser) {
    return (
      <div className="msg msg-user">
        <div className="msg-avatar"><User size={15} /></div>
        <div className="msg-body">
          <div className="msg-name">You</div>
          <div className="msg-content"><MarkdownRenderer content={message.content} /></div>
        </div>
      </div>
    )
  }

  const handleCitation = (hit) => onCitationClick?.(hit)

  return (
    <div className="msg">
      <div className="msg-avatar"><Bot size={15} /></div>
      <div className="msg-body">
        <div className="msg-name">Assistant</div>
        {message.error ? (
          <div className="msg-error">{message.content}</div>
        ) : (
          <MarkdownRenderer content={message.content} documents={documents} onCitationClick={handleCitation} />
        )}
        {!message.error && <SourceCitation sources={message.sources} onCitationClick={handleCitation} />}
        <div className="msg-actions">
          {!message.error && (
            <Tooltip label={copied ? 'Copied' : 'Copy answer'}>
              <button className="icon-btn" onClick={copy} aria-label="Copy answer">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </Tooltip>
          )}
          {onRetry && !message.error && (
            <Tooltip label="Retry this answer">
              <button className="icon-btn" onClick={() => onRetry(message.id)} disabled={retrying} aria-label="Retry">
                <RotateCcw size={14} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(ChatMessage)
