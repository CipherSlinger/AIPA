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
  detailsExpanded: boolean
  isPermanent: boolean
}

const MAX_AUTO_RETRIES = 3
const CRASH_BACKUP_KEY = 'aipa_crash_backup'
const RECOVERY_COOLDOWN_MS = 2000
const GITHUB_ISSUES_URL = 'https://github.com/anthropics/claude-code/issues/new'
// Exponential backoff: 500ms, 1500ms, 4500ms
const getRetryDelay = (attempt: number) => 500 * Math.pow(3, attempt)

/**
 * Determine whether an error is permanent (code bug) vs transient (runtime glitch).
 * Permanent errors skip auto-retry because they will always fail.
 *
 * Iteration 513: Added classification to avoid 6.5s of wasted retry time
 * for errors that are clearly caused by code bugs.
 */
function isPermanentError(error: Error): boolean {
  // ReferenceError: X is not defined — code bug, retry won't help
  if (error instanceof ReferenceError) return true
  // SyntaxError — code corruption, retry won't help
  if (error instanceof SyntaxError) return true
  // TypeError with common patterns indicating code bugs
  if (error instanceof TypeError) {
    const msg = error.message
    if (
      msg.includes('Cannot read properties of undefined') ||
      msg.includes('Cannot read properties of null') ||
      msg.includes('is not a function') ||
      msg.includes('is not defined')
    ) {
      return true
    }
  }
  return false
}

/**
 * Error boundary with auto-recovery, state protection, and crash diagnostics.
 *
 * Iteration 301: Exponential backoff to avoid tight retry loops.
 * Iteration 308: Added crash recovery (sessionStorage backup/restore),
 *   per-message isolation (separate MessageErrorBoundary), and structured
 *   diagnostic output in "Copy Error" for faster bug triage.
 * Iteration 513: Permanent error classification (skip retry for ReferenceError/
 *   TypeError/SyntaxError), expandable technical details, and Report Bug button.
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
      detailsExpanded: false,
      isPermanent: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, isPermanent: isPermanentError(error) }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    const permanent = isPermanentError(error)
    console.error('[ErrorBoundary] Caught error:', error.message, permanent ? '(permanent)' : '(transient)')
    console.error('[ErrorBoundary] Stack:', errorInfo.componentStack)

    // STABILITY (Iteration 308): Back up conversation state to sessionStorage
    // so it can be restored after recovery. This is the safety net that prevents
    // users from losing their entire conversation when the chat panel crashes.
    this.backupMessages()

    // Iteration 513: Skip auto-retry for permanent errors (code bugs).
    // These will always fail, so retrying wastes 6.5s of user time.
    if (permanent) {
      return
    }

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
          isPermanent: false,
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

  /** Build structured diagnostic text for bug reports */
  private buildDiagnosticText(): string {
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

    return [
      '=== AIPA Crash Diagnostic ===',
      `Error: ${this.state.error?.message || 'Unknown'}`,
      `Error Type: ${this.state.error?.constructor?.name || 'Error'}`,
      `Classification: ${this.state.isPermanent ? 'Permanent (code bug)' : 'Transient'}`,
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
  }

  /**
   * ENHANCED (Iteration 308, 513): Copy structured diagnostic information.
   * Includes context metadata but NOT user conversation content (privacy).
   */
  handleCopyError = (): void => {
    navigator.clipboard.writeText(this.buildDiagnosticText()).catch(() => {})
  }

  /** Copy diagnostic info to clipboard and open GitHub issues page */
  handleReportBug = (): void => {
    const diagnostic = this.buildDiagnosticText()
    navigator.clipboard.writeText(diagnostic).catch(() => {})
    const title = encodeURIComponent(`[Crash] ${this.state.error?.message || 'Unknown error'}`)
    const body = encodeURIComponent(
      `## Crash Report\n\nPlease paste the diagnostic info from your clipboard below:\n\n\`\`\`\n(paste diagnostic info here)\n\`\`\`\n\n## Steps to reproduce\n\n1. \n2. \n3. \n`
    )
    window.open(`${GITHUB_ISSUES_URL}?title=${title}&body=${body}`, '_blank')
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
      detailsExpanded: false,
      isPermanent: false,
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
      detailsExpanded: false,
      isPermanent: false,
    })
    this.failedRestoreCount = 0
  }

  toggleDetails = (): void => {
    this.setState(prev => ({ detailsExpanded: !prev.detailsExpanded }))
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
              background: 'var(--glass-bg-raised)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              color: 'var(--text-muted)',
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
            background: 'var(--glass-bg-low)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--glass-border)',
            borderRadius: '6px',
            color: 'var(--text-muted)',
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
    const { recoveryFailed, isPermanent, detailsExpanded } = this.state

    // Human-readable error description
    const errorSummary = isPermanent
      ? t('error.permanentDesc')
      : hasRetried
        ? t('error.autoRecoveryFailed', { count: String(this.state.retryCount) })
        : ''
    const retryLabel = hasRetried ? t('error.tryAgain') : t('error.retryRender')

    // --- Shared sections used in both overlay and inline modes ---
    const errorMessageBlock = (fontSize: string, maxHeight: string, marginBottom: string) => (
      <div
        style={{
          fontFamily: 'monospace',
          fontSize,
          background: 'rgba(239,68,68,0.08)',
          padding: '6px 8px',
          borderRadius: '4px',
          marginBottom,
          maxHeight,
          overflowY: 'auto' as const,
          color: '#fca5a5',
          whiteSpace: 'pre-wrap' as const,
          wordBreak: 'break-word' as const,
        }}
      >
        {this.state.error?.message || t('error.unknownError')}
      </div>
    )

    const statusLine = (fontSize: string) => (
      <>
        {errorSummary && (
          <div style={{ fontSize, color: isPermanent ? '#fca5a5' : 'var(--text-muted)', marginBottom: '6px' }}>
            {errorSummary}
          </div>
        )}
        {recoveryFailed && (
          <div style={{ fontSize, color: '#fca5a5', marginBottom: '6px' }}>
            {t('error.recoveryFailed')}
          </div>
        )}
      </>
    )

    const detailsSection = (fontSize: string) => (
      <div style={{ marginBottom: '8px' }}>
        <button
          onClick={this.toggleDetails}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize,
            padding: 0,
            textDecoration: 'underline',
            marginBottom: '4px',
          }}
        >
          {detailsExpanded ? t('error.hideDetails') : t('error.showDetails')}
        </button>
        {detailsExpanded && (
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              background: 'rgba(239,68,68,0.08)',
              padding: '8px',
              borderRadius: '4px',
              marginTop: '4px',
              maxHeight: '150px',
              overflowY: 'auto',
              color: '#fca5a5',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <div style={{ marginBottom: '4px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {this.state.error?.constructor?.name || 'Error'}
            </div>
            {this.state.errorInfo?.componentStack || '(no component stack)'}
          </div>
        )}
      </div>
    )

    const btnStyle = (bg: string, border?: string): React.CSSProperties => ({
      padding: '5px 12px',
      background: bg,
      border: border || 'none',
      borderRadius: '6px',
      color: border ? 'var(--text-primary)' : 'rgba(255,255,255,0.95)',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: border ? 400 : 500,
    })

    const actionButtons = (gap: string) => (
      <div style={{ display: 'flex', gap, flexWrap: 'wrap' }}>
        {!recoveryFailed && (
          <button onClick={this.handleDismiss} style={btnStyle('linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))')}>
            {retryLabel}
          </button>
        )}
        <button onClick={this.handleNewConversation} style={btnStyle('linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))')}>
          {t('error.startNewConversation')}
        </button>
        <button onClick={this.handleReportBug} style={btnStyle('rgba(239,68,68,0.08)', '1px solid rgba(239,68,68,0.25)')}>
          {t('error.reportBug')}
        </button>
        <button onClick={this.handleReload} style={btnStyle('rgba(255,255,255,0.05)', '1px solid var(--glass-border)')}>
          {t('error.reload')}
        </button>
        <button onClick={this.handleCopyError} style={btnStyle('rgba(255,255,255,0.05)', '1px solid var(--glass-border)')}>
          {t('error.copyError')}
        </button>
      </div>
    )

    // Overlay mode: show a compact floating banner instead of replacing all content
    // This lets the user still access other features (sidebar, settings, etc.)
    if (this.props.overlay) {
      return (
        <>
          {/* Render children in a degraded state -- they'll be in their last good render */}
          <div style={{ opacity: 0.3, pointerEvents: 'none', filter: 'grayscale(0.5)', height: '100%' }}>
            {/* Can't render children (would re-trigger error), show placeholder */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
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
              background: 'var(--glass-bg-raised)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              padding: '14px 18px',
              zIndex: 10000,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '6px', color: '#fca5a5', fontSize: 14 }}>
              {t('error.titleIn', { label })}
            </div>
            {errorMessageBlock('10px', '60px', '8px')}
            {statusLine('10px')}
            {detailsSection('10px')}
            {actionButtons('6px')}
          </div>
        </>
      )
    }

    return (
      <div
        style={{
          padding: '16px',
          margin: '8px',
          background: 'rgba(239,68,68,0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '8px',
          color: '#fca5a5',
          fontSize: '13px',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '8px', color: '#fca5a5' }}>
          {t('error.titleIn', { label })}
        </div>
        {errorMessageBlock('11px', '120px', '10px')}
        {statusLine('11px')}
        {detailsSection('11px')}
        {actionButtons('8px')}
      </div>
    )
  }
}
