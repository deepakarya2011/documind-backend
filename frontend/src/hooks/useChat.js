// Chat state: conversations persisted to localStorage, one active at a time.
// Backend contract: sendChat(question, history[{role,content}]) ->
// { answer, sources:[{filename,page,score}], found }. History kept client-side.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { sendChat } from '../services/api.js'

const LS_KEY = 'pdfchat.conversations.v1'
const LS_ACTIVE = 'pdfchat.active.v1'

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}
function titleFor(firstQuestion) {
  const t = (firstQuestion || 'New conversation').trim().slice(0, 60)
  return t || 'New conversation'
}

export default function useChat() {
  const [conversations, setConversations] = useState(load)
  const [activeId, setActiveId] = useState(() => localStorage.getItem(LS_ACTIVE) || null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(conversations))
  }, [conversations])
  useEffect(() => {
    if (activeId) localStorage.setItem(LS_ACTIVE, activeId)
    else localStorage.removeItem(LS_ACTIVE)
  }, [activeId])

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId],
  )
  const messages = active?.messages || []

  const newConversation = useCallback(() => {
    const id = `c_${Date.now().toString(36)}`
    const conv = { id, title: 'New conversation', createdAt: Date.now(), updatedAt: Date.now(), messages: [] }
    setConversations((prev) => [conv, ...prev])
    setActiveId(id)
    return id
  }, [])

  const ensureActive = useCallback(() => {
    if (activeId && conversations.some((c) => c.id === activeId)) return activeId
    return newConversation()
  }, [activeId, conversations, newConversation])

  const ask = useCallback(async (question, docCount) => {
    const q = question.trim()
    if (!q || sending) return { ok: false }
    if (!docCount) return { ok: false, error: 'Upload at least one PDF first.' }
    const id = ensureActive()
    const userMsg = { id: `m_${Date.now()}_u`, role: 'user', content: q, ts: Date.now() }
    let historyForApi = []
    setConversations((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const next = [...c.messages, userMsg]
      historyForApi = next.filter((m) => !m.error).slice(-7, -1)
        .map((m) => ({ role: m.role, content: m.content }))
      const title = c.messages.length === 0 ? titleFor(q) : c.title
      return { ...c, title, updatedAt: Date.now(), messages: next }
    }))
    setSending(true)
    try {
      const res = await sendChat(q, historyForApi)
      const asst = {
        id: `m_${Date.now()}_a`, role: 'assistant', content: res.answer,
        sources: res.sources || [], found: res.found, ts: Date.now(),
      }
      setConversations((prev) => prev.map((c) =>
        c.id === id ? { ...c, updatedAt: Date.now(), messages: [...c.messages, asst] } : c))
      return { ok: true }
    } catch (err) {
      const emsg = { id: `m_${Date.now()}_e`, role: 'assistant', content: err.message, error: true, ts: Date.now() }
      setConversations((prev) => prev.map((c) =>
        c.id === id ? { ...c, updatedAt: Date.now(), messages: [...c.messages, emsg] } : c))
      return { ok: false, error: err.message }
    } finally {
      setSending(false)
    }
  }, [ensureActive, sending])

  // Retry = drop the last assistant message, resend the question before it.
  const retry = useCallback(async (assistantId, docCount) => {
    const conv = conversations.find((c) => c.id === activeId)
    if (!conv || sending) return
    const idx = conv.messages.findIndex((m) => m.id === assistantId)
    const prevUser = idx > 0 ? conv.messages[idx - 1] : null
    if (!prevUser || prevUser.role !== 'user') return
    setConversations((p) => p.map((c) =>
      c.id === activeId ? { ...c, messages: c.messages.filter((m) => m.id !== assistantId) } : c))
    await ask(prevUser.content, docCount)
  }, [activeId, conversations, sending, ask])

  const renameConversation = useCallback((id, title) => {
    const t = title.trim().slice(0, 80)
    if (!t) return
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: t } : c)))
  }, [])

  const deleteConversation = useCallback((id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    setActiveId((cur) => (cur === id ? null : cur))
  }, [])

  const openConversation = useCallback((id) => setActiveId(id), [])

  return {
    conversations, activeId, active, messages, sending,
    newConversation, openConversation, ask, retry,
    renameConversation, deleteConversation,
  }
}
