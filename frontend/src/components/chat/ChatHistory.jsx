// Scrollable message list: welcome state, turns, typing indicator.
import { Bot, FileSearch, FileText, Lightbulb, ArrowUpRight, Sparkles, RefreshCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import ChatMessage from './ChatMessage.jsx'
import TypingIndicator from './TypingIndicator.jsx'

const SUGGESTIONS = [
  { q: 'What is this document about?', title: 'Ask your PDF', description: 'Find precise answers directly from your uploaded documents.', Icon: FileSearch },
  { q: 'Summarise the key points and main takeaways.', title: 'Summarize documents', description: 'Extract key ideas, important sections, and main takeaways.', Icon: FileText },
  { q: 'What connections or insights can you find across these documents?', title: 'Explore insights', description: 'Understand concepts, compare information, and discover connections.', Icon: Lightbulb },
]

function AIQuestionSuggestions({ items, loading, error, disabled, onSelect, onRefresh }) {
  return (
    <section className="ai-question-suggestions" aria-label="AI suggested questions">
      <div className="ai-suggestions-head">
        <span><Sparkles size={14} /> Suggested questions</span>
        <button className="suggestions-refresh" onClick={onRefresh} disabled={loading || disabled} aria-label="Generate new suggestions" title="Generate new suggestions">
          <RefreshCw size={13} className={loading ? 'refresh-spin' : ''} /> New ideas
        </button>
      </div>
      {loading ? (
        <div className="ai-suggestions-state">Finding questions in your documents...</div>
      ) : error ? (
        <div className="ai-suggestions-state">{error}</div>
      ) : items.length ? (
        <div className="ai-suggestion-list">
          {items.map((question, index) => (
            <button key={`${index}-${question}`} onClick={() => onSelect(question)} disabled={disabled}>
              <span>{String(index + 1).padStart(2, '0')}</span>{question}<ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      ) : (
        <div className="ai-suggestions-state">Upload a PDF to get questions tailored to its content.</div>
      )}
    </section>
  )
}

export default function ChatHistory({ messages, sending, hasDocs, onSuggest, onRetry, welcomeComposer, aiSuggestions, suggestionsLoading, suggestionsError, onRefreshSuggestions }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  return (
    <div className="chat-scroll">
      <div className="chat-inner">
        {messages.length === 0 && (
          <div className="welcome">
            <div className="welcome-orb" aria-hidden="true">
              <span className="orb-ring" />
              <span className="orb-current" />
              <span className="orb-glint" />
            </div>
            <div className="welcome-eyebrow">Welcome to DocuMind</div>
            <h1>Your documents, understood.</h1>
            <p>Ask questions, uncover insights, and get answers grounded in your PDFs.</p>
            {welcomeComposer}
            <div className="suggest-grid">
              {SUGGESTIONS.map((s) => (
                <button key={s.q} className="suggest" onClick={() => onSuggest(s.q)} disabled={sending}>
                  <span className="suggest-icon"><s.Icon size={18} /></span><ArrowUpRight className="suggest-arrow" size={16} />
                  <strong>{s.title}</strong><span className="suggest-description">{s.description}</span>
                </button>
              ))}
            </div>
            {!hasDocs && <div className="welcome-note">Upload a PDF to start a conversation. Answers include source pages.</div>}
            <AIQuestionSuggestions
              items={aiSuggestions}
              loading={suggestionsLoading}
              error={suggestionsError}
              disabled={sending || !hasDocs}
              onSelect={onSuggest}
              onRefresh={onRefreshSuggestions}
            />
          </div>
        )}
        {messages.map((m) => (
          <ChatMessage key={m.id || `${m.ts}-${m.role}`} message={m} onRetry={onRetry} retrying={sending} />
        ))}
        {messages.length > 0 && !sending && (
          <AIQuestionSuggestions
            items={aiSuggestions}
            loading={suggestionsLoading}
            error={suggestionsError}
            disabled={sending || !hasDocs}
            onSelect={onSuggest}
            onRefresh={onRefreshSuggestions}
          />
        )}
        {sending && (
          <div className="msg">
            <div className="msg-avatar"><Bot size={15} /></div>
            <div className="msg-body"><TypingIndicator /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
