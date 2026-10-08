// RecruitEmployeeModal — the dialog behind every 「招募新员工」 button.
//
// A department's employees are its sessions, and an employee's *job description*
// is simply the first thing that employee is told. So recruiting is: write (or
// have the model polish) a description of the responsibilities and skills this
// employee should have, then confirm — the description is sent as the opening
// message of the new session and the employee starts working.
//
// The polish button is one-shot generation in the main process (see
// `recruit:polish:start`), streamed back token by token so the textarea fills in
// live. Streaming into a field the user may still be typing into would be
// hostile, so the textarea goes read-only for the duration and its contents are
// whatever the model has produced so far.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { UserPlus, Sparkles, Square, AlertTriangle, Loader2 } from 'lucide-react'
import type { RecruitPolishEvent } from '../../../preload/index'
import { useI18n } from '../../i18n'

interface RecruitEmployeeModalProps {
  deptName: string
  deptColor?: string
  onCancel: () => void
  /** The (possibly empty) brief; empty means "just give me an idle employee". */
  onConfirm: (brief: string) => void
}

export default function RecruitEmployeeModal({ deptName, deptColor, onCancel, onConfirm }: RecruitEmployeeModalProps) {
  const { t, resolvedLocale } = useI18n()

  const [draft, setDraft] = useState('')
  const [polishing, setPolishing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)

  const requestIdRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // One subscription for the life of the dialog; events carry their requestId so
  // a late event from an aborted run can never overwrite the current draft.
  useEffect(() => {
    return window.electronAPI.onRecruitPolishEvent((event: RecruitPolishEvent) => {
      if (event.requestId !== requestIdRef.current) return
      switch (event.type) {
        case 'delta':
          setDraft(event.text || '')
          setStatus(null)
          break
        case 'status':
          setStatus(event.message || null)
          break
        case 'done':
          setDraft(event.text || '')
          setStatus(null)
          setPolishing(false)
          requestIdRef.current = null
          break
        case 'error':
          setError(event.message || t('dept.jdErrorFallback'))
          setStatus(null)
          setPolishing(false)
          requestIdRef.current = null
          break
      }
    })
  }, [t])

  const polish = useCallback(async () => {
    if (polishing) return
    const requestId = `jd-${Date.now()}`
    requestIdRef.current = requestId
    setPolishing(true)
    setStatus(null)
    setError(null)
    try {
      await window.electronAPI.recruitPolish({
        requestId,
        draft,
        deptName,
        locale: resolvedLocale,
      })
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      setError(raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''))
      setPolishing(false)
      requestIdRef.current = null
    }
  }, [polishing, draft, deptName, resolvedLocale])

  const stop = useCallback(() => {
    const requestId = requestIdRef.current
    if (requestId) window.electronAPI.recruitPolishAbort(requestId).catch(() => { /* already stopped */ })
  }, [])

  // Abandoning the dialog must not leave a generation running.
  useEffect(() => () => {
    const requestId = requestIdRef.current
    if (requestId) window.electronAPI.recruitPolishAbort(requestId).catch(() => { /* already stopped */ })
  }, [])

  const confirm = useCallback(() => {
    if (polishing) return
    onConfirm(draft.trim())
  }, [polishing, draft, onConfirm])

  const accent = deptColor || '#6366f1'

  const dialog = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--glass-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.15s ease',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        style={{
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          width: 460,
          maxWidth: 'calc(100vw - 48px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.15s ease',
        }}
      >
        {/* Header — the role being filled, in the department's own colour */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--bg-hover)' }}>
          <div style={{
            width: 30, height: 30, borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${accent}22`, border: `1px solid ${accent}44`,
          }}>
            <UserPlus size={15} color={accent} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
              {t('dept.recruitTitle')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {deptName}
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            {t('dept.recruitSubtitle')}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
            }}>
              {t('dept.jdLabel')}
            </span>
            {polishing ? (
              <button onClick={stop} style={{ ...PILL, borderColor: 'rgba(248,113,113,0.45)', color: '#f87171' }}>
                <Square size={10} />
                {t('dept.jdStop')}
              </button>
            ) : (
              <button
                onClick={() => void polish()}
                title={t('dept.jdPolishHint')}
                style={{ ...PILL, borderColor: 'rgba(99,102,241,0.4)', color: '#818cf8' }}
              >
                <Sparkles size={11} />
                {t('dept.jdPolish')}
              </button>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={draft}
            readOnly={polishing}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); confirm() }
            }}
            placeholder={t('dept.jdPlaceholder')}
            rows={7}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: 140,
              padding: '9px 11px',
              borderRadius: 10,
              border: `1px solid ${focused ? 'rgba(99,102,241,0.5)' : 'var(--bg-active)'}`,
              boxShadow: focused ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              fontSize: 12.5,
              lineHeight: 1.7,
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          />

          {/* One status line, shared by the polish stream and its errors */}
          {error ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: '#f87171', lineHeight: 1.5 }}>
              <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{t('dept.jdError', { message: error })}</span>
            </div>
          ) : status || polishing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-faint)' }}>
              <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
              {status || t('dept.jdPolishing')}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('dept.jdEmptyHint')}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 20px', borderTop: '1px solid var(--bg-hover)',
        }}>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-faint)' }}>{t('dept.recruitFooter')}</span>
          <button
            onClick={onCancel}
            style={{
              background: 'var(--bg-hover)', border: '1px solid var(--bg-active)', borderRadius: 8,
              padding: '7px 16px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={confirm}
            disabled={polishing}
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13,
              color: 'rgba(255,255,255,0.95)', fontWeight: 600,
              cursor: polishing ? 'not-allowed' : 'pointer',
              opacity: polishing ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (polishing) return
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <UserPlus size={12} />
            {t('dept.recruitConfirm')}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}

const PILL: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'transparent',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
}
