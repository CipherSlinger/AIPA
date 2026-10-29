// "Recently deleted" — the shared holding area for deleted workflows, skills,
// conversations and scheduled jobs.
//
// All four deletes used to be instant and permanent. A workflow is only a pref
// record, so it is kept in `AppPrefs.trashedWorkflows`; a skill is a real
// folder, a conversation is one or more transcript files and a job is a record
// in `automations.json`, so main moves or copies them under userData and records
// them in a manifest. This file is the connected half: it reads the four lists
// and turns each failure code into a sentence. The rows and the filter controls
// live in TrashSectionView.tsx; the merged row shape in lib/trashRows.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { listSessionsShared } from '../../utils/sessionListShared'
import { useSessionStore, useUiStore } from '../../store'
import { sessionTrashFailureText } from '../../lib/sessionTrashText'
import { EMPTY_TRASH_FILTER } from '../../lib/trashFilter'
import type { TrashFilterState } from '../../lib/trashFilter'
import { buildTrashRows } from '../../lib/trashRows'
import type { TrashActionOutcome, TrashRow } from '../../lib/trashRows'
import type { SessionListItem } from '../../types/app.types'
import type {
  JobTrashErrorCode,
  SessionTrashErrorCode,
  SkillTrashErrorCode,
  TrashedJobInfoData,
  TrashedSessionInfoData,
  TrashedSkillInfoData,
} from '../../../preload'
import { TRASH_RETENTION_DAYS } from '../../lib/workflowTrash'
import { MAX_WORKFLOWS } from './workflowConstants'
import { TrashView } from './TrashSectionView'
import type { EmployeeSkillsState } from './EmployeesSkillsSection'
import type { useWorkflowCrud } from './useWorkflowCrud'

// Re-exported so callers (and the harnesses written against the older
// single-file section) keep importing the row shape and the view from here.
export { TrashView }
export { buildTrashRows }
export type { TrashActionOutcome, TrashKind, TrashRow } from '../../lib/trashRows'

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
  // Narrowing lives here rather than inside TrashView because the palette jump
  // has to be able to clear it: landing on a section whose every row is filtered
  // out would scroll to a heading and nothing else.
  const [filter, setFilter] = useState<TrashFilterState>(EMPTY_TRASH_FILTER)
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
    if (rows.length > 0) {
      // A jump from the palette asks to see the holding area, so a filter the
      // user left on is dropped first. The alternative — scrolling to a
      // heading over an empty result — would hide the very rows the command
      // promised to bring into view.
      setFilter(EMPTY_TRASH_FILTER)
      sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    // Cleared either way: a request must not lie in wait and jump the page
    // when some later delete happens to fill the list.
    useUiStore.getState().clearPendingEmployeesSection()
  }, [pendingSection, loaded, rows.length])

  return (
    <TrashView
      rows={rows}
      retentionDays={retentionDays}
      filter={filter}
      onFilterChange={setFilter}
      onRestore={handleRestore}
      onDeleteForever={handleDeleteForever}
      sectionRef={sectionRef}
    />
  )
}
