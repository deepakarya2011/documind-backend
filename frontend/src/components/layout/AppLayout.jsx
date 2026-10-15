// Persistent app shell: sidebar nav + topbar + routed page content.
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  FileText, MessageSquarePlus, History, FolderOpen, Settings,
  PanelLeftClose, PanelLeftOpen, FileStack, Search, X, Plus,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Button from '../common/Button.jsx'
import Tooltip from '../common/Tooltip.jsx'
import docuMindLogo from '../../assets/logo/logo-cropped.png'

export function AppLayout({ children, health, docCount, documents = [], onNewChat }) {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 860px)').matches)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const filteredDocs = useMemo(() => (Array.isArray(documents) ? documents : []).filter((doc) => doc?.filename?.toLowerCase().includes(search.toLowerCase())), [documents, search])

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 860px)')
    const syncDrawer = (event) => setCollapsed(event.matches)
    mobile.addEventListener?.('change', syncDrawer)
    return () => mobile.removeEventListener?.('change', syncDrawer)
  }, [])

  useEffect(() => {
    if (window.matchMedia('(max-width: 860px)').matches) setCollapsed(true)
  }, [location.pathname])

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && window.matchMedia('(max-width: 860px)').matches) setCollapsed(true)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  const connClass = !health || health.status === 'down' ? 'down'
    : health.api_key_configured ? '' : 'nokey'
  const connText = !health || health.status === 'down' ? 'Backend offline'
    : health.api_key_configured ? `Connected · ${health.model}` : 'API key missing'

  const goNewChat = () => {
    onNewChat()
    if (location.pathname !== '/') navigate('/chat')
  }

  return (
    <div className="app-shell">
      {!collapsed && <button className="drawer-scrim" aria-label="Close navigation" onClick={() => setCollapsed(true)} />}
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-label="Primary">
        <div className="brand">
          <img className="brand-logo" src={docuMindLogo} alt="DocuMind" />
          <button className="icon-btn brand-search" aria-label="Search documents" onClick={() => setSearchOpen((v) => !v)}>{searchOpen ? <X size={16} /> : <Search size={16} />}</button>
        </div>
        <nav className="nav">
          {searchOpen && <div className="sidebar-search"><Search size={14} /><input autoFocus placeholder="Search documents" value={search} onChange={(e) => setSearch(e.target.value)} /></div>}
          <Button className="new-chat-btn" onClick={goNewChat} title="Start a new conversation">
            <Plus size={16} /> New chat
          </Button>
          <div className="nav-section">Workspace</div>
          <NavLink to="/chat" className={({ isActive }) => `nav-link${isActive || location.pathname === '/' ? ' active' : ''}`}>
            <MessageSquarePlus size={16} /> Chat
          </NavLink>
          <NavLink to="/documents" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <FolderOpen size={16} /> Documents
            {docCount > 0 && <span className="nav-badge">{docCount}</span>}
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <History size={16} /> Chat History
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Settings size={16} /> Settings
          </NavLink>
          <div className="nav-section docs-label">Your documents <button onClick={() => navigate('/documents')} aria-label="Upload a PDF"><Plus size={13} /></button></div>
          <div className="sidebar-docs">
            {filteredDocs.length ? filteredDocs.map((doc) => <button key={doc.id} className="sidebar-doc" title={doc.filename} onClick={() => navigate('/documents')}><FileText size={15} /><span>{doc.filename}</span></button>) : <div className="sidebar-empty">{search ? 'No matching documents' : 'No PDFs yet. Upload one to get started.'}</div>}
          </div>
        </nav>
        <div className="sidebar-foot">
          <div className="workspace-status"><span className="avatar-mark"><FileStack size={15} /></span><span className="workspace-copy"><b>AI Workspace</b><small title={connText}>{health?.model || 'Model status'} · {health?.status === 'ok' ? 'Ready' : 'Offline'}</small></span><span className={`conn-dot ${connClass}`} title={connText} /></div>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <Tooltip label={collapsed ? 'Show sidebar' : 'Hide sidebar'}>
            <button className="icon-btn" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar">
              {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
          </Tooltip>
          <div>
            <div className="topbar-title">
              {location.pathname === '/' || location.pathname === '/chat' ? 'Chat' : location.pathname.slice(1).replace(/^\w/, (c) => c.toUpperCase())}
            </div>
            <div className="topbar-sub">
              {docCount === 0 ? 'No documents indexed' : `${docCount} document${docCount === 1 ? '' : 's'} indexed`}
              {health?.cuda_available ? ' · GPU' : ''}
            </div>
          </div>
          <div className="topbar-right">
            <span className="model-pill"><span className="model-dot" /> {health?.model || 'OpenRouter AI'}</span>
          </div>
        </header>
        <div className="page">{children}</div>
      </div>
    </div>
  )
}
