// "Recently deleted" — the shared holding area for deleted workflows, skills,
// conversations and scheduled jobs.
//
// All four deletes used to be instant and permanent. A workflow is only a pref
// record, so it is kept in `AppPrefs.trashedWorkflows`; a skill is a real
// folder, a conversation is one or more transcript files and a job is a record
// in `automations.json`, so main moves or copies them under userData and records
// them in a manifest. This section is the one place the user sees all four, and
// it is also where the difference is spelled out: a trashed skill or
// conversation can be restored only while its payload still exists on disk,
// while a job — a record, not a file — is always restorable.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Undo2, Trash2, Workflow as WorkflowIcon, Puzzle, MessageSquare, CalendarClock } from 'lucide-react'
import { useT, useI18n } from '../../i18n'
import { formatDateMedium } from '../../utils/formatDate'
import { listSessionsShared } from '../../utils/sessionListShared'
import { useSessionStore, useUiStore } from '../../store'
import { sessionTrashFailureText } from '../../lib/sessionTrashText'
import type { SessionListItem, TrashedWorkflow } from '../../types/app.types'
import type {
  JobTrashErrorCode,
  SessionTrashErrorCode,
  SkillTrashErrorCode,
  TrashedJobInfoData,
  TrashedSessionInfoData,
  TrashedSkillInfoData,
} from '../../../preload'
import { TRASH_RETENTION_DAYS, workflowPurgeAt } from '../../lib/workflowTrash'
import { MAX_WORKFLOWS } from './workflowConstants'
import { SectionHeader } from './EmployeesShared'
import type { EmployeeSkillsState } from './EmployeesSkillsSection'
import type { useWorkflowCrud } from './useWorkflowCrud'

export type TrashKind = 'workflow' | 'skill' | 'session' | 'job'

export interface TrashRow {
  kind: TrashKind
  id: string
  name: string
  deletedAt: number
  /** When the row leaves for good, shown as a date rather than "30 days ago". */
  purgeAt: number
  /** A trashed skill folder or transcript that is gone from disk cannot be restored. */
  available: boolean
}

/** What a row needs to tell the user, localized by the caller that knows the code. */
export type TrashActionOutcome = { ok: true } | { ok: false; message: string }

/**
 * Merge the four kinds into one newest-first list. Kept pure and exported so
 * the harness can assert the ordering and that an empty holding area yields no
 * rows at all — the section renders nothing in that case, not an empty box.
 *
 * `sessionEntries` and `jobEntries` are last and optional so the two older
 * kinds keep the call shape they had before conversations and jobs joined the
 * list.
 */
export function buildTrashRows(
  skillEntries: TrashedSkillInfoData[],
  workflowEntries: TrashedWorkflow[],
  sessionEntries: TrashedSessionInfoData[] = [],
  jobEntries: TrashedJobInfoData[] = [],
): TrashRow[] {
  const rows: TrashRow[] = [
    ...workflowEntries.map(entry => ({
      kind: 'workflow' as const,
      id: entry.workflow.id,
      name: entry.workflow.name,
      deletedAt: entry.deletedAt,
      purgeAt: workflowPurgeAt(entry),
      available: true,
    })),
    ...skillEntries.map(entry => ({
      kind: 'skill' as const,
      id: entry.id,
      name: entry.name,
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
      available: entry.available,
    })),
    ...sessionEntries.map(entry => ({
      kind: 'session' as const,
      id: entry.id,
      // A conversation's display name is whatever the renderer passed at delete
      // time. When there was none the id is shown — a title is never invented.
      name: entry.title || entry.sessionId,
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
      available: entry.available,
    })),
    ...jobEntries.map(entry => ({
      kind: 'job' as const,
      // Restore and remove act on the trash row, not on the job's own id.
      id: entry.id,
      name: entry.job.name,
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
      // A job is a record in a manifest, not a file: there is nothing on disk
      // that can go missing, so a trashed job is always restorable.
      available: true,
    })),
  ]
  return rows.sort((a, b) => b.deletedAt - a.deletedAt)
}

function kindBadge(kind: TrashKind): { color: string; background: string; border: string } {
  switch (kind) {
    case 'workflow':
      return { color: '#a5b4fc', background: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.30)' }
    case 'skill':
      return { color: '#c4b5fd', background: 'rgba(167,139,250,0.14)', border: 'rgba(167,139,250,0.30)' }
    case 'session':
      return { color: '#7dd3fc', background: 'rgba(56,189,248,0.14)', border: 'rgba(56,189,248,0.30)' }
    case 'job':
      return { color: '#fbbf24', background: 'rgba(251,191,36,0.14)', border: 'rgba(251,191,36,0.30)' }
  }
}

function kindIcon(kind: TrashKind): React.ReactNode {
  if (kind === 'workflow') return <WorkflowIcon size={13} />
  if (kind === 'skill') return <Puzzle size={13} />
  if (kind === 'job') return <CalendarClock size={13} />
  return <MessageSquare size={13} />
}

function smallButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 24,
    padding: '0 9px',
    borderRadius: 7,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: disabled ? 'var(--text-faint, var(--text-muted))' : 'var(--text-secondary)',
    opacity: disabled ? 0.55 : 1,
  }
}

function TrashRowView({ row, locale, first, onRestore, onDeleteForever }: {
  row: TrashRow
  locale: 'en' | 'zh-CN'
  first: boolean
  onRestore: (row: TrashRow) => Promise<TrashActionOutcome>
  onDeleteForever: (row: TrashRow) => Promise<TrashActionOutcome>
}) {
  const t = useT()
  const [failure, setFailure] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  // "Delete forever" is the one irreversible action here, so it asks twice —
  // the same pattern the skill card uses for its delete button.
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])

  const run = async (action: (row: TrashRow) => Promise<TrashActionOutcome>) => {
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      const outcome = await action(row)
      // A refusal stays on screen. Reporting success when the folder was not
      // moved would tell the user their skill is back when it is not.
      if (!outcome.ok) setFailure(outcome.message)
    } catch (err) {
      setFailure(t('trash.failure.generic', { message: String(err) }))
    } finally {
      setBusy(false)
    }
  }

  const badge = kindBadge(row.kind)
  const canRestore = row.available && !busy
  const kindLabel = row.kind === 'workflow'
    ? t('trash.kindWorkflow')
    : row.kind === 'skill'
      ? t('trash.kindSkill')
      : row.kind === 'job'
        ? t('automation.trash.kind')
        : t('sessionTrash.kind')
  // A skill was a folder; a conversation was a transcript file. Say which one
  // is gone rather than reusing a sentence about folders. A job is a record,
  // so it never reaches this line.
  const unavailableLabel = row.kind === 'session'
    ? t('sessionTrash.unavailable')
    : t('trash.folderUnavailable')

  return (
    <div style={{
      padding: '9px 12px',
      borderTop: first ? 'none' : '1px solid var(--border)',
      background: 'var(--bg-card, rgba(255,255,255,0.02))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: badge.color, background: badge.background, border: `1px solid ${badge.border}`,
        }}>
          {kindIcon(row.kind)}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{
              fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {row.name}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              flexShrink: 0, borderRadius: 20, padding: '1px 6px',
              color: badge.color, background: badge.background, border: `1px solid ${badge.border}`,
            }}>
              {kindLabel}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {row.available
              ? t('trash.removesOn', { date: formatDateMedium(locale, row.purgeAt) })
              : unavailableLabel}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => { if (canRestore) void run(onRestore) }}
            disabled={!canRestore}
            title={row.available ? t('trash.restore') : unavailableLabel}
            style={smallButtonStyle(!canRestore)}
          >
            <Undo2 size={11} />
            {t('trash.restore')}
          </button>
          <button
            onClick={() => {
              if (busy) return
              if (!confirming) { setConfirming(true); return }
              setConfirming(false)
              void run(onDeleteForever)
            }}
            disabled={busy}
            title={confirming ? t('trash.confirmForever') : t('trash.deleteForever')}
            style={{
              ...smallButtonStyle(busy),
              cursor: busy ? 'not-allowed' : 'pointer',
              ...(confirming ? { border: '1px solid #f87171', background: '#f87171', color: '#fff' } : null),
            }}
          >
            <Trash2 size={11} />
            {confirming ? t('trash.confirmForever') : t('trash.deleteForever')}
          </button>
        </div>
      </div>

      {failure && (
        <div role="alert" style={{ fontSize: 11.5, color: '#f87171', lineHeight: 1.45, marginTop: 6, marginLeft: 36 }}>
          {failure}
        </div>
      )}
    </div>
  )
}

/**
 * Pure view: nothing when the holding area is empty, otherwise one list for
 * all kinds. Exported so the harness can render it without an app instance.
 */
export function TrashView({ rows, retentionDays, onRestore, onDeleteForever, sectionRef }: {
  rows: TrashRow[]
  retentionDays: number
  onRestore: (row: TrashRow) => Promise<TrashActionOutcome>
  onDeleteForever: (row: TrashRow) => Promise<TrashActionOutcome>
  /** Handed in so the connected wrapper can scroll here once the rows exist. */
  sectionRef?: React.RefObject<HTMLElement>
}) {
  const t = useT()
  const { resolvedLocale } = useI18n()
  if (rows.length === 0) return null

  const hasSkill = rows.some(row => row.kind === 'skill')
  const hasSession = rows.some(row => row.kind === 'session')
  const hasJob = rows.some(row => row.kind === 'job')

  return (
    <section
      ref={sectionRef}
      data-employees-section="trash"
      style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}
    >
      <SectionHeader
        icon={<Trash2 size={14} />}
        title={t('trash.title')}
        count={rows.length}
        subtitle={t('trash.subtitle', { days: retentionDays })}
      />
      {hasSkill && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, marginLeft: 34, lineHeight: 1.45 }}>
          {t('trash.skillsHint')}
        </div>
      )}
      {hasSession && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, marginLeft: 34, lineHeight: 1.45 }}>
          {t('sessionTrash.hint')}
        </div>
      )}
      {hasJob && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, marginLeft: 34, lineHeight: 1.45 }}>
          {t('automation.trash.hint')}
        </div>
      )}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {rows.map((row, index) => (
          <TrashRowView
            key={`${row.kind}:${row.id}`}
            row={row}
            locale={resolvedLocale}
            first={index === 0}
            onRestore={onRestore}
            onDeleteForever={onDeleteForever}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * Connected wrapper: reads the skill and conversation manifests over IPC, takes
 * the workflow holding area from prefs, and turns each failure code into a
 * sentence the user can do something about.
 */
export default function TrashSection({ crud, skillState }: {
  crud: ReturnType<typeof useWorkflowCrud>
  skillState: EmployeeSkillsState
}) {
  const t = useT()
  const [skillEntries, setSkillEntries] = useState<TrashedSkillInfoData[]>([])
  const [sessionEntries, setSessionEntries] = useState<TrashedSessionInfoData[]>([])
  const [jobEntries, setJobEntries] = useState<TrashedJobInfoData[]>([])
  const [retentionDays, setRetentionDays] = useState(TRASH_RETENTION_DAYS)
  // True once the first read of all three lists has finished. The palette's
  // "Recently deleted" jump has to know the difference between "empty" and
  // "not read yet" before it scrolls — or gives up.
  const [loaded, setLoaded] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  // Deleting a conversation changes the sidebar list; that is also the signal
  // that the conversation holding area changed.
  const sessions = useSessionStore(state => state.sessions)

  const refreshSkills = useCallback(async () => {
    try {
      const result = await window.electronAPI.skillsTrashList()
      if (result.ok) {
        setSkillEntries(result.entries)
        // The window is main's constant, not a number this page makes up.
        setRetentionDays(result.retentionDays)
      }
    } catch (err) {
      console.error('[trash] could not read the skill trash:', err)
    }
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const result = await window.electronAPI.sessionsTrashList()
      if (result.ok) {
        setSessionEntries(result.entries)
        setRetentionDays(result.retentionDays)
      }
    } catch (err) {
      console.error('[trash] could not read the conversation trash:', err)
    }
  }, [])

  const refreshJobs = useCallback(async () => {
    try {
      const result = await window.electronAPI.automationTrashList()
      if (result.ok) {
        setJobEntries(result.entries)
        setRetentionDays(result.retentionDays)
      }
    } catch (err) {
      // A failed read must not be shown as "nothing was deleted"; the job rows
      // simply stay as they were.
      console.error('[trash] could not read the job trash:', err)
    }
  }, [])

  // Expired payloads under userData are the one thing this page can clean up
  // without being asked; each list is read after its purge so an expired row
  // never flashes on screen.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.electronAPI.skillsTrashPurge().catch(() => null),
      window.electronAPI.sessionsTrashPurge().catch(() => null),
      window.electronAPI.automationTrashPurge().catch(() => null),
    ]).then(async () => {
      if (cancelled) return
      // Awaited, not fired and forgotten: `loaded` must not go true while a
      // list is still in flight, or an empty read would be mistaken for an
      // empty holding area.
      await Promise.all([refreshSkills(), refreshSessions(), refreshJobs()])
      if (!cancelled) setLoaded(true)
    })
    return () => { cancelled = true }
  }, [refreshSkills, refreshSessions, refreshJobs])

  // Deleting or restoring a job rewrites the automation store, and the scheduler
  // broadcasts that. Following the same signal keeps this list correct for a
  // delete made in Settings without a manual refresh.
  useEffect(() => {
    return window.electronAPI.onAutomationChanged(() => { void refreshJobs() })
  }, [refreshJobs])

  // Deleting or restoring a skill changes the installed grid; re-read the
  // holding area whenever that grid changes so a just-deleted skill appears.
  useEffect(() => { void refreshSkills() }, [skillState.skills, refreshSkills])

  // Same for conversations: a delete or restore rewrites the sidebar list.
  useEffect(() => { void refreshSessions() }, [sessions, refreshSessions])

  const failureForSkill = useCallback((
    code: SkillTrashErrorCode | undefined,
    error: string | undefined,
  ): string => {
    switch (code) {
      // Restoring never overwrites: say exactly what is in the way.
      case 'original_exists': return t('trash.failure.folderExists')
      case 'folder_missing': return t('trash.failure.folderGone')
      case 'not_found': return t('trash.failure.notFound')
      default: return t('trash.failure.generic', { message: error || t('trash.failure.unknown') })
    }
  }, [t])

  const restoreSkill = useCallback(async (row: TrashRow): Promise<TrashActionOutcome> => {
    try {
      const result = await window.electronAPI.skillsTrashRestore(row.id)
      if (result.ok) {
        await refreshSkills()
        await skillState.refresh()
        return { ok: true }
      }
      return { ok: false, message: failureForSkill(result.code, result.error) }
    } catch (err) {
      return { ok: false, message: t('trash.failure.generic', { message: String(err) }) }
    }
  }, [refreshSkills, skillState, failureForSkill, t])

  const removeSkill = useCallback(async (row: TrashRow): Promise<TrashActionOutcome> => {
    try {
      const result = await window.electronAPI.skillsTrashRemove(row.id)
      if (result.ok) {
        await refreshSkills()
        return { ok: true }
      }
      return { ok: false, message: failureForSkill(result.code, result.error) }
    } catch (err) {
      return { ok: false, message: t('trash.failure.generic', { message: String(err) }) }
    }
  }, [refreshSkills, failureForSkill, t])

  // The same mapping the delete toast's Undo uses, so one refusal cannot be
  // explained two different ways depending on where the restore was started.
  const failureForSession = useCallback((
    code: SessionTrashErrorCode | undefined,
    error: string | undefined,
  ): string => sessionTrashFailureText(t, code, error), [t])

  const restoreSession = useCallback(async (row: TrashRow): Promise<TrashActionOutcome> => {
    try {
      const result = await window.electronAPI.sessionsTrashRestore(row.id)
      if (result.ok) {
        await refreshSessions()
        // Main forgot the reader caches for the restored paths, so a re-list
        // sees the conversation again — no restart needed.
        const list = await listSessionsShared()
        if (list) useSessionStore.getState().setSessions(list as SessionListItem[])
        return { ok: true }
      }
      return { ok: false, message: failureForSession(result.code, result.error) }
    } catch (err) {
      return { ok: false, message: t('trash.failure.generic', { message: String(err) }) }
    }
  }, [refreshSessions, failureForSession, t])

  const removeSession = useCallback(async (row: TrashRow): Promise<TrashActionOutcome> => {
    try {
      const result = await window.electronAPI.sessionsTrashRemove(row.id)
      if (result.ok) {
        await refreshSessions()
        return { ok: true }
      }
      return { ok: false, message: failureForSession(result.code, result.error) }
    } catch (err) {
      return { ok: false, message: t('trash.failure.generic', { message: String(err) }) }
    }
  }, [refreshSessions, failureForSession, t])

  const failureForJob = useCallback((
    code: JobTrashErrorCode | undefined,
    error: string | undefined,
  ): string => {
    switch (code) {
      // Restoring never overwrites and never renumbers: the live job with this
      // id stays, and the trashed row stays with it.
      case 'id_taken': return t('automation.trash.failure.idTaken')
      case 'job_limit': return t('automation.trash.failure.jobLimit')
      case 'not_found': return t('trash.failure.notFound')
      case 'write_failed': return t('automation.trash.failure.writeFailed')
      case 'move_failed': return t('automation.trash.failure.moveFailed')
      default: return t('trash.failure.generic', { message: error || t('trash.failure.unknown') })
    }
  }, [t])

  const restoreJob = useCallback(async (row: TrashRow): Promise<TrashActionOutcome> => {
    try {
      const result = await window.electronAPI.automationTrashRestore(row.id)
      if (result.ok) {
        // The scheduler has already re-armed the schedule from this instant and
        // broadcast `automation:changed`, which is what makes the job appear in
        // Settings; this list only has to lose the row.
        await refreshJobs()
        return { ok: true }
      }
      return { ok: false, message: failureForJob(result.code, result.error) }
    } catch (err) {
      return { ok: false, message: t('trash.failure.generic', { message: String(err) }) }
    }
  }, [refreshJobs, failureForJob, t])

  const removeJob = useCallback(async (row: TrashRow): Promise<TrashActionOutcome> => {
    try {
      const result = await window.electronAPI.automationTrashRemove(row.id)
      if (result.ok) {
        await refreshJobs()
        return { ok: true }
      }
      return { ok: false, message: failureForJob(result.code, result.error) }
    } catch (err) {
      return { ok: false, message: t('trash.failure.generic', { message: String(err) }) }
    }
  }, [refreshJobs, failureForJob, t])

  const restoreWorkflow = useCallback((row: TrashRow): Promise<TrashActionOutcome> => {
    const result = crud.restoreTrashedWorkflow(row.id)
    if (result.ok) return Promise.resolve({ ok: true })
    if (result.code === 'workflow_limit') {
      return Promise.resolve({
        ok: false,
        message: t('trash.failure.workflowLimit', { count: MAX_WORKFLOWS }),
      })
    }
    return Promise.resolve({ ok: false, message: t('trash.failure.notFound') })
  }, [crud, t])

  const removeWorkflow = useCallback((row: TrashRow): Promise<TrashActionOutcome> => {
    crud.removeTrashedWorkflow(row.id)
    return Promise.resolve({ ok: true })
  }, [crud])

  const handleRestore = useCallback((row: TrashRow) => {
    if (row.kind === 'skill') return restoreSkill(row)
    if (row.kind === 'session') return restoreSession(row)
    if (row.kind === 'job') return restoreJob(row)
    return restoreWorkflow(row)
  }, [restoreSkill, restoreSession, restoreJob, restoreWorkflow])

  const handleDeleteForever = useCallback((row: TrashRow) => {
    if (row.kind === 'skill') return removeSkill(row)
    if (row.kind === 'session') return removeSession(row)
    if (row.kind === 'job') return removeJob(row)
    return removeWorkflow(row)
  }, [removeSkill, removeSession, removeJob, removeWorkflow])

  const rows = useMemo(
    () => buildTrashRows(skillEntries, crud.trashedWorkflows, sessionEntries, jobEntries),
    [skillEntries, crud.trashedWorkflows, sessionEntries, jobEntries],
  )

  // The command palette's "Recently deleted" entry lands here by parking a
  // section request in the store. This section returns null until it has rows,
  // so there is no anchor to scroll to on the first render — the scroll waits
  // for the list to arrive, which WorkflowPanel cannot see.
  const pendingSection = useUiStore(s => s.pendingEmployeesSection)
  useEffect(() => {
    if (pendingSection !== 'trash' || !loaded) return
    if (rows.length > 0) sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    // Cleared either way: a request must not lie in wait and jump the page
    // when some later delete happens to fill the list.
    useUiStore.getState().clearPendingEmployeesSection()
  }, [pendingSection, loaded, rows.length])

  return (
    <TrashView
      rows={rows}
      retentionDays={retentionDays}
      onRestore={handleRestore}
      onDeleteForever={handleDeleteForever}
      sectionRef={sectionRef}
    />
  )
}
