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
          background: 'var(--popup-bg, #252526)',
          border: '1px solid rgba(244, 71, 71, 0.3)',
          borderRadius: 8,
          color: 'var(--text-muted, #858585)',
          fontSize: 12,
          margin: '4px 0',
        }}
      >
        <AlertTriangle size={14} style={{ color: 'var(--error, #f44747)', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{t('error.messageRenderFailed')}</span>
        <button
          onClick={this.handleCopyRaw}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            background: 'var(--action-btn-bg, #2a2a2a)',
            border: '1px solid var(--action-btn-border, #3a3a3a)',
            borderRadius: 4,
            color: this.state.copied ? 'var(--success, #4ec9b0)' : 'var(--text-primary, #ccc)',
            cursor: 'pointer',
            fontSize: 11,
            flexShrink: 0,
          }}
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
            padding: '4px 10px',
            background: 'var(--action-btn-bg, #2a2a2a)',
            border: '1px solid var(--action-btn-border, #3a3a3a)',
            borderRadius: 4,
            color: 'var(--text-primary, #ccc)',
            cursor: 'pointer',
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          <RefreshCw size={11} />
          {t('error.retryRender')}
        </button>
      </div>
    )
  }
}
