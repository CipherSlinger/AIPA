// File a conversation under an org node by hand.
//
// The folder a conversation ran in is the default owner, but it is not always
// what the user means: a scratch folder, a shared drive, or a conversation
// started before the org chart existed can really belong to a department. This
// dialog writes that assertion locally. It moves nothing on disk and changes
// nothing about where the conversation runs; the copy says so plainly.

import React, { useCallback, useMemo, useState } from 'react'
import { FolderInput, Info } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useDepartmentStore, useSessionStore, useUiStore } from '../../store'
import {
  deptDisplayName,
  deptTreeOptionText,
  deptTreeOptions,
} from '../departments/deptUtils'
import {
  buildDeptLookup,
  resolveDeptForSession,
} from '../departments/sessionFiling'
import {
  canFile,
  filingSummary,
  hasManualFiling,
  initialDeptSelection,
  pinsFolderNode,
  summaryDeptName,
} from './filingDialogModel'
import SessionReuseDialogShell from './SessionReuseDialogShell'

interface Props {
  /** The conversation the menu belongs to — the same id the handoff uses. */
  sessionId: string
  onClose: () => void
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 6,
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 12,
  background: 'var(--bg-hover)',
  border: '1px solid var(--bg-active)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s ease',
}

export default function FileUnderDeptDialog({ sessionId, onClose }: Props) {
  const { t, resolvedLocale } = useI18n()
  const departments = useDepartmentStore(s => s.departments)
  const filings = useDepartmentStore(s => s.filings)
  const sessions = useSessionStore(s => s.sessions)
  const homeDir = useSessionStore(s => s.homeDir)

  // A session missing from the listing has no folder records at all; the stub
  // carries none, so the folder join cannot match. A manual filing still wins,
  // because `resolveDeptForSession` reads it before the folder.
  const session = useMemo(
    () => sessions.find(item => item.sessionId === sessionId)
      ?? { sessionId, project: '', projectSlug: '' },
    [sessions, sessionId],
  )
  const lookup = useMemo(
    () => buildDeptLookup(departments, homeDir),
    [departments, homeDir],
  )
  const resolution = useMemo(
    () => resolveDeptForSession(session, lookup, filings),
    [session, lookup, filings],
  )

  const summary = filingSummary(resolution)
  const summaryName = summaryDeptName(resolution, resolvedLocale)
  const manual = hasManualFiling(resolution)
  // Mount-time snapshot: the dialog is opened deliberately for this state, and
  // the store is not expected to re-resolve the owner while it is open.
  const [selection, setSelection] = useState(() => initialDeptSelection(resolution))

  const options = useMemo(
    () => deptTreeOptions(departments, resolvedLocale),
    [departments, resolvedLocale],
  )
  const canSubmit = canFile(departments, selection)
  const showExplicitNote = pinsFolderNode(resolution, selection)

  const summaryText = (() => {
    switch (summary) {
      case 'filedByYou':
        return t('chat.file.summaryFiledByYou', { name: summaryName })
      case 'filedByFolder':
        return t('chat.file.summaryFiledByFolder', { name: summaryName })
      case 'removed':
        return t('chat.file.summaryRemoved', { name: summaryName })
      case 'unfiled':
        return t('chat.file.summaryUnfiled')
    }
  })()

  const handleConfirm = useCallback(() => {
    const dept = departments.find(item => item.id === selection)
    if (!dept) return
    const name = deptDisplayName(dept, resolvedLocale)
    useDepartmentStore.getState().setSessionFiling(sessionId, dept.id, name)
    useUiStore.getState().addToast('success', t('chat.file.filedToast', { name }))
    onClose()
  }, [departments, selection, sessionId, resolvedLocale, t, onClose])

  const handleRemove = useCallback(() => {
    useDepartmentStore.getState().clearSessionFiling(sessionId)
    useUiStore.getState().addToast('success', t('chat.file.removedToast'))
    onClose()
  }, [sessionId, t, onClose])

  return (
    <SessionReuseDialogShell
      title={t('chat.file.title')}
      subtitle={t('chat.file.subtitle')}
      icon={<FolderInput size={16} />}
      width={520}
      onClose={onClose}
      testId="file-under-dept"
      footer={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          {manual ? (
            <div style={{ flex: 1, minWidth: 0 }}>
              <button
                onClick={handleRemove}
                data-file-remove
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 11.5,
                  cursor: 'pointer', background: 'transparent',
                  border: '1px solid var(--bg-active)', color: 'var(--text-muted)',
                  fontWeight: 500,
                }}
              >
                {t('chat.file.remove')}
              </button>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                {t('chat.file.removeHint')}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              background: 'var(--bg-hover)', border: '1px solid var(--bg-active)',
              color: 'var(--text-secondary)', fontWeight: 500, flexShrink: 0,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
            data-file-confirm
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit
                ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                : 'var(--bg-hover)',
              border: 'none', color: 'var(--text-bright)', fontWeight: 600,
              opacity: canSubmit ? 1 : 0.5, flexShrink: 0,
            }}
          >
            {t('chat.file.confirm')}
          </button>
        </div>
      )}
    >
      <div
        data-file-summary={summary}
        style={{
          padding: '9px 11px',
          borderRadius: 8,
          background: 'var(--bg-hover)',
          border: '1px solid var(--bg-active)',
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          marginBottom: 12,
        }}
      >
        {summaryText}
      </div>

      {departments.length === 0 ? (
        <div
          data-file-no-departments
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.22)',
          }}
        >
          <Info size={14} style={{ color: '#818cf8', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('chat.file.noDepartments')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
              {t('chat.file.noDepartmentsHint')}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="file-under-dept-select">
            {t('chat.file.pickLabel')}
          </label>
          <select
            id="file-under-dept-select"
            value={selection}
            onChange={e => setSelection(e.target.value)}
            data-file-select
            style={{ ...fieldStyle, cursor: 'pointer' }}
          >
            <option value="" disabled>
              {t('chat.file.pickPlaceholder')}
            </option>
            {options.map(option => (
              <option key={option.id} value={option.id} title={option.path}>
                {deptTreeOptionText(option)}
              </option>
            ))}
          </select>
          {showExplicitNote && (
            <div
              data-file-explicit-note
              style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.45 }}
            >
              {t('chat.file.explicitNote', { name: summaryName })}
            </div>
          )}
        </div>
      )}

      <div
        data-file-honesty
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 7,
          fontSize: 10.5, lineHeight: 1.5, color: 'var(--text-muted)',
          borderTop: '1px solid var(--border)', paddingTop: 10,
        }}
      >
        <Info size={12} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>{t('chat.file.honesty')}</span>
      </div>
    </SessionReuseDialogShell>
  )
}
