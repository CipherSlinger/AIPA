/**
 * Composer entry point for "ask your history from this conversation".
 *
 * A toolbar button rather than a slash command: it is visible without knowing a
 * hidden gesture, it sits beside the other composer actions, and its title can
 * explain exactly why it is unavailable (no authenticated engine, a turn is
 * streaming, or another ask owns the one app-wide slot). Clicking it opens a
 * small question box, not the search overlay.
 *
 * The ask itself is run by `historyAskRun` through `session:askHistory`; this
 * component never sends the question to the conversation's engine thread.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { History, Loader2 } from 'lucide-react'
import { useI18n, useT } from '../../i18n'
import { useUiStore } from '../../store'
import { toolbarBtnStyle, toolbarHoverIn, toolbarHoverOut } from './chatInputConstants'
import { ASK_MAX_QUESTION, ASK_MIN_QUESTION, validateAskQuestion } from './historyAskState'
import { startHistoryAsk, useHistoryAskRunning } from './historyAskRun'

type Probe = { available: boolean; reason?: string }

interface Props {
  isStreaming: boolean
  /** The conversation whose transcript will hold the row. */
  sessionId: string | null
}

export default function HistoryAskButton({ isStreaming, sessionId }: Props) {
  const t = useT()
  const { resolvedLocale } = useI18n()
  // App probes availability once at startup so the command palette agrees with
  // the overlay. A second cheap probe here adds the reason (the store keeps only
  // the boolean) and refreshes when credentials change.
  const storeAvailable = useUiStore(s => s.askHistoryAvailable)
  const [probe, setProbe] = useState<Probe | null>(null)
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [inlineError, setInlineError] = useState<'unavailable' | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const running = useHistoryAskRunning()

  useEffect(() => {
    let cancelled = false
    const check = () => {
      const api = window.electronAPI
      if (!api?.sessionAskHistoryStatus) {
        if (!cancelled) setProbe({ available: false, reason: 'ipc_unavailable' })
        return
      }
      Promise.resolve(api.sessionAskHistoryStatus())
        .then(result => {
          if (!cancelled) setProbe({ available: Boolean(result?.available), reason: result?.reason })
        })
        .catch(() => { /* keep the last answer; a failed probe must not disable it */ })
    }
    check()
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      window.removeEventListener('focus', check)
    }
  }, [])

  // A slow probe leaves `null`; the store's one-shot answer fills the gap, and
  // `null` there means "not known yet" rather than "no".
  const unavailable = probe ? !probe.available : storeAvailable === false
  const disabled = unavailable || isStreaming || running

  let title: string
  if (unavailable) {
    title = probe?.reason
      ? t('historyAsk.chat.disabled.unavailableWithReason', { reason: probe.reason })
      : t('historyAsk.chat.disabled.unavailable')
  } else if (isStreaming) {
    title = t('historyAsk.chat.disabled.streaming')
  } else if (running) {
    title = t('historyAsk.chat.disabled.running')
  } else {
    title = t('historyAsk.chat.action')
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => textareaRef.current?.focus(), 40)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) {
      setInlineError(null)
      return
    }
    if (disabled) setOpen(false)
  }, [disabled, open])

  const check = validateAskQuestion(question)
  const tooShort = !check.ok && check.code === 'tooShort'
  const tooLong = !check.ok && check.code === 'tooLong'

  const submit = useCallback(() => {
    const checked = validateAskQuestion(question)
    if (!checked.ok || disabled) return
    const result = startHistoryAsk({
      question: checked.question,
      locale: resolvedLocale,
      sessionId,
    })
    if (result.ok) {
      setQuestion('')
      setInlineError(null)
      setOpen(false)
      return
    }
    if (result.code === 'unavailable') setInlineError('unavailable')
  }, [disabled, question, resolvedLocale, sessionId])

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(v => !v) }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open && !disabled}
        title={title}
        aria-label={title}
        style={{
          ...toolbarBtnStyle,
          color: unavailable ? 'var(--text-faint)' : running ? '#a78bfa' : 'var(--text-muted)',
          background: open ? 'rgba(139,92,246,0.12)' : 'transparent',
          opacity: disabled && !unavailable ? 0.45 : unavailable ? 0.35 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={e => { if (!disabled) toolbarHoverIn(e) }}
        onMouseLeave={e => { if (!disabled) toolbarHoverOut(e) }}
      >
        {running ? <Loader2 size={15} /> : <History size={15} />}
      </button>

      {open && !disabled && (
        <div
          role="dialog"
          aria-label={t('historyAsk.chat.popoverTitle')}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 8,
            width: 340,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.28), 0 1px 4px rgba(0,0,0,0.2)',
            padding: '12px 12px 10px',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 7, borderBottom: '1px solid var(--border)' }}>
            <History size={14} color="#a78bfa" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('historyAsk.chat.popoverTitle')}
            </span>
          </div>

          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('historyAsk.chat.popoverHint')}
          </div>

          <textarea
            ref={textareaRef}
            value={question}
            onChange={e => { setQuestion(e.target.value); if (inlineError) setInlineError(null) }}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setOpen(false)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={t('historyAsk.chat.placeholder')}
            maxLength={ASK_MAX_QUESTION + 50}
            rows={3}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'inherit',
              lineHeight: 1.5,
              padding: '6px 9px',
              resize: 'vertical',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />

          {(tooShort || tooLong) && (
            <div style={{ fontSize: 10.5, color: 'var(--warning-text)' }}>
              {tooShort
                ? t('historyAsk.chat.inline.tooShort', { count: ASK_MIN_QUESTION })
                : t('historyAsk.chat.inline.tooLong', { count: ASK_MAX_QUESTION })}
            </div>
          )}
          {inlineError === 'unavailable' && (
            <div style={{ fontSize: 10.5, color: 'var(--warning-text)' }}>
              {t('historyAsk.chat.inline.unavailable')}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
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
              {t('historyAsk.chat.cancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!check.ok}
              style={{
                padding: '4px 13px',
                fontSize: 11.5,
                fontWeight: 600,
                background: check.ok
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                  : 'rgba(99,102,241,0.2)',
                color: check.ok ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)',
                border: 'none',
                borderRadius: 7,
                cursor: check.ok ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              {t('historyAsk.chat.ask')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
