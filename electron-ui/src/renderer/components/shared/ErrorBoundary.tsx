import React, { Component, ErrorInfo, ReactNode } from 'react'
import { useChatStore } from '../../store'
import { getT } from '../../i18n'

interface Props {
  children: ReactNode
  fallbackLabel?: string
  /** When true, error UI is shown as a floating banner instead of replacing children */
  overlay?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  retryCount: number
  autoRetrying: boolean
  recoveryFailed: boolean
}

const MAX_AUTO_RETRIES = 3
const CRASH_BACKUP_KEY = 'aipa_crash_backup'
const RECOVERY_COOLDOWN_MS = 2000
// Exponential backoff: 500ms, 1500ms, 4500ms
const getRetryDelay = (attempt: number) => 500 * Math.pow(3, attempt)

/**
 * Error boundary with auto-recovery, state protection, and crash diagnostics.
 *
 * Iteration 301: Exponential backoff to avoid tight retry loops.
 * Iteration 308: Added crash recovery (sessionStorage backup/restore),
 *   per-message isolation (separate MessageErrorBoundary), and structured
 *   diagnostic output in "Copy Error" for faster bug triage.
 *
 * NOTE: This is a class component (React requirement for error boundaries).
 * It accesses Zustand store directly via useChatStore.getState() because
 * hooks cannot be used in class components.
 */
export default class ErrorBoundary extends Component<Props, State> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private lastRestoreTimestamp = 0
  private failedRestoreCount = 0

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      autoRetrying: false,
      recoveryFailed: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    console.error('[ErrorBoundary] Caught error:', error.message)

    // STABILITY (Iteration 308): Back up conversation state to sessionStorage
    // so it can be restored after recovery. This is the safety net that prevents
    // users from losing their entire conversation when the chat panel crashes.
    this.backupMessages()

    // Auto-retry for transient errors (like Maximum update depth exceeded)
    if (this.state.retryCount < MAX_AUTO_RETRIES) {
      this.setState({ autoRetrying: true })
      const delay = getRetryDelay(this.state.retryCount)
      this.retryTimer = setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          error: null,
          errorInfo: null,
          retryCount: prev.retryCount + 1,
          autoRetrying: false,
        }))
      }, delay)
    }
  }

  componentWillUnmount(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
    }
  }

  /** Back up current messages to sessionStorage for crash recovery */
  private backupMessages(): void {
    try {
      const messages = useChatStore.getState().messages
      if (messages.length === 0) return
      // Only keep last 100 messages to stay within sessionStorage 5MB limit
      const toBackup = messages.length > 100 ? messages.slice(-100) : messages
      sessionStorage.setItem(CRASH_BACKUP_KEY, JSON.stringify(toBackup))
    } catch (e) {
      console.warn('[ErrorBoundary] Failed to back up messages:', e)
    }
  }

  /** Attempt to restore messages from sessionStorage backup */
  private restoreMessages(): boolean {
    try {
      const backup = sessionStorage.getItem(CRASH_BACKUP_KEY)
      if (!backup) return false

      // Anti-infinite-loop: if we restored recently and crashed again, don't restore
      const now = Date.now()
      if (now - this.lastRestoreTimestamp < RECOVERY_COOLDOWN_MS) {
        this.failedRestoreCount++
        if (this.failedRestoreCount >= 3) {
          this.setState({ recoveryFailed: true })
          sessionStorage.removeItem(CRASH_BACKUP_KEY)
          return false
        }
      }

      const parsed = JSON.parse(backup)
      if (!Array.isArray(parsed)) return false

      useChatStore.getState().setMessages(parsed)
      this.lastRestoreTimestamp = now
      sessionStorage.removeItem(CRASH_BACKUP_KEY)
      return true
    } catch (e) {
      console.warn('[ErrorBoundary] Failed to restore messages:', e)
      return false
    }
  }

  handleReload = (): void => {
    window.location.reload()
  }

  /**
   * ENHANCED (Iteration 308): Copy structured diagnostic information.
   * Includes context metadata but NOT user conversation content (privacy).
   */
  handleCopyError = (): void => {
    const store = useChatStore.getState()
    const messages = store.messages
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null
    const isStreaming = store.isStreaming
    const sessionId = store.currentSessionId

    // Memory info (Chrome/Electron only)
    let memoryInfo = 'N/A'
    try {
      const perf = (performance as any)
      if (perf.memory) {
        const used = (perf.memory.usedJSHeapSize / 1048576).toFixed(1)
        const total = (perf.memory.totalJSHeapSize / 1048576).toFixed(1)
        memoryInfo = `${used} MB / ${total} MB`
      }
    } catch { /* not available */ }

    const diagnostic = [
      '=== AIPA Crash Diagnostic ===',
      `Error: ${this.state.error?.message || 'Unknown'}`,
      '',
      'Context:',
      `  Messages: ${messages.length}`,
      `  Streaming: ${isStreaming ? 'yes' : 'no'}`,
      `  Session ID: ${sessionId || 'none'}`,
      `  Viewport: ${window.innerWidth} x ${window.innerHeight}`,
      `  Memory: ${memoryInfo}`,
      `  Last Message Type: ${lastMsg?.role || 'none'}`,
      `  Auto-retry Count: ${this.state.retryCount}/${MAX_AUTO_RETRIES}`,
      '',
      'Component Stack:',
      this.state.errorInfo?.componentStack || '(not available)',
      '',
      'Stack Trace:',
      this.state.error?.stack || '(not available)',
    ].join('\n')

    navigator.clipboard.writeText(diagnostic).catch(() => {})
  }

  handleDismiss = (): void => {
    // Attempt to restore backed-up messages before clearing the error
    this.restoreMessages()
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      autoRetrying: false,
    })
  }

  handleNewConversation = (): void => {
    sessionStorage.removeItem(CRASH_BACKUP_KEY)
    useChatStore.getState().clearMessages()
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      autoRetrying: false,
      recoveryFailed: false,
    })
    this.failedRestoreCount = 0
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    // During auto-retry, show a brief loading state instead of the error
    if (this.state.autoRetrying) {
      const t = getT()
      // In overlay mode, show a placeholder instead of children during retry
      // (rendering children would immediately re-throw the same error, creating an infinite loop)
      if (this.props.overlay) {
        return (
          <div
            style={{
              position: 'fixed',
              top: 40,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '8px 20px',
              background: 'var(--popup-bg, #252526)',
              border: '1px solid var(--warning, #cca700)',
              borderRadius: '8px',
              color: 'var(--text-muted, #858585)',
              fontSize: '12px',
              textAlign: 'center',
              zIndex: 10000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            {t('error.recovering', { current: String(this.state.retryCount + 1), max: String(MAX_AUTO_RETRIES) })}
          </div>
        )
      }
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
          {t('error.recovering', { current: String(this.state.retryCount + 1), max: String(MAX_AUTO_RETRIES) })}
        </div>
      )
    }

    const t = getT()
    const label = this.props.fallbackLabel || 'component'
    const hasRetried = this.state.retryCount > 0
    const { recoveryFailed } = this.state

    // Overlay mode: show a compact floating banner instead of replacing all content
    // This lets the user still access other features (sidebar, settings, etc.)
    if (this.props.overlay) {
      return (
        <>
          {/* Render children in a degraded state — they'll be in their last good render */}
          <div style={{ opacity: 0.3, pointerEvents: 'none', filter: 'grayscale(0.5)', height: '100%' }}>
            {/* Can't render children (would re-trigger error), show placeholder */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted, #858585)', fontSize: 14 }}>
              {t('error.appDegraded')}
            </div>
          </div>
          {/* Floating error banner */}
          <div
            style={{
              position: 'fixed',
              top: 40,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '90%',
              maxWidth: 480,
              background: 'var(--popup-bg, #252526)',
              border: '1px solid var(--error, #f44747)',
              borderRadius: '10px',
              color: 'var(--text-primary, #cccccc)',
              fontSize: '13px',
              padding: '14px 18px',
              zIndex: 10000,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--error, #f44747)', fontSize: 14 }}>
              {t('error.titleIn', { label })}
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '10px',
                background: 'var(--card-bg, #1e1e1e)',
                padding: '6px 8px',
                borderRadius: '4px',
                marginBottom: '10px',
                maxHeight: '60px',
                overflowY: 'auto',
                color: 'var(--text-muted, #858585)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error?.message || t('error.unknownError')}
            </div>
            {hasRetried && (
              <div style={{ fontSize: '10px', color: 'var(--text-muted, #858585)', marginBottom: '6px' }}>
                {t('error.autoRecoveryFailed', { count: String(this.state.retryCount) })}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {!recoveryFailed && (
                <button
                  onClick={this.handleDismiss}
                  style={{
                    padding: '5px 12px',
                    background: 'var(--accent, #0e639c)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  {t('error.retryRender')}
                </button>
              )}
              <button
                onClick={this.handleNewConversation}
                style={{
                  padding: '5px 12px',
                  background: 'var(--accent, #0e639c)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {t('error.startNewConversation')}
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '5px 12px',
                  background: 'var(--card-bg, #1e1e1e)',
                  border: '1px solid var(--popup-border, #3a3a3a)',
                  borderRadius: '6px',
                  color: 'var(--text-primary, #ccc)',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {t('error.reload')}
              </button>
              <button
                onClick={this.handleCopyError}
                style={{
                  padding: '5px 12px',
                  background: 'var(--card-bg, #1e1e1e)',
                  border: '1px solid var(--popup-border, #3a3a3a)',
                  borderRadius: '6px',
                  color: 'var(--text-primary, #ccc)',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {t('error.copyError')}
              </button>
            </div>
          </div>
        </>
      )
    }

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
          {t('error.titleIn', { label })}
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
          {this.state.error?.message || t('error.unknownError')}
        </div>
        {hasRetried && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #858585)', marginBottom: '8px' }}>
            {t('error.autoRecoveryFailed', { count: String(this.state.retryCount) })}
          </div>
        )}
        {recoveryFailed && (
          <div style={{ fontSize: '11px', color: 'var(--warning, #cca700)', marginBottom: '8px' }}>
            {t('error.recoveryFailed')}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!recoveryFailed && (
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
              {t('error.retryRender')}
            </button>
          )}
          {recoveryFailed && (
            <button
              onClick={this.handleNewConversation}
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
              {t('error.startNewConversation')}
            </button>
          )}
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
            {t('error.reload')}
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
            {t('error.copyError')}
          </button>
        </div>
      </div>
    )
  }
}
