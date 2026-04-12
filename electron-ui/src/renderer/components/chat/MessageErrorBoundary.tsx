import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react'
import { getT } from '../../i18n'

interface Props {
  children: ReactNode
  /** Raw text content of the message, used for "Copy Raw" fallback */
  messageContent?: string
}

interface State {
  hasError: boolean
  error: Error | null
  copied: boolean
}

/**
 * Lightweight per-message ErrorBoundary for crash isolation (Iteration 308).
 *
 * Unlike the top-level ErrorBoundary, this does NOT auto-retry because message
 * render failures are typically caused by malformed content that won't change
 * between retries. Instead it offers:
 * - "Copy Raw" to let users recover the AI's text response
 * - "Retry" for manual re-render attempt
 *
 * Design goal: A single bad message (e.g., malformed markdown table, huge code
 * block, invalid Unicode) should NOT crash the entire ChatPanel. Only the
 * offending message shows a compact error placeholder; all other messages
 * remain functional.
 */
export default class MessageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, copied: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[MessageErrorBoundary] Single message render failed:', error, errorInfo)
  }

  handleCopyRaw = (): void => {
    const content = this.props.messageContent || ''
    navigator.clipboard.writeText(content).then(() => {
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    }).catch(() => {})
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    const t = getT()
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.20)',
          borderRadius: 8,
          fontSize: 12,
          margin: '4px 0',
        }}
      >
        <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#fca5a5' }}>{t('error.messageRenderFailed')}</span>
        <button
          onClick={this.handleCopyRaw}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px',
            background: this.state.copied ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 6,
            color: this.state.copied ? '#4ade80' : '#fca5a5',
            cursor: 'pointer',
            fontSize: 11,
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.20)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
        >
          <Copy size={11} />
          {this.state.copied ? t('error.copied') : t('error.copyRaw')}
        </button>
        <button
          onClick={this.handleRetry}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            border: 'none',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.95)',
            cursor: 'pointer',
            fontSize: 11,
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(0.95)'
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = ''
            e.currentTarget.style.transform = ''
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <RefreshCw size={11} />
          {t('error.retryRender')}
        </button>
      </div>
    )
  }
}
