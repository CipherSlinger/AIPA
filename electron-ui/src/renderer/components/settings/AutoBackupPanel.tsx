import React, { useCallback, useEffect, useState } from 'react'
import { Clock, Loader, Play, RotateCcw, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import Toggle from '../ui/Toggle'
import {
  backupErrorText,
  presentImportReport,
  type BackupReportLine,
} from './backupReport'

/** Mirrors AUTO_BACKUP_RETENTION_CHOICES in src/main/backup/auto-backup.ts. */
const RETENTION_CHOICES = [3, 7, 14, 30] as const

interface BackupPolicy {
  enabled: boolean
  interval: 'daily' | 'weekly'
  retention: number
}

interface BackupRow {
  name: string
  sizeBytes: number
  createdAt: number
}

interface LastResult {
  ok: boolean
  at: number
  fileName?: string
  sizeBytes?: number
  pruned: number
  leftAlone: number
  pruneFailures: number
  error?: 'collect_failed' | 'write_failed'
}

interface RestoreReport {
  lines: BackupReportLine[]
  canReload: boolean
}

const actionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 10px',
  background: 'var(--bg-hover)',
  border: '1px solid var(--glass-border-md)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: 11,
}

const smallLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
  marginBottom: 8,
}

function formatWhen(ms: number): string {
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return String(ms)
  }
}

function formatSize(bytes: number): string {
  return String(Math.max(0, Math.round(bytes / 1024)))
}

/**
 * Automatic backups, inside Settings → About.
 *
 * The panel never claims more than the file proves: dates come from the file
 * name, sizes from the file on disk, and the last failure is stated in the
 * place the next success would be stated. Retention is presented as what it
 * is — a rule that only ever deletes files AIPA named itself.
 */
export default function AutoBackupPanel() {
  const { t } = useI18n()
  const addToast = useUiStore(s => s.addToast)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [dir, setDir] = useState('')
  const [policy, setPolicy] = useState<BackupPolicy>({ enabled: true, interval: 'daily', retention: 7 })
  const [backups, setBackups] = useState<BackupRow[]>([])
  const [foreignCount, setForeignCount] = useState(0)
  const [lastResult, setLastResult] = useState<LastResult | null>(null)
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
  const [busy, setBusy] = useState<null | 'policy' | 'run' | 'restore' | 'delete'>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [report, setReport] = useState<RestoreReport | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await window.electronAPI.backupList()
      if (result.success) {
        setLoadError(false)
        setDir(result.dir || '')
        if (result.policy) setPolicy(result.policy)
        setBackups(result.backups || [])
        setForeignCount(result.foreignCount || 0)
        setLastResult(result.lastResult ?? null)
        setLastSuccessAt(result.lastSuccessAt ?? null)
      } else {
        // The list on screen may be stale; saying so beats pretending it is not.
        setLoadError(true)
      }
    } catch {
      // A refresh that fails must not erase the list already on screen.
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsubscribe = window.electronAPI.onBackupChanged(() => { void refresh() })
    return unsubscribe
  }, [refresh])

  const autoErrorText = (code: string | undefined): string => {
    if (code === 'collect_failed') return t('settings.backup.auto.errorCollect')
    if (code === 'write_failed') return t('settings.backup.auto.errorWrite')
    return t('settings.backup.auto.errorUnknown')
  }

  const restoreErrorText = (code: string | undefined): string => {
    if (code === 'not_ours') return t('settings.backup.auto.notOurs')
    if (code === 'not_found') return t('settings.backup.auto.missing')
    return backupErrorText(code, t('settings.backup.auto.restoreFailed'), t)
  }

  const patchPolicy = async (patch: { enabled?: boolean; retention?: number }) => {
    setBusy('policy')
    try {
      const result = await window.electronAPI.backupSetPolicy(patch)
      if (result.success && result.policy) {
        setPolicy(result.policy)
      } else {
        addToast('error', t('settings.backup.auto.saveFailed'))
      }
    } catch {
      addToast('error', t('settings.backup.auto.saveFailed'))
    }
    setBusy(null)
  }

  const runNow = async () => {
    setBusy('run')
    try {
      const result = await window.electronAPI.backupRunNow()
      if (result.ok && !result.skipped && result.fileName) {
        addToast('success', t('settings.backup.auto.runSuccess', {
          name: result.fileName,
          size: formatSize(result.sizeBytes || 0),
        }))
      } else if (result.skipped) {
        addToast('info', t('settings.backup.auto.runSkipped'))
      } else {
        addToast('error', t('settings.backup.auto.runFailed', { error: autoErrorText(result.error) }))
      }
    } catch {
      addToast('error', t('settings.backup.auto.runFailed', { error: autoErrorText(undefined) }))
    }
    setBusy(null)
    void refresh()
  }

  const restore = async (name: string) => {
    setBusy('restore')
    setConfirmDelete(null)
    try {
      const result = await window.electronAPI.backupRestore(name)
      if (result.success) {
        const presented = presentImportReport(result, t)
        setReport({ lines: presented.lines, canReload: presented.canReload })
        addToast('success', presented.writtenSummary || t('backup.report.nothingWritten'))
      } else {
        addToast('error', restoreErrorText(result.errorCode || result.error))
      }
    } catch {
      addToast('error', t('settings.backup.auto.restoreFailed'))
    }
    setBusy(null)
    void refresh()
  }

  const remove = async (name: string) => {
    setBusy('delete')
    try {
      const result = await window.electronAPI.backupDelete(name)
      if (result.success) {
        addToast('success', t('settings.backup.auto.deleted', { name }))
        setConfirmDelete(null)
      } else {
        addToast('error', t('settings.backup.auto.deleteFailed', {
          error: result.error === 'not_ours'
            ? t('settings.backup.auto.notOurs')
            : result.error === 'not_found'
              ? t('settings.backup.auto.missing')
              : autoErrorText(undefined),
        }))
      }
    } catch {
      addToast('error', t('settings.backup.auto.deleteFailed', {
        error: t('settings.backup.auto.errorUnknown'),
      }))
    }
    setBusy(null)
    void refresh()
  }

  const listIsEmpty = !loading && !loadError && backups.length === 0

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--glass-border)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('settings.backup.auto.title')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
            {t('settings.backup.auto.enableHint')}
          </div>
        </div>
        <Toggle
          value={policy.enabled}
          onChange={value => { void patchPolicy({ enabled: value }) }}
          disabled={busy === 'policy'}
          aria-label={t('settings.backup.auto.title')}
        />
      </div>

      {dir && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5, wordBreak: 'break-all' }}>
          {t('settings.backup.auto.location', { dir })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {t('settings.backup.auto.retentionLabel')}
        </span>
        <select
          value={policy.retention}
          onChange={event => { void patchPolicy({ retention: Number(event.target.value) }) }}
          disabled={busy === 'policy'}
          aria-label={t('settings.backup.auto.retentionLabel')}
          style={{
            height: 24,
            boxSizing: 'border-box',
            padding: '0 8px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {RETENTION_CHOICES.map(count => (
            <option key={count} value={count}>
              {t('settings.backup.auto.retentionOption', { n: String(count) })}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { void runNow() }}
          disabled={busy === 'run' || busy === 'policy'}
          style={{ ...actionButtonStyle, opacity: busy === 'run' ? 0.5 : 1, cursor: busy ? 'wait' : 'pointer' }}
        >
          {busy === 'run'
            ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
            : <Play size={12} style={{ color: 'var(--accent-text)' }} />}
          {busy === 'run' ? t('settings.backup.auto.running') : t('settings.backup.auto.runNow')}
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
        {t('settings.backup.auto.retentionNote')}
      </div>

      {/* What the last attempt actually did. A failure is said here, where a
          success would be said, never only in the console. */}
      <div role="status" aria-live="polite" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {loadError && (
          <div style={{ fontSize: 11, color: 'var(--warning-text, var(--text-primary))' }}>
            {t('settings.backup.auto.loadFailed')}
          </div>
        )}
        {!policy.enabled && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('settings.backup.auto.disabled')}
          </div>
        )}
        {lastResult && !lastResult.ok && (
          <div style={{ fontSize: 11, color: 'var(--warning-text, var(--text-primary))', lineHeight: 1.5 }}>
            {t('settings.backup.auto.lastAttemptFailed', {
              date: formatWhen(lastResult.at),
              error: autoErrorText(lastResult.error),
            })}
          </div>
        )}
        {lastSuccessAt !== null && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('settings.backup.auto.lastSuccess', { date: formatWhen(lastSuccessAt) })}
          </div>
        )}
        {!lastResult && lastSuccessAt === null && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('settings.backup.auto.never')}
          </div>
        )}
        {lastResult?.ok && (lastResult.pruned || 0) > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('settings.backup.auto.pruned', { n: String(lastResult.pruned) })}
          </div>
        )}
        {lastResult?.ok && (lastResult.pruneFailures || 0) > 0 && (
          <div style={{ fontSize: 11, color: 'var(--warning-text, var(--text-primary))' }}>
            {t('settings.backup.auto.pruneFailed', { n: String(lastResult.pruneFailures) })}
          </div>
        )}
        {foreignCount > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('settings.backup.auto.leftAlone', { n: String(foreignCount) })}
          </div>
        )}
      </div>

      <div style={{ ...smallLabelStyle, marginTop: 12 }}>{t('settings.backup.auto.listTitle')}</div>
      {listIsEmpty && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('settings.backup.auto.empty')}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {backups.map(row => (
          <div
            key={row.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '6px 10px',
              background: 'var(--bg-hover)',
              border: '1px solid var(--glass-border)',
              borderRadius: 8,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <Clock size={12} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatWhen(row.createdAt)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {t('settings.backup.auto.size', { size: formatSize(row.sizeBytes) })}
                  {' · '}
                  {row.name}
                </div>
              </div>
            </div>
            {confirmDelete === row.name ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: 'var(--warning-text, var(--text-primary))' }}>
                  {t('settings.backup.auto.deleteConfirm')} {t('settings.backup.auto.deleteCannotUndo')}
                </span>
                <button
                  type="button"
                  onClick={() => { void remove(row.name) }}
                  disabled={busy === 'delete'}
                  style={{ ...actionButtonStyle, color: 'var(--danger-text)', cursor: busy === 'delete' ? 'wait' : 'pointer' }}
                >
                  <Trash2 size={12} />
                  {t('settings.backup.auto.deleteForever')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  disabled={busy === 'delete'}
                  style={actionButtonStyle}
                >
                  {t('settings.backup.auto.cancel')}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => { void restore(row.name) }}
                  disabled={busy !== null}
                  aria-label={t('settings.backup.auto.restoreAria', { name: row.name })}
                  style={{ ...actionButtonStyle, opacity: busy === 'restore' ? 0.5 : 1, cursor: busy ? 'wait' : 'pointer' }}
                >
                  {busy === 'restore'
                    ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    : <RotateCcw size={12} style={{ color: 'var(--accent-text)' }} />}
                  {t('settings.backup.auto.restore')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(row.name)}
                  disabled={busy !== null}
                  aria-label={t('settings.backup.auto.deleteAria', { name: row.name })}
                  style={{ ...actionButtonStyle, color: 'var(--danger-text)' }}
                >
                  <Trash2 size={12} />
                  {t('settings.backup.auto.delete')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* The sentence the manual export makes about scope, plus the two facts a
          row cannot show: restore merges, and a file is a snapshot. */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.55 }}>
        <div>{t('settings.backup.auto.contains')}</div>
        <div style={{ marginTop: 4 }}>{t('settings.backup.auto.restoreHint')}</div>
        <div style={{ marginTop: 4 }}>{t('settings.backup.auto.notNow')}</div>
      </div>

      {report && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: 10,
            borderTop: '1px solid var(--glass-border)',
            paddingTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <div style={{ ...smallLabelStyle, marginBottom: 0 }}>{t('backup.report.importTitle')}</div>
          {report.lines.map((line, index) => (
            <div
              key={`${line.tone}-${index}`}
              style={{
                fontSize: 11,
                lineHeight: 1.5,
                color: line.tone === 'ok'
                  ? 'var(--text-primary)'
                  : line.tone === 'warn'
                    ? 'var(--warning-text, var(--text-primary))'
                    : 'var(--text-muted)',
              }}
            >
              {line.text}
            </div>
          ))}
          {report.canReload && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ ...actionButtonStyle, alignSelf: 'flex-start', color: 'var(--accent-text)' }}
            >
              {t('backup.report.reload')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
