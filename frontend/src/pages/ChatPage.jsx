// Chat page: two-column layout — conversation left, PDF viewer right.
// The viewer toggles open/closed; chat + document state are preserved.
import { useToast } from '../components/common/Toast.jsx'
import { useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, FileText } from 'lucide-react'
import ChatHistory from '../components/chat/ChatHistory.jsx'
import ChatInput from '../components/chat/ChatInput.jsx'
import PdfViewerPanel from '../components/pdf/PdfViewerPanel.jsx'
import { getChatSuggestions } from '../services/api.js'

export default function ChatPage({ chat, docCount, backendDown, apiUrl, documents, viewer }) {
  const { push } = useToast()
  const navigate = useNavigate()
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState('')
  const [suggestionRefresh, setSuggestionRefresh] = useState(0)
  const latestMessage = chat.messages.at(-1)
  const suggestionTrigger = chat.messages.length === 0
    ? `welcome-${chat.activeId || 'new'}`
    : latestMessage?.role === 'assistant' ? latestMessage.id : null
  const suggestionHistory = useMemo(
    () => chat.messages.slice(-12).map(({ role, content }) => ({ role, content })),
    [chat.messages],
  )
  const suggestionHistoryKey = JSON.stringify(suggestionHistory)

  useEffect(() => {
    if (!docCount || backendDown || !suggestionTrigger) {
      setAiSuggestions([])
      setSuggestionsLoading(false)
      setSuggestionsError('')
      return undefined
    }
    let current = true
    setAiSuggestions([])
    setSuggestionsLoading(true)
    setSuggestionsError('')
    getChatSuggestions(suggestionHistory).then((items) => {
      if (current) setAiSuggestions(items.slice(0, 5))
    }).catch((err) => {
      if (current) setSuggestionsError(`Couldn't generate questions: ${err.message}`)
    }).finally(() => {
      if (current) setSuggestionsLoading(false)
    })
    return () => { current = false }
  }, [docCount, backendDown, chat.activeId, suggestionTrigger, suggestionHistoryKey, suggestionRefresh])

  const send = async (text) => {
    if (!docCount) {
      push('Upload a PDF to start asking questions.', 'info')
      navigate('/documents')
      return
    }
    const res = await chat.ask(text, docCount)
    if (res.error) push(res.error, 'error')
  }

  const composer = <ChatInput onSend={send} sending={chat.sending} disabled={backendDown} docCount={docCount} />

  const handleCitation = (hit) => {
    // Citation hits may carry a docId (inline [Page N] chips) or only a
    // filename (source chips). Resolve filename → uploaded document ID.
    let docId = hit.docId
    if (!docId && hit.filename) {
      const match = (documents || []).find((d) => d.filename === hit.filename)
        || (documents || []).find((d) => hit.filename && d.filename.includes(hit.filename.replace(/\.pdf$/i, '')))
      docId = match?.id
    }
    if (!docId) {
      push('That document is no longer uploaded, so the page cannot be shown.', 'error')
      return
    }
    // The viewer renders the local File object; if that selection was lost
    // (page refresh), it shows a re-upload message instead of a broken PDF.
    viewer.openDocument(docId, hit.page || 1)
  }

  const chatCol = (
    <div className="chat-wrap">
      {backendDown && (
        <div style={{ background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: 12, padding: '8px 16px', textAlign: 'center' }}>
          Cannot reach the backend at {apiUrl} — start it with uvicorn on port 8000.
        </div>
      )}
      <ChatHistory
        messages={chat.messages}
        sending={chat.sending}
        hasDocs={docCount > 0}
        onSuggest={send}
        onRetry={(id) => chat.retry(id, docCount)}
        welcomeComposer={composer}
        aiSuggestions={aiSuggestions}
        suggestionsLoading={suggestionsLoading}
        suggestionsError={suggestionsError}
        onRefreshSuggestions={() => setSuggestionRefresh((value) => value + 1)}
        documents={documents}
        onCitationClick={handleCitation}
      />
      {chat.messages.length > 0 && <div className="composer-zone">{composer}</div>}
    </div>
  )

  if (!viewer.open) {
    return (
      <div className="chat-split">
        <button className="viewer-toggle" onClick={() => documents?.length ? viewer.openDocument(documents[0].id, 1) : push('Upload a PDF first — then the viewer can display it.', 'info')} title={documents?.length ? 'Open PDF viewer' : 'Upload a PDF first'}>
          <BookOpen size={16} />
          <span className="viewer-toggle-label">PDF</span>
        </button>
        {chatCol}
      </div>
    )
  }

  return (
    <div className="chat-split viewer-open">
      <button className="viewer-toggle open" onClick={viewer.close} title="Close PDF viewer">
        <BookOpen size={16} />
        <span className="viewer-toggle-label">PDF</span>
      </button>
      <div className="chat-pane">{chatCol}</div>
      <aside className="viewer-pane">
        {viewer.activeDoc ? (
          <PdfViewerPanel
            fileUrl={viewer.activeDoc.fileUrl}
            filename={(documents || []).find((d) => d.id === viewer.activeDocId)?.filename || viewer.activeDocId}
            page={viewer.page}
            onPageChange={viewer.setPage}
            highlight={viewer.highlight}
            onClose={viewer.close}
          />
        ) : (
          <div className="viewer-empty">
            <FileText size={28} />
            <h3>No document open</h3>
            <p>Click a citation like <span className="cite-chip demo">[Page 5]</span> in an answer, or choose a document below to view it here.</p>
            {documents?.length > 0 && (
              <div className="viewer-doc-picker">
                {documents.map((d) => (
                  <button key={d.id} onClick={() => viewer.openDocument(d.id, 1)} title={viewer.fileUrls[d.id] ? 'Open in viewer' : 'Preview needs re-upload in this session'}>
                    <FileText size={14} /> {d.filename}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
