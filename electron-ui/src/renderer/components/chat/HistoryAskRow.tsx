/**
 * The transcript row for "ask your history from this conversation".
 *
 * It is a system row, never a model answer: the answer was retrieved and written
 * in the main process, it never entered this conversation's engine thread, and
 * nothing here is saved with the transcript. The header badge, the muted
 * provenance footer and the ephemeral notice all say so in the row itself
 * rather than leaving the user to infer it.
 *
 * The row owns no retrieval and no run state: `historyAskRun` starts the ask and
 * owns the progress subscription, so this component can unmount (the transcript
 * is virtualised) without cancelling anything.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, History, Square } from 'lucide-react'
import type { HistoryAskNotice, HistoryAskSource } from '../../types/app.types'
import { useT } from '../../i18n'
import { parseAnswerCitations } from '../search/answerCitations'
import { relativeTime } from '../search/SearchResultRow'
import { revealSessionEvidence } from '../search/revealSessionEvidence'
import { historyAskStatusLine, type HistoryAskTone } from './historyAskState'
import { stopHistoryAsk, useLiveHistoryAskNotice } from './historyAskRun'

const CARD_STYLE: React.CSSProperties = {
  maxWidth: 680,
  width: '100%',
  background: 'rgba(139,92,246,0.055)',
  border: '1px solid rgba(139,92,246,0.30)',
  borderRadius: 10,
  padding: '11px 14px 12px',
  boxShadow: 'var(--code-shadow)',
  textAlign: 'left',
}

const CHIP_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 4px',
  margin: '0 1px',
  borderRadius: 4,
  border: '1px solid rgba(139,92,246,0.40)',
  background: 'rgba(139,92,246,0.16)',
  color: 'var(--accent-text)',
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontVariantNumeric: 'tabular-nums',
}

const MUTED_SMALL: React.CSSProperties = {
  fontSize: 10.5,
  color: 'var(--text-faint)',
  lineHeight: 1.5,
}

const TONE_COLOR: Record<HistoryAskTone, string> = {
  running: 'var(--text-muted)',
  success: 'var(--success-text)',
  warning: 'var(--warning-text)',
  error: 'var(--danger-text, #f87171)',
  muted: 'var(--text-muted)',
}

const TONE_DOT: Record<HistoryAskTone, string> = {
  running: 'var(--accent-muted)',
  success: 'var(--success-text)',
  warning: 'var(--warning-text)',
  error: 'var(--danger-text, #f87171)',
  muted: 'var(--text-muted)',
}

/** basename for Windows and POSIX paths, without importing Node's `path`. */
function projectLabel(project: string, fallback: string): string {
  if (!project) return fallback
  const parts = project.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || project
}

interface Props {
  messageId: string
  /** The copy on the message row; the live run map supersedes it while it lasts. */
  notice: HistoryAskNotice
}

export default function HistoryAskRow({ messageId, notice: stored }: Props) {
  const t = useT()
  // A row captured in a tab snapshot stops receiving store updates. The run
  // keeps its notices keyed by message id, so the row still shows the draft and
  // the final outcome after switching back.
  const live = useLiveHistoryAskNotice(messageId)
  const notice = live ?? stored
  const statusLine = historyAskStatusLine(notice)

  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openingRef = useRef(false)

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
  }, [])

  const flashCopy = useCallback((state: 'ok' | 'fail') => {
    setCopied(state)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied('idle'), 1500)
  }, [])

  // Copy the answer verbatim, citations included: they point at the sources
  // strip below and are part of what the user would want to keep.
  const copyAnswer = useCallback(() => {
    const text = notice.answer
    if (!text) return
    const done = () => flashCopy('ok')
    const fallback = () => {
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(area)
        flashCopy(ok ? 'ok' : 'fail')
      } catch {
        flashCopy('fail')
      }
    }
    try {
      void navigator.clipboard.writeText(text).then(done).catch(fallback)
    } catch {
      fallback()
    }
  }, [flashCopy, notice.answer])

  // Reopen the cited session at the cited message through the same machinery the
  // search overlay uses. Failure is silent by design: a deleted or unreadable
  // session must not navigate, crash, or toast a claim about a transcript that
  // did not open. The row disappears with the conversation switch if it did.
  //
  // `session:load` answers [] for a missing or unreadable transcript, and
  // `openSessionCore` would swap the chat to that empty history — a navigation
  // to nowhere. One preflight read turns it into a no-op instead.
  const openCitation = useCallback(async (source: HistoryAskSource) => {
    if (openingRef.current) return
    openingRef.current = true
    try {
      const raw = await window.electronAPI.sessionLoad(source.sessionId)
      if (!Array.isArray(raw) || raw.length === 0) return
      await revealSessionEvidence(source, source.matchedTerm || notice.question)
    } catch {
      // Deleted, unreadable or moved: there is nothing to open and no honest
      // place to report it from a row that is about to disappear.
    } finally {
      openingRef.current = false
    }
  }, [notice.question])

  const segments = useMemo(
    () => parseAnswerCitations(notice.answer, notice.sources.length),
    [notice.answer, notice.sources.length],
  )

  const hasText = notice.answer.trim().length > 0

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 20px' }}>
      <div role="note" aria-label={t('historyAsk.chat.aria')} style={CARD_STYLE}>
        {/* Header: this is not the assistant speaking. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <History size={13} color="#a78bfa" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
            {t('historyAsk.chat.title')}
          </span>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: 'rgba(139,92,246,0.14)',
            color: 'var(--accent-text)',
            border: '1px solid rgba(139,92,246,0.30)',
            borderRadius: 4,
            padding: '1px 5px',
          }}>
            {t('historyAsk.chat.badge')}
          </span>
          <span style={{ flex: 1 }} />
          {notice.status === 'running' && (
            <button
              type="button"
              onClick={() => stopHistoryAsk(messageId)}
              title={t('historyAsk.chat.stopHint')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                padding: '2px 8px',
              }}
            >
              <Square size={9} />
              <span>{t('historyAsk.chat.stop')}</span>
            </button>
          )}
          {hasText && notice.status !== 'running' && (
            <button
              type="button"
              onClick={copyAnswer}
              title={t(copied === 'ok' ? 'historyAsk.chat.copied' : 'historyAsk.chat.copyHint')}
              aria-label={t(copied === 'ok' ? 'historyAsk.chat.copied' : 'historyAsk.chat.copy')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'none',
                border: 'none',
                color: copied === 'ok' ? 'var(--success-text)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                padding: '2px 6px',
              }}
            >
              {copied === 'ok' ? <Check size={11} /> : <Copy size={11} />}
              <span>
                {t(copied === 'ok'
                  ? 'historyAsk.chat.copied'
                  : copied === 'fail'
                    ? 'historyAsk.chat.copyFailed'
                    : 'historyAsk.chat.copy')}
              </span>
            </button>
          )}
        </div>

        {/* The question the user asked, so the answer is never detached from it. */}
        <div style={{ marginTop: 8 }}>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            {t('historyAsk.chat.questionLabel')}
          </div>
          <div style={{ marginTop: 2, fontSize: 12.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {notice.question}
          </div>
        </div>

        {/* Answer body with positional [n] → source chips. */}
        {hasText && (
          <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {segments.map(segment => (
              segment.kind === 'text' ? (
                <React.Fragment key={`t-${segment.start}`}>{segment.text}</React.Fragment>
              ) : (
                (() => {
                  const source = notice.sources[segment.sourceIndex]
                  if (!source) return <React.Fragment key={`t-${segment.start}`}>{segment.raw}</React.Fragment>
                  return (
                    <button
                      key={`c-${segment.start}`}
                      type="button"
                      onClick={() => { void openCitation(source) }}
                      aria-label={t('historyAsk.chat.sourceLabel', {
                        n: segment.n,
                        title: source.title || t('askHistory.untitled'),
                      })}
                      style={CHIP_STYLE}
                    >
                      [{segment.n}]
                    </button>
                  )
                })()
              )
            ))}
            {notice.status === 'running' && (
              <span aria-hidden style={{ color: 'var(--accent-muted)', marginLeft: 1 }}>▍</span>
            )}
          </div>
        )}

        {/* Status line: running / refused / failed / stopped are distinct. */}
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: hasText ? 8 : 10,
            fontSize: 11.5,
            color: TONE_COLOR[statusLine.tone],
          }}
        >
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: TONE_DOT[statusLine.tone],
            flexShrink: 0,
          }} />
          <span>{t(statusLine.key, statusLine.params)}</span>
        </div>

        {/* Indexing was reported: the answer may be missing material. */}
        {notice.indexing && hasText && (
          <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--warning-text)', lineHeight: 1.5 }}>
            {t('historyAsk.chat.indexingNote')}
          </div>
        )}

        {/* Numbered sources. Each names the session and reopens the cited message. */}
        {notice.sources.length > 0 && (
          <div role="group" aria-label={t('historyAsk.chat.sourcesTitle')} style={{ marginTop: 10 }}>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              {t('historyAsk.chat.sourcesTitle')}
            </div>
            <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {notice.sources.map((source, i) => (
                <button
                  key={`${source.sessionId}-${i}`}
                  type="button"
                  onClick={() => { void openCitation(source) }}
                  aria-label={t('historyAsk.chat.sourceLabel', {
                    n: i + 1,
                    title: source.title || t('askHistory.untitled'),
                  })}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    maxWidth: '100%',
                    minWidth: 0,
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '3px 7px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.10)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ ...CHIP_STYLE, cursor: 'inherit' }}>[{i + 1}]</span>
                  <span
                    title={source.title || t('askHistory.untitled')}
                    style={{
                      fontSize: 11.5,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                  >
                    {source.title || t('askHistory.untitled')}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {projectLabel(source.project, t('askHistory.unknownProject'))}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {relativeTime(source.timestamp, t)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Honesty footer, always present — these are properties of the feature,
            not of this particular outcome. */}
        <div style={{
          marginTop: 10,
          paddingTop: 7,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          <div style={MUTED_SMALL}>{t('historyAsk.chat.provenance')}</div>
          <div style={MUTED_SMALL}>{t('historyAsk.chat.corpus')}</div>
          <div style={MUTED_SMALL}>{t('historyAsk.chat.ephemeral')}</div>
        </div>
      </div>
    </div>
  )
}
