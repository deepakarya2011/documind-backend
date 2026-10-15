// Toast stack (success / error) + context-free push helper.
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

const ToastCtx = createContext({ push: () => {} })
export const useToast = () => useContext(ToastCtx)

let seq = 0

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])

  const dismiss = useCallback((id) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((message, kind = 'info') => {
    const id = ++seq
    setItems((prev) => [...prev.slice(-3), { id, message, kind }])
    setTimeout(() => dismiss(id), 6000)
  }, [dismiss])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind === 'error' ? 'error' : t.kind === 'success' ? 'success' : ''}`}>
            {t.kind === 'success'
              ? <CheckCircle2 size={16} />
              : t.kind === 'error' ? <AlertCircle size={16} /> : null}
            <span className="toast-msg">{t.message}</span>
            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
