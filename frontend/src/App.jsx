// App root: router, providers, shared chat/document state.
import { useCallback, useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout.jsx'
import { ToastProvider, useToast } from './components/common/Toast.jsx'
import ChatPage from './pages/ChatPage.jsx'
import DocumentsPage from './pages/DocumentsPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import SettingsPage, { applyTheme, currentTheme } from './pages/SettingsPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import useChat from './hooks/useChat.js'
import useDocuments from './hooks/useDocuments.js'
import { getHealth, clearAll } from './services/api.js'
import './styles/variables.css'
import './styles/global.css'
import './styles/components.css'
import './styles/markdown.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

function Shell() {
  const { push } = useToast()
  const chat = useChat()
  const docs = useDocuments(push)
  const [health, setHealth] = useState(null)

  useEffect(() => {
    applyTheme(currentTheme())
    getHealth().then(setHealth).catch(() => setHealth({ status: 'down' }))
    const t = setInterval(() => {
      getHealth().then(setHealth).catch(() => setHealth({ status: 'down' }))
    }, 30000)
    return () => clearInterval(t)
  }, [])

  const clearEverything = useCallback(async () => {
    await clearAll()
    await docs.refresh()
    // Drop local conversations too (they reference a now-empty index).
    localStorage.removeItem('pdfchat.conversations.v1')
    localStorage.removeItem('pdfchat.active.v1')
    window.location.reload()
  }, [docs])

  const backendDown = !health || health.status === 'down'

  return (
    <AppLayout
      health={health}
      docCount={docs.documents.length}
      documents={docs.documents}
      onNewChat={chat.newConversation}
    >
      <Routes>
        <Route
          path="/"
          element={<ChatPage chat={chat} docCount={docs.documents.length} backendDown={backendDown} apiUrl={API_URL} />}
        />
        <Route path="/chat" element={<ChatPage chat={chat} docCount={docs.documents.length} backendDown={backendDown} apiUrl={API_URL} />} />
        <Route path="/documents" element={<DocumentsPage docs={docs} />} />
        <Route path="/history" element={<HistoryPage chat={chat} />} />
        <Route
          path="/settings"
          element={<SettingsPage health={health} backendDown={backendDown} onClearAll={clearEverything} />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </HashRouter>
  )
}
