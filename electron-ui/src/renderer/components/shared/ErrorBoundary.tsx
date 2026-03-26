import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackLabel?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    // Log to console so it shows in DevTools
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
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
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    const label = this.props.fallbackLabel || 'component'

    return (
      <div
        style={{
          padding: '16px',
          margin: '8px',
          background: 'var(--bg-secondary, #252526)',
          border: '1px solid var(--error, #f44747)',
          borderRadius: '6px',
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
            background: 'var(--bg-primary, #1e1e1e)',
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={this.handleDismiss}
            style={{
              padding: '4px 12px',
              background: 'var(--accent, #0e639c)',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Dismiss
          </button>
          <button
            onClick={this.handleReload}
            style={{
              padding: '4px 12px',
              background: 'var(--bg-primary, #1e1e1e)',
              border: '1px solid var(--border, #3a3a3a)',
              borderRadius: '4px',
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
              padding: '4px 12px',
              background: 'var(--bg-primary, #1e1e1e)',
              border: '1px solid var(--border, #3a3a3a)',
              borderRadius: '4px',
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
