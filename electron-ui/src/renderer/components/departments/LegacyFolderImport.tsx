// "Import folder as a task" — the migration door for a legacy department folder.
//
// The department and archive notes read a folder that predates the task model.
// This control only *offers* the import: it inspects the folder read-only so a
// missing, empty or unreadable source disables the button with the honest
// reason instead of failing after the click. The actual copy happens in main,
// which never moves or modifies the source.
import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, Loader2 } from 'lucide-react'
import type { LegacyFolderInspectionData } from '../../../preload'
import { useTaskStore, useUiStore } from '../../store'
import { useT } from '../../i18n'

const ELLIPSIS: React.CSSProperties = {
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

/** Codes main uses for a refused import, mapped to the one localized sentence. */
export function legacyImportReasonKey(code: string | undefined): string {
  switch (code) {
    case 'missing': return 'tasks.importLegacy.reason.missing'
    case 'empty': return 'tasks.importLegacy.reason.empty'
    case 'unreadable': return 'tasks.importLegacy.reason.unreadable'
    case 'too_large': return 'tasks.importLegacy.reason.tooLarge'
    case 'write_failed': return 'tasks.importLegacy.reason.storeFailed'
    case 'invalid_directory':
    case 'invalid_department': return 'tasks.importLegacy.reason.invalid'
    default: return 'tasks.importLegacy.reason.unknown'
  }
}

/**
 * Inspect once per folder. The request sequence keeps a slow reply for a
 * previous department from overwriting the folder now on screen.
 */
function useLegacyFolderInspection(directory: string | undefined) {
  const [inspection, setInspection] = useState<LegacyFolderInspectionData | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const request = ++seq.current
    if (!directory) {
      setInspection(null)
      return
    }
    setInspection(null)
    void useTaskStore.getState().inspectLegacyFolder(directory).then(result => {
      if (request === seq.current) setInspection(result)
    })
    return () => { seq.current += 1 }
  }, [directory])

  return inspection
}

interface LegacyFolderImportProps {
  directory: string | undefined
  departmentId: string
  /** Archive group headers are 25px tall; the note line can show the reason too. */
  compact?: boolean
  style?: React.CSSProperties
}

export default function LegacyFolderImport({
  directory,
  departmentId,
  compact,
  style,
}: LegacyFolderImportProps) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const importLegacyFolder = useTaskStore(s => s.importLegacyFolder)
  const inspection = useLegacyFolderInspection(directory)
  const [busy, setBusy] = useState(false)

  const ready = !!directory && inspection?.status === 'ok' && !busy
  const reason = inspection && inspection.status !== 'ok'
    ? t(legacyImportReasonKey(inspection.status))
    : null
  const title = !directory
    ? t('tasks.importLegacy.reason.invalid')
    : !inspection
      ? t('tasks.importLegacy.checking')
      : ready
        ? t(inspection.truncated > 0 ? 'tasks.importLegacy.readyTruncated' : 'tasks.importLegacy.ready', {
          files: inspection.files,
        })
        : reason ?? undefined

  const run = async () => {
    if (!directory || !ready) return
    setBusy(true)
    const result = await importLegacyFolder(directory, departmentId)
    setBusy(false)
    if (!result.ok || !result.task) {
      addToast('error', t('tasks.importLegacy.failed', {
        reason: t(legacyImportReasonKey(result.code)),
      }))
      return
    }
    // Opening the task is the point of the migration: the folder leaves the
    // legacy note and becomes a task with a timeline and a materials rail.
    useUiStore.getState().setActiveNavItem('tasks')
    useTaskStore.getState().selectTask(result.task.id)
    addToast('success', result.reused
      ? t('tasks.importLegacy.reused', { title: result.task.title })
      : t('tasks.importLegacy.success', {
        title: result.task.title,
        files: String(result.filesCopied ?? 0),
      }))
  }

  return (
    <span
      data-legacy-folder-import
      title={title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, ...style }}
    >
      <button
        type="button"
        onClick={() => { void run() }}
        disabled={!ready}
        title={title}
        aria-label={t('tasks.importLegacy.action')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
          height: compact ? 18 : 20, padding: compact ? '0 5px' : '0 7px',
          borderRadius: 5,
          border: '1px solid var(--accent-border)',
          background: ready ? 'var(--accent-bg)' : 'transparent',
          color: ready ? 'var(--accent-text)' : 'var(--text-muted)',
          fontSize: compact ? 9 : 9.5,
          fontWeight: 600,
          cursor: ready ? 'pointer' : 'default',
          opacity: ready || busy ? 1 : 0.7,
          whiteSpace: 'nowrap',
        }}
      >
        {busy || !inspection
          ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
          : <Download size={10} />}
        {t('tasks.importLegacy.action')}
      </button>
      {reason && compact && (
        <span title={reason} aria-label={reason} style={{ display: 'inline-flex', flexShrink: 0 }}>
          <AlertTriangle size={10} color="var(--warning)" />
        </span>
      )}
      {reason && !compact && (
        <span title={reason} style={{ minWidth: 0, fontSize: 9.5, color: 'var(--text-subtle)', ...ELLIPSIS }}>
          {reason}
        </span>
      )}
    </span>
  )
}
