/**
 * Chat header action: "Related conversations".
 *
 * Asks the main process to search the local transcripts for other conversations
 * that share words with the open one, and lists the strongest few. The relation
 * is lexical — same words, not same meaning — and the popover says so instead
 * of letting the list imply a semantic match it cannot make.
 *
 * The button is self-contained: it reads the conversation from the chat store
 * and writes nothing back. Opening a row goes through `openSessionCore`, the
 * same path the department and archive views use.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Network } from 'lucide-react'
import { useI18n, useT } from '../../i18n'
import { useChatStore, useDepartmentStore, useSessionStore, useUiStore } from '../../store'
import { useClickOutside } from '../../hooks/useClickOutside'
import {
  deptByNormDir,
  deptBySlug,
  findDeptForSession,
  formatRelativeTime,
} from '../departments/deptUtils'
import { openSessionCore } from '../departments/openSessionCore'
import type { SessionListItem } from '../../types/app.types'
import {
  buildRelatedText,
  readRelatedReply,
  relatedRowKeys,
  type RelatedRowView,
  type RelatedView,
} from './relatedConversations'

interface Props {
  headerBtnStyle: React.CSSProperties
  hoverIn: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean) => void
  hoverOut: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean, defaultColor?: string) => void
}

/** At most this many rows; main enforces the same number server-side. */
const RELATED_LIMIT = 4

export default function RelatedConversationsButton({
  headerBtnStyle,
  hoverIn,
  hoverOut,
}: Props) {
  const t = useT()
  const { resolvedLocale } = useI18n()
  // The conversation on screen. `viewSessionId`, not `currentSessionId`: a
  // flushing delta writes the bridge id into the latter, so it can stop naming
  // the conversation the user is looking at. It is only used to exclude the
  // open session from its own results.
  const sessionId = useChatStore(s => s.viewSessionId)
  const messages = useChatStore(s => s.messages)
  const isStreaming = useChatStore(s => s.isStreaming)
  const sessions = useSessionStore(s => s.sessions)

  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [view, setView] = useState<RelatedView | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // Only the newest request may write state; a slow reply for a popover the
  // user already closed (or replaced) must not flash stale rows.
  const requestRef = useRef(0)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(wrapRef, open, close)

  // Built once per message-list change, not once per poll: term extraction,
  // not rendering, is the expensive part.
  const built = useMemo(() => buildRelatedText(messages), [messages])
  const messageCount = messages.length
  const disabled = !sessionId || messageCount === 0 || isStreaming || built.text.length === 0

  let disabledTitle: string
  if (!sessionId) disabledTitle = t('chat.related.disabledNoSession')
  else if (messageCount === 0) disabledTitle = t('chat.related.disabledEmpty')
  else if (isStreaming) disabledTitle = t('chat.related.streaming')
  else if (built.text.length === 0) disabledTitle = t('chat.related.noTerms')
  else disabledTitle = t('chat.related.hint')

  // A live stream or a session switch makes the previous list meaningless;
  // close and invalidate rather than leaving rows that no longer describe the
  // conversation on screen.
  useEffect(() => {
    if (!disabled) return
    requestRef.current += 1
    setPending(false)
    setOpen(false)
  }, [disabled])

  useEffect(() => () => { requestRef.current += 1 }, [])

  const load = useCallback(() => {
    const seq = ++requestRef.current
    setPending(true)
    setView(null)
    const api = window.electronAPI
    if (!api?.sessionRelated) {
      setPending(false)
      setView({ state: 'error' })
      return
    }
    Promise.resolve(api.sessionRelated({
      text: built.text,
      excludeSessionId: sessionId ?? undefined,
      limit: RELATED_LIMIT,
    }))
      .then(reply => {
        if (requestRef.current === seq) setView(readRelatedReply(reply))
      })
      .catch(() => {
        if (requestRef.current === seq) setView({ state: 'error' })
      })
      .finally(() => {
        if (requestRef.current === seq) setPending(false)
      })
  }, [built.text, sessionId])

  const toggle = useCallback(() => {
    if (disabled) return
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    load()
  }, [disabled, load, open])

  const sessionFor = useCallback((id: string): SessionListItem | undefined => {
    return sessions.find(session => session.sessionId === id)
  }, [sessions])

  /**
   * Open one related conversation. A row whose id is absent from the sidebar
   * listing is shown inert — the transcript index can remember sessions this
   * machine no longer lists, and opening a guessed id would load the wrong
   * conversation or fail with no explanation.
   */
  const openRow = useCallback((row: RelatedRowView) => {
    // Read the listing at click time, not from a render snapshot: the sidebar
    // may have refreshed since the popover was painted.
    const session = useSessionStore.getState().sessions
      .find(candidate => candidate.sessionId === row.sessionId)
    if (!session) return
    const departmentsNow = useDepartmentStore.getState().departments
    const homeDirNow = useSessionStore.getState().homeDir
    const department = findDeptForSession(
      session,
      deptBySlug(departmentsNow),
      deptByNormDir(departmentsNow, homeDirNow),
      homeDirNow,
    )
    void openSessionCore(session, department?.directory ?? '').catch(() => {
      useUiStore.getState().addToast('error', t('chat.related.failedToast'))
    })
    close()
  }, [close, t])

  const readyRows = view !== null && view.state === 'ready' ? view.rows : null
  const indexing = view !== null && (view.state === 'ready' || view.state === 'empty')
    ? view.indexing
    : false

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open && !disabled}
        aria-label={disabledTitle}
        title={disabledTitle}
        data-related-conversations
        style={{
          ...headerBtnStyle,
          background: open ? 'rgba(99,102,241,0.15)' : headerBtnStyle.background,
          color: open ? '#818cf8' : headerBtnStyle.color,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.3 : 1,
        }}
        onMouseEnter={e => { if (!disabled) hoverIn(e, open) }}
        onMouseLeave={e => { if (!disabled) hoverOut(e, open) }}
      >
        {pending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Network size={15} />}
      </button>

      {open && !disabled && (
        <div
          role="dialog"
          aria-label={t('chat.related.title')}
          aria-busy={pending}
          data-related-popover
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 340,
            maxHeight: '70vh',
            overflowY: 'auto',
            padding: 12,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 260,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Network size={14} color="#818cf8" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('chat.related.title')}
            </span>
          </div>

          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('chat.related.lexicalNotice')}
          </div>

          {indexing && view?.state !== 'noTerms' && (
            <div
              data-related-building
              style={{ fontSize: 10.5, color: 'var(--warning-text)', lineHeight: 1.5 }}
            >
              {t('chat.related.building')}
            </div>
          )}

          {pending && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '14px 0',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              {t('chat.related.label')}
            </div>
          )}

          {!pending && view?.state === 'empty' && (
            <div data-related-empty style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, padding: '4px 0' }}>
              {t('chat.related.empty')}
            </div>
          )}

          {!pending && view?.state === 'noTerms' && (
            <div data-related-noterms style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, padding: '4px 0' }}>
              {t('chat.related.noTerms')}
            </div>
          )}

          {!pending && view?.state === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {t('chat.related.error')}
              </div>
              <button
                type="button"
                onClick={load}
                data-related-retry
                style={{
                  alignSelf: 'flex-start',
                  padding: '4px 11px',
                  fontSize: 11.5,
                  background: 'var(--bg-hover)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t('chat.related.retry')}
              </button>
            </div>
          )}

          {!pending && readyRows !== null && (() => {
            const rows = readyRows
            const keys = relatedRowKeys(rows)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {rows.map((row, index) => {
                  const session = sessionFor(row.sessionId)
                  const listed = Boolean(session)
                  return (
                    <div
                      key={keys[index]}
                      data-related-row={row.sessionId}
                      data-related-listed={listed ? 'true' : 'false'}
                      role={listed ? 'button' : undefined}
                      tabIndex={listed ? 0 : undefined}
                      title={listed ? undefined : t('chat.related.unlisted')}
                      onClick={() => { if (listed) openRow(row) }}
                      onKeyDown={e => {
                        if (!listed) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openRow(row)
                        }
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        padding: '7px 8px',
                        borderRadius: 7,
                        border: '1px solid transparent',
                        cursor: listed ? 'pointer' : 'default',
                        opacity: listed ? 1 : 0.62,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        if (!listed) return
                        e.currentTarget.style.background = 'var(--bg-hover)'
                        e.currentTarget.style.borderColor = 'var(--border)'
                      }}
                      onMouseLeave={e => {
                        if (!listed) return
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderColor = 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          minWidth: 0,
                        }}>
                          {row.title.trim() || t('chat.related.untitled')}
                        </span>
                        <span style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          color: row.engine === 'codex' ? 'rgba(34,197,94,0.9)' : 'rgba(129,140,248,0.95)',
                          background: row.engine === 'codex' ? 'rgba(34,197,94,0.10)' : 'rgba(99,102,241,0.12)',
                          border: `1px solid ${row.engine === 'codex' ? 'rgba(34,197,94,0.24)' : 'rgba(99,102,241,0.28)'}`,
                          borderRadius: 8,
                          padding: '1px 6px',
                          flexShrink: 0,
                          textTransform: 'uppercase',
                        }}>
                          {row.engine}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                        <span>{formatRelativeTime(row.timestamp, t, resolvedLocale)}</span>
                        <span>{t('chat.related.terms', { count: row.termsHit })}</span>
                      </div>

                      {row.matchedTerms.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.matchedTerms.map((term, termIndex) => (
                            <span
                              key={`${termIndex}-${term}`}
                              style={{
                                fontSize: 10,
                                color: 'var(--text-secondary)',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                padding: '0 5px',
                                lineHeight: 1.6,
                              }}
                            >
                              {term}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
