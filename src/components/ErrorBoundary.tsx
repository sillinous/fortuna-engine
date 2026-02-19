/**
 * Fortuna Engine — Error Boundary
 * 
 * Catches React runtime errors and shows a recovery UI
 * instead of a black screen. Users can retry or navigate away.
 */

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackView?: string
  onNavigate?: (view: string) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: '' }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Fortuna] View crashed:', error, errorInfo)
    this.setState({ errorInfo: errorInfo.componentStack || '' })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: '' })
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: '' })
    this.props.onNavigate?.('dashboard')
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh', padding: 32, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{
            fontSize: 20, fontWeight: 600, color: 'var(--text-primary)',
            marginBottom: 8, fontFamily: 'var(--font-display)',
          }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, maxWidth: 400, lineHeight: 1.5 }}>
            This view encountered an error. Your data is safe — nothing was lost.
          </p>
          
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', color: '#0a0e1a',
              }}
            >
              Try Again
            </button>
            <button
              onClick={this.handleGoHome}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)',
              }}
            >
              Go to Dashboard
            </button>
          </div>

          <details style={{ textAlign: 'left', maxWidth: 500, width: '100%' }}>
            <summary style={{ color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', marginBottom: 8 }}>
              Error details
            </summary>
            <pre style={{
              fontSize: 10, color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 8,
              padding: 12, overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-mono)',
            }}>
              {this.state.error?.toString()}
              {this.state.errorInfo && `\n\nComponent Stack:${this.state.errorInfo}`}
            </pre>
          </details>
        </div>
      )
    }

    return this.props.children
  }
}
