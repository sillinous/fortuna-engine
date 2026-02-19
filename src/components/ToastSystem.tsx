import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'
import {
  CheckCircle2, AlertTriangle, Info, XCircle, X,
} from 'lucide-react'

export interface Toast {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
  message?: string
  duration?: number // ms, 0 = persistent
  actionLabel?: string
  onAction?: () => void
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToasts() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToasts must be used within ToastProvider')
  return ctx
}

let toastCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${++toastCounter}-${Date.now()}`
    setToasts(prev => [...prev.slice(-4), { ...toast, id }]) // max 5
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9997,
      display: 'flex', flexDirection: 'column-reverse', gap: 8,
      pointerEvents: 'none', maxWidth: 380,
    }}>
      {toasts.map((toast, i) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} index={i} />
      ))}
    </div>
  )
}

const typeConfig = {
  success: { icon: <CheckCircle2 size={16} />, color: 'var(--accent-emerald)', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)' },
  warning: { icon: <AlertTriangle size={16} />, color: 'var(--accent-amber)', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' },
  error:   { icon: <XCircle size={16} />, color: 'var(--accent-red)', bg: 'rgba(239,107,107,0.08)', border: 'rgba(239,107,107,0.2)' },
  info:    { icon: <Info size={16} />, color: 'var(--accent-blue)', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)' },
}

function ToastItem({ toast, onRemove, index }: { toast: Toast; onRemove: (id: string) => void; index: number }) {
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(100)
  const duration = toast.duration ?? 4000
  const config = typeConfig[toast.type]

  useEffect(() => {
    if (duration <= 0) return
    const interval = 50
    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += interval
      setProgress(Math.max(0, 100 - (elapsed / duration) * 100))
      if (elapsed >= duration) {
        clearInterval(timer)
        setExiting(true)
        setTimeout(() => onRemove(toast.id), 300)
      }
    }, interval)
    return () => clearInterval(timer)
  }, [duration, toast.id, onRemove])

  const dismiss = () => {
    setExiting(true)
    setTimeout(() => onRemove(toast.id), 300)
  }

  return (
    <div style={{
      pointerEvents: 'auto',
      background: 'var(--bg-elevated)',
      border: `1px solid ${config.border}`,
      borderRadius: 12,
      padding: '12px 14px',
      boxShadow: `0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 ${config.bg}`,
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'flex-start', gap: 10,
      opacity: exiting ? 0 : 1,
      transform: exiting ? 'translateX(40px) scale(0.95)' : 'translateX(0) scale(1)',
      animation: 'toastSlideIn 0.3s var(--ease-spring)',
      transition: 'opacity 0.3s ease-out, transform 0.3s var(--ease-out)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Icon */}
      <div style={{ color: config.color, flexShrink: 0, marginTop: 1 }}>
        {config.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.3 }}>{toast.title}</div>
        {toast.message && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{toast.message}</div>
        )}
        {toast.actionLabel && toast.onAction && (
          <button
            onClick={() => { toast.onAction!(); dismiss() }}
            style={{
              marginTop: 6, padding: '3px 8px', borderRadius: 5,
              background: `${config.color}20`, border: `1px solid ${config.color}40`,
              color: config.color, fontSize: 11, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >
            {toast.actionLabel}
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: 2, flexShrink: 0,
          borderRadius: 4,
        }}
      >
        <X size={13} />
      </button>

      {/* Progress bar */}
      {duration > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
          background: 'rgba(255,255,255,0.03)',
        }}>
          <div style={{
            height: '100%', background: config.color, opacity: 0.5,
            width: `${progress}%`,
            transition: 'width 50ms linear',
          }} />
        </div>
      )}
    </div>
  )
}
