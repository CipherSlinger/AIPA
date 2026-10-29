/**
 * How a backup or restore result is worded, in one place.
 *
 * Settings → About shows the report for a manual Export/Restore; the Automatic
 * backups block shows the report for "Restore" on a listed file. Both talk to
 * the same merge import in the main process and must name the same sections
 * with the same words, so the formatter lives here rather than in either
 * component.
 */

export type BackupTranslate = (key: string, params?: Record<string, string | number>) => string

export interface BackupReportLine {
  tone: 'ok' | 'muted' | 'warn'
  text: string
}

/**
 * The per-section counts a restore reports. Structurally identical to what
 * `backup:import` and `backup:restore` return through the preload bridge.
 */
export interface BackupImportResultShape {
  success?: boolean
  canceled?: boolean
  error?: string
  errorCode?: string
  backupVersion?: number
  backupDate?: string
  olderVersion?: boolean
  written?: Record<string, number>
  skippedExisting?: Record<string, number>
  failed?: Record<string, number>
  refused?: { section: string; path: string; reason: string }[]
  warnings?: { code: string; count?: number; version?: number }[]
  sectionsPresent?: { automations: boolean; skills: boolean; memoryFiles: boolean; sessionTrash: boolean }
}

/**
 * How each restored section is named in the report. The unit keys carry both a
 * singular and a plural form so "1 workflow" never reads as "1 workflows";
 * Chinese uses the same wording for both forms.
 */
export const BACKUP_REPORT_UNITS: { countKey: string; unitKey: string }[] = [
  { countKey: 'settings', unitKey: 'backup.unit.settings' },
  { countKey: 'personas', unitKey: 'backup.unit.personas' },
  { countKey: 'workflows', unitKey: 'backup.unit.workflows' },
  { countKey: 'notes', unitKey: 'backup.unit.notes' },
  { countKey: 'memories', unitKey: 'backup.unit.memories' },
  { countKey: 'snippets', unitKey: 'backup.unit.snippets' },
  { countKey: 'quickReplies', unitKey: 'backup.unit.quickReplies' },
  { countKey: 'templates', unitKey: 'backup.unit.templates' },
  { countKey: 'tagNames', unitKey: 'backup.unit.tags' },
  { countKey: 'jobs', unitKey: 'backup.unit.jobs' },
  { countKey: 'jobTrash', unitKey: 'backup.unit.trashedJobs' },
  { countKey: 'skills', unitKey: 'backup.unit.skills' },
  { countKey: 'trashedSkills', unitKey: 'backup.unit.trashedSkills' },
  { countKey: 'memoryFiles', unitKey: 'backup.unit.memoryFiles' },
  { countKey: 'sessionTrash', unitKey: 'backup.unit.trashedConversations' },
  { countKey: 'skippedFiles', unitKey: 'backup.unit.files' },
]

export function summarizeBackupCounts(
  counts: Record<string, number> | undefined,
  keys: string[],
  t: BackupTranslate,
): string {
  if (!counts) return ''
  const parts: string[] = []
  for (const entry of BACKUP_REPORT_UNITS) {
    if (!keys.includes(entry.countKey)) continue
    const count = counts[entry.countKey] || 0
    if (count <= 0) continue
    parts.push(t(count === 1 ? `${entry.unitKey}.one` : `${entry.unitKey}.other`, { n: String(count) }))
  }
  return parts.join(', ')
}

export function backupErrorText(code: string | undefined, fallback: string | undefined, t: BackupTranslate): string {
  if (code === 'invalid_format') return t('backup.invalidFormat')
  if (code === 'unsupported_version') return t('backup.error.newerVersion')
  if (code === 'write_failed') return t('backup.error.writeFailed')
  if (code === 'read_failed') return t('backup.error.readFailed')
  return fallback || code || t('backup.error.readFailed')
}

export interface ImportReportPresentation {
  lines: BackupReportLine[]
  /** True when at least one section was written, so a reload would show it. */
  canReload: boolean
  /** One-line summary for a toast, empty when nothing was written. */
  writtenSummary: string
}

/**
 * The report lines for a completed merge import, shared by both entry points.
 * Warnings are presented in the same order and with the same wording as
 * before; a warning this build does not know about is not silently dropped.
 */
export function presentImportReport(
  result: BackupImportResultShape,
  t: BackupTranslate,
): ImportReportPresentation {
  const written = result.written || {}
  const skipped = result.skippedExisting || {}
  const failed = result.failed || {}
  const writtenKeys = Object.keys(written).filter(key => (written[key] || 0) > 0 && key !== 'skillFiles' && key !== 'trashedSkillFiles')
  const skippedKeys = Object.keys(skipped).filter(key => (skipped[key] || 0) > 0)
  const writtenSummary = summarizeBackupCounts(written, writtenKeys, t)
  const skippedSummary = summarizeBackupCounts(skipped, skippedKeys, t)
  const failedTotal = Object.values(failed).reduce((sum, value) => sum + value, 0)

  const lines: BackupReportLine[] = [
    writtenSummary
      ? { tone: 'ok', text: t('backup.report.restored', { items: writtenSummary }) }
      : { tone: 'muted', text: t('backup.report.nothingWritten') },
  ]
  if (skippedSummary) {
    lines.push({ tone: 'muted', text: t('backup.report.skippedExisting', { items: skippedSummary }) })
  }
  if (failedTotal > 0) {
    lines.push({ tone: 'warn', text: t('backup.report.failed', { n: String(failedTotal) }) })
  }
  if ((result.refused || []).length > 0) {
    lines.push({ tone: 'warn', text: t('backup.report.refused', { n: String(result.refused?.length || 0) }) })
  }
  for (const warning of result.warnings || []) {
    if (warning.code === 'older_version') {
      lines.push({ tone: 'warn', text: t('backup.report.olderVersion', { version: String(warning.version ?? 1) }) })
    } else if (warning.code === 'no_jobs_section') {
      lines.push({ tone: 'muted', text: t('backup.report.noJobs') })
    } else if (warning.code === 'session_payloads_missing') {
      lines.push({ tone: 'warn', text: t('backup.report.sessionPayloads', { n: String(warning.count ?? 0) }) })
    } else if (warning.code === 'skipped_files') {
      lines.push({ tone: 'warn', text: t('backup.report.importSkippedFiles', { n: String(warning.count ?? 0) }) })
    }
  }
  lines.push({ tone: 'muted', text: t('backup.report.conversationsAbsent') })

  return {
    lines,
    canReload: Object.values(written).some(count => count > 0),
    writtenSummary,
  }
}
