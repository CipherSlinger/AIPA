import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackLabel?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  retryCount: number
  autoRetrying: boolean
}

const MAX_AUTO_RETRIES = 2
const AUTO_RETRY_DELAY = 800

export default class ErrorBoundary extends Component<Props, State> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, retryCount: 0, autoRetrying: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    // Log to console so it shows in DevTools
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)

    // Auto-retry for transient errors (like Maximum update depth exceeded)
    if (this.state.retryCount < MAX_AUTO_RETRIES) {
      this.setState({ autoRetrying: true })
      this.retryTimer = setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          error: null,
          errorInfo: null,
          retryCount: prev.retryCount + 1,
          autoRetrying: false,
        }))
      }, AUTO_RETRY_DELAY)
    }
  }

  componentWillUnmount(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
    }
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleCopyError = (): void => {
    const text = [
      `Error: ${this.state.error?.message}`,
      this.state.error?.stack,
      this.state.errorInfo?.componentStack,
    ].filter(Boolean).join('\n\n')
    navigator.clipboard.writeText(text).catch(() => {})
  }

  handleDismiss = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, retryCount: 0, autoRetrying: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    // During auto-retry, show a brief loading state instead of the error
    if (this.state.autoRetrying) {
      return (
        <div
          style={{
            padding: '16px',
            margin: '8px',
            background: 'var(--popup-bg, #252526)',
            borderRadius: '6px',
            color: 'var(--text-muted, #858585)',
            fontSize: '12px',
            textAlign: 'center',
          }}
        >
          Recovering...
        </div>
      )
    }

    const label = this.props.fallbackLabel || 'component'
    const hasRetried = this.state.retryCount > 0

    return (
      <div
        style={{
          padding: '16px',
          margin: '8px',
          background: 'var(--popup-bg, #252526)',
          border: '1px solid var(--error, #f44747)',
          borderRadius: '8px',
          color: 'var(--text-primary, #cccccc)',
          fontSize: '13px',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--error, #f44747)' }}>
          Something went wrong in {label}
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            background: 'var(--card-bg, #1e1e1e)',
            padding: '8px',
            borderRadius: '4px',
            marginBottom: '12px',
            maxHeight: '120px',
            overflowY: 'auto',
            color: 'var(--text-muted, #858585)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {this.state.error?.message || 'Unknown error'}
        </div>
        {hasRetried && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #858585)', marginBottom: '8px' }}>
            Auto-recovery failed after {this.state.retryCount} attempt{this.state.retryCount > 1 ? 's' : ''}.
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={this.handleDismiss}
            style={{
              padding: '6px 14px',
              background: 'var(--accent, #0e639c)',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            Retry
          </button>
          <button
            onClick={this.handleReload}
            style={{
              padding: '6px 14px',
              background: 'var(--card-bg, #1e1e1e)',
              border: '1px solid var(--popup-border, #3a3a3a)',
              borderRadius: '6px',
              color: 'var(--text-primary, #ccc)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Reload App
          </button>
          <button
            onClick={this.handleCopyError}
            style={{
              padding: '6px 14px',
              background: 'var(--card-bg, #1e1e1e)',
              border: '1px solid var(--popup-border, #3a3a3a)',
              borderRadius: '6px',
              color: 'var(--text-primary, #ccc)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Copy Error
          </button>
        </div>
      </div>
    )
  }
}
