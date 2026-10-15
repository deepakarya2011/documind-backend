// Chat page: conversation + anchored composer + offline banner.
import { useToast } from '../components/common/Toast.jsx'
import { useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import ChatHistory from '../components/chat/ChatHistory.jsx'
import ChatInput from '../components/chat/ChatInput.jsx'
import { getChatSuggestions } from '../services/api.js'

export default function ChatPage({ chat, docCount, backendDown, apiUrl }) {
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

  return (
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
      />
      {chat.messages.length > 0 && <div className="composer-zone">{composer}</div>}
    </div>
  )
}
