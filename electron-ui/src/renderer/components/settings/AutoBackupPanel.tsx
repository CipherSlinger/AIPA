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
  padding: '5px 10px',
  background: 'var(--bg-hover)',
  border: '1px solid var(--glass-border-md)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: 11.5,
  transition: 'background-color 0.15s ease, border-color 0.15s ease',
}

const smallLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
  marginBottom: 8,
}

/**
 * Both pickers share one control shape so the row reads as a row and not as
 * two different widgets. The global `*:focus-visible` ring supplies the focus
 * state; nothing here suppresses it.
 */
const selectStyle: React.CSSProperties = {
  height: 26,
  boxSizing: 'border-box',
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 11.5,
  cursor: 'pointer',
}

/**
 * Scoped to this panel. A backup row sits on the card's own fill, so hover is
 * the only thing that proves it is a surface; one rule covers a hundred rows
 * where per-row React handlers would not. Colour only — and off entirely when
 * the system asks for reduced motion.
 */
const PANEL_STYLES = `
  .aipa-ab-row { transition: background-color 0.15s ease, border-color 0.15s ease; }
  .aipa-ab-row:hover { background: var(--bg-active); }
  .aipa-ab-action:hover:not(:disabled) {
    background: var(--bg-active) !important;
    border-color: var(--border-strong) !important;
  }
  .aipa-ab-list::-webkit-scrollbar { width: 6px; }
  @media (prefers-reduced-motion: reduce) {
    .aipa-ab-row, .aipa-ab-action { transition: none; }
  }
`

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
  // Which row the running operation belongs to. Without it every row's
  // Restore button showed a spinner for the one file being restored.
  const [busyName, setBusyName] = useState<string | null>(null)
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

  const patchPolicy = async (patch: {
    enabled?: boolean
    retention?: number
    interval?: 'daily' | 'weekly'
  }) => {
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
    setBusyName(name)
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
    setBusyName(null)
    void refresh()
  }

  const remove = async (name: string) => {
    setBusy('delete')
    setBusyName(name)
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
    setBusyName(null)
    void refresh()
  }

  const listIsEmpty = !loading && !loadError && backups.length === 0

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--glass-border)', paddingTop: 14 }}>
      <style>{PANEL_STYLES}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('settings.backup.auto.title')}
          </div>
          {/* The cadence sentence names the window it is actually counting.
              A weekly policy must not keep promising "at most once a day". */}
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.55 }}>
            {policy.interval === 'weekly'
              ? t('settings.backup.auto.enableHintWeekly')
              : t('settings.backup.auto.enableHint')}
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
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.55, wordBreak: 'break-all' }}>
          {t('settings.backup.auto.location', { dir })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap', rowGap: 8 }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {t('settings.backup.auto.retentionLabel')}
        </span>
        <select
          value={policy.retention}
          onChange={event => { void patchPolicy({ retention: Number(event.target.value) }) }}
          disabled={busy === 'policy'}
          aria-label={t('settings.backup.auto.retentionLabel')}
          style={selectStyle}
        >
          {RETENTION_CHOICES.map(count => (
            <option key={count} value={count}>
              {t('settings.backup.auto.retentionOption', { n: String(count) })}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {t('settings.backup.auto.intervalLabel')}
        </span>
        <select
          value={policy.interval}
          onChange={event => {
            void patchPolicy({ interval: event.target.value === 'weekly' ? 'weekly' : 'daily' })
          }}
          disabled={busy === 'policy'}
          aria-label={t('settings.backup.auto.intervalLabel')}
          style={selectStyle}
        >
          <option value="daily">{t('automation.scheduleOption.daily')}</option>
          <option value="weekly">{t('automation.scheduleOption.weekly')}</option>
        </select>
        <button
          type="button"
          className="aipa-ab-action"
          onClick={() => { void runNow() }}
          disabled={busy === 'run' || busy === 'policy'}
          aria-busy={busy === 'run' || undefined}
          style={{
            ...actionButtonStyle,
            marginLeft: 'auto',
            opacity: busy === 'run' ? 0.5 : 1,
            cursor: busy === 'run' || busy === 'policy' ? 'default' : 'pointer',
          }}
        >
          {busy === 'run'
            ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
            : <Play size={12} style={{ color: 'var(--accent-text)' }} />}
          {busy === 'run' ? t('settings.backup.auto.running') : t('settings.backup.auto.runNow')}
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.55 }}>
        {t('settings.backup.auto.retentionNote')}
      </div>

      {/* What the last attempt actually did. A failure is said here, where a
          success would be said, never only in the console. Failures carry the
          same warning edge the held-request ask uses, so the two surfaces read
          as one vocabulary rather than two. */}
      <div role="status" aria-live="polite" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {loadError && (
          <div style={{
            fontSize: 11.5, color: 'var(--warning-text)', lineHeight: 1.5,
            borderLeft: '2px solid var(--warning-text)', paddingLeft: 8,
          }}>
            {t('settings.backup.auto.loadFailed')}
          </div>
        )}
        {!policy.enabled && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('settings.backup.auto.disabled')}
          </div>
        )}
        {lastResult && !lastResult.ok && (
          <div style={{
            fontSize: 11.5, color: 'var(--warning-text)', lineHeight: 1.5,
            borderLeft: '2px solid var(--warning-text)', paddingLeft: 8,
          }}>
            {t('settings.backup.auto.lastAttemptFailed', {
              date: formatWhen(lastResult.at),
              error: autoErrorText(lastResult.error),
            })}
          </div>
        )}
        {lastSuccessAt !== null && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('settings.backup.auto.lastSuccess', { date: formatWhen(lastSuccessAt) })}
          </div>
        )}
        {!lastResult && lastSuccessAt === null && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('settings.backup.auto.never')}
          </div>
        )}
        {lastResult?.ok && (lastResult.pruned || 0) > 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('settings.backup.auto.pruned', { n: String(lastResult.pruned) })}
          </div>
        )}
        {lastResult?.ok && (lastResult.pruneFailures || 0) > 0 && (
          <div style={{
            fontSize: 11.5, color: 'var(--warning-text)', lineHeight: 1.5,
            borderLeft: '2px solid var(--warning-text)', paddingLeft: 8,
          }}>
            {t('settings.backup.auto.pruneFailed', { n: String(lastResult.pruneFailures) })}
          </div>
        )}
        {foreignCount > 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('settings.backup.auto.leftAlone', { n: String(foreignCount) })}
          </div>
        )}
      </div>

      <div style={{ ...smallLabelStyle, marginTop: 14 }}>{t('settings.backup.auto.listTitle')}</div>
      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11.5, color: 'var(--text-muted)', padding: '2px 0',
        }}>
          <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
          {t('common.loading')}
        </div>
      )}
      {listIsEmpty && (
        // An empty folder is a normal state, not a failure: same radius and
        // padding as a row, dashed edge so it cannot be mistaken for one.
        <div style={{
          fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.55,
          padding: '12px 12px', textAlign: 'center',
          border: '1px dashed var(--glass-border-md)', borderRadius: 8,
        }}>
          {t('settings.backup.auto.empty')}
        </div>
      )}
      <div className="aipa-ab-list" style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        // Retention goes up to 30 and the folder can hold a hundred files;
        // the list scrolls inside the card instead of pushing the page.
        maxHeight: 320, overflowY: 'auto', overscrollBehavior: 'contain',
      }}>
        {backups.map(row => {
          const restoringThis = busy === 'restore' && busyName === row.name
          const deletingThis = busy === 'delete' && busyName === row.name
          return (
          <div
            key={row.name}
            className="aipa-ab-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              rowGap: 6,
              padding: '8px 10px',
              border: '1px solid var(--glass-border-md)',
              borderRadius: 8,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 220px' }}>
              <Clock size={12} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                  {formatWhen(row.createdAt)}
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace',
                  lineHeight: 1.45, wordBreak: 'break-all',
                }}>
                  {t('settings.backup.auto.size', { size: formatSize(row.sizeBytes) })}
                  {' · '}
                  {row.name}
                </div>
              </div>
            </div>
            {confirmDelete === row.name ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', rowGap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--warning-text)', lineHeight: 1.45 }}>
                  {t('settings.backup.auto.deleteConfirm')} {t('settings.backup.auto.deleteCannotUndo')}
                </span>
                <button
                  type="button"
                  className="aipa-ab-action"
                  onClick={() => { void remove(row.name) }}
                  disabled={busy === 'delete'}
                  style={{
                    ...actionButtonStyle,
                    color: 'var(--danger-text)',
                    opacity: deletingThis ? 0.6 : 1,
                    cursor: deletingThis ? 'wait' : busy ? 'default' : 'pointer',
                  }}
                >
                  {deletingThis
                    ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Trash2 size={12} />}
                  {t('settings.backup.auto.deleteForever')}
                </button>
                <button
                  type="button"
                  className="aipa-ab-action"
                  onClick={() => setConfirmDelete(null)}
                  disabled={busy === 'delete'}
                  style={{ ...actionButtonStyle, cursor: busy === 'delete' ? 'default' : 'pointer' }}
                >
                  {t('settings.backup.auto.cancel')}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  className="aipa-ab-action"
                  onClick={() => { void restore(row.name) }}
                  disabled={busy !== null}
                  aria-busy={restoringThis || undefined}
                  aria-label={t('settings.backup.auto.restoreAria', { name: row.name })}
                  style={{
                    ...actionButtonStyle,
                    opacity: busy && !restoringThis ? 0.5 : 1,
                    cursor: restoringThis ? 'wait' : busy ? 'default' : 'pointer',
                  }}
                >
                  {restoringThis
                    ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    : <RotateCcw size={12} style={{ color: 'var(--accent-text)' }} />}
                  {t('settings.backup.auto.restore')}
                </button>
                <button
                  type="button"
                  className="aipa-ab-action"
                  onClick={() => setConfirmDelete(row.name)}
                  disabled={busy !== null}
                  aria-label={t('settings.backup.auto.deleteAria', { name: row.name })}
                  style={{
                    ...actionButtonStyle,
                    color: 'var(--danger-text)',
                    opacity: busy ? 0.5 : 1,
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  <Trash2 size={12} />
                  {t('settings.backup.auto.delete')}
                </button>
              </div>
            )}
          </div>
          )
        })}
      </div>

      {/* The sentence the manual export makes about scope, plus the two facts a
          row cannot show: restore merges, and a file is a snapshot. Set off from
          the list because it is the promise behind every row, not a row itself. */}
      <div style={{
        fontSize: 11.5, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.55,
        borderTop: '1px solid var(--glass-border)', paddingTop: 10,
      }}>
        <div>{t('settings.backup.auto.contains')}</div>
        <div style={{ marginTop: 5 }}>{t('settings.backup.auto.restoreHint')}</div>
        <div style={{ marginTop: 5 }}>{t('settings.backup.auto.notNow')}</div>
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
                fontSize: 11.5,
                lineHeight: 1.55,
                color: line.tone === 'ok'
                  ? 'var(--text-primary)'
                  : line.tone === 'warn'
                    ? 'var(--warning-text)'
                    : 'var(--text-muted)',
              }}
            >
              {line.text}
            </div>
          ))}
          {report.canReload && (
            <button
              type="button"
              className="aipa-ab-action"
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
