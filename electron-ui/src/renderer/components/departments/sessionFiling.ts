// Where a conversation is *filed*, as opposed to where it ran.
//
// Work now lives in a task, and a task's `departmentId` is the authoritative
// attribution for every conversation the task recorded. The old folder join
// remains for sessions with no task: it is read-only, and a department created
// after this migration has no folder at all.
//
// Precedence is deliberate:
//
//   filing → live node          'filed'    the user named this node
//   filing → deleted node       'removed'  remembered, but filed nowhere live
//   task → routed department    'task'     the task owns the conversation
//   task → no routed department 'none'     the task is unassigned
//   no task → folder            'folder'   the legacy directory join
//   no task → no match          'none'     not in the org
//
// A filing that points at a deleted node does NOT fall back to the task or the
// folder. That fallback would quietly re-file the conversation under a node
// the user never chose — the same failure the automation archive already
// refuses: deleting a department must not move anything somewhere else. The
// dialog can show the remembered name and let the user clear the filing.
//
// A task in an unassigned state is also `none` rather than `folder`: its
// conversation belongs to the task, not to whatever directory it happens to
// run in, so the legacy join must not adopt it.
//
// Pure and React-free so the search attribution, the archive and the department
// views all answer the same question the same way, and a harness can exercise
// the precedence without Electron.

import type { Department, FilingMap, SessionFiling } from '../../store/departmentStore'
import type { TaskRecordData } from '../../../preload'
import {
  deptByNormDir,
  deptBySlug,
  findDeptForSession,
  type SessionDirFields,
} from './deptUtils'

/** The task fields that attribute a conversation. */
export type TaskAttributionRecord = Pick<TaskRecordData, 'id' | 'departmentId' | 'sessions'>

export interface TaskSessionFiling {
  taskId: string
  /** Null when the task exists but is not routed to a live department. */
  departmentId: string | null
}

/** sessionId → owning task. Built once per list; the store is not read here. */
export type TaskSessionIndex = ReadonlyMap<string, TaskSessionFiling>

export function buildTaskSessionIndex(
  tasks: ReadonlyArray<TaskAttributionRecord> | undefined,
): TaskSessionIndex {
  const index = new Map<string, TaskSessionFiling>()
  if (!Array.isArray(tasks)) return index
  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || !task.id) continue
    const departmentId = typeof task.departmentId === 'string' && task.departmentId
      ? task.departmentId
      : null
    for (const ref of Array.isArray(task.sessions) ? task.sessions : []) {
      if (!ref || typeof ref.sessionId !== 'string' || !ref.sessionId) continue
      // First task wins, as everywhere that indexes the tree: a duplicated link
      // must not make the same row resolve differently between passes.
      if (!index.has(ref.sessionId)) index.set(ref.sessionId, { taskId: task.id, departmentId })
    }
  }
  return index
}

/** The indexes a resolver needs. Build once per session list, not per row. */
export interface DeptLookup {
  byId: Map<string, Department>
  /** Concrete maps because the folder join reads them in a per-session loop. */
  bySlug: Map<string, Department>
  byNormDir: Map<string, Department>
  homeDir?: string
  /** Conversations owned by a task, and the department that task is routed to. */
  taskBySession: TaskSessionIndex
}

export function buildDeptLookup(
  departments: ReadonlyArray<Department>,
  homeDir?: string,
  tasks?: ReadonlyArray<TaskAttributionRecord>,
): DeptLookup {
  const list = [...departments]
  return {
    byId: new Map(list.map(dept => [dept.id, dept])),
    bySlug: deptBySlug(list),
    byNormDir: deptByNormDir(list, homeDir),
    homeDir,
    taskBySession: buildTaskSessionIndex(tasks),
  }
}

export type DeptResolution =
  | { source: 'filed'; dept: Department; filing: SessionFiling }
  /**
   * The filing outlived its node. `dept` is null so no view can attribute the
   * conversation to a live department; `filing.deptName` is the name at the
   * time, which is all the app still honestly knows.
   */
  | { source: 'removed'; dept: null; filing: SessionFiling }
  | { source: 'task'; dept: Department; filing: null; taskId: string }
  | { source: 'folder'; dept: Department; filing: null }
  | { source: 'none'; dept: null; filing: null }

/**
 * Resolve one session. A manual filing always wins over the task and the
 * folder join — even when they disagree, which is the whole point of filing by
 * hand. After that, a task's routing decides; only a session with no task is
 * allowed to fall through to the legacy directory join.
 */
export function resolveDeptForSession(
  session: SessionDirFields & { sessionId: string },
  lookup: DeptLookup,
  filings?: Readonly<FilingMap>,
): DeptResolution {
  const filing = filings?.[session.sessionId]
  if (filing) {
    const dept = lookup.byId.get(filing.deptId)
    if (dept) return { source: 'filed', dept, filing }
    return { source: 'removed', dept: null, filing }
  }

  const task = lookup.taskBySession.get(session.sessionId)
  if (task) {
    // A task is the attribution now. An unassigned task or a task routed to a
    // deleted node owns no live department; the folder is deliberately not used
    // as a substitute.
    const dept = task.departmentId ? lookup.byId.get(task.departmentId) : undefined
    return dept
      ? { source: 'task', dept, filing: null, taskId: task.taskId }
      : { source: 'none', dept: null, filing: null }
  }

  const dept = findDeptForSession(session, lookup.bySlug, lookup.byNormDir, lookup.homeDir)
  return dept
    ? { source: 'folder', dept, filing: null }
    : { source: 'none', dept: null, filing: null }
}

/** The live node this session is filed under, or null. */
export function resolvedDept(
  session: SessionDirFields & { sessionId: string },
  lookup: DeptLookup,
  filings?: Readonly<FilingMap>,
): Department | null {
  return resolveDeptForSession(session, lookup, filings).dept
}
