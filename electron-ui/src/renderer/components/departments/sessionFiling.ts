// Where a conversation is *filed*, as opposed to where it ran.
//
// The org tree derives ownership from the folder a session ran in. That join is
// auditable, but it is not always what the user means: a conversation started
// from a scratch or shared folder can really belong to a department, and the
// folder cannot say so. A manual filing is the user's explicit assertion,
// stored locally, shown as such, and never inferred by moving anything on disk.
//
// Precedence is deliberate:
//
//   filing → live node      'filed'    the user named this node
//   filing → deleted node   'removed'  remembered, but filed nowhere live
//   no filing → folder      'folder'   the directory join
//   no filing → no match    'none'     not in the org
//
// A filing that points at a deleted node does NOT fall back to the folder. That
// fallback would quietly re-file the conversation under a node the user never
// chose — the same failure the automation archive already refuses: deleting a
// department must not move anything somewhere else. The dialog can show the
// remembered name and let the user clear the filing.
//
// Pure and React-free so the search attribution, the archive and the department
// views all answer the same question the same way, and a harness can exercise
// the precedence without Electron.

import type { Department, FilingMap, SessionFiling } from '../../store/departmentStore'
import {
  deptByNormDir,
  deptBySlug,
  findDeptForSession,
  type SessionDirFields,
} from './deptUtils'

/** The indexes a resolver needs. Build once per session list, not per row. */
export interface DeptLookup {
  byId: Map<string, Department>
  /** Concrete maps because the folder join reads them in a per-session loop. */
  bySlug: Map<string, Department>
  byNormDir: Map<string, Department>
  homeDir?: string
}

export function buildDeptLookup(
  departments: ReadonlyArray<Department>,
  homeDir?: string,
): DeptLookup {
  const list = [...departments]
  return {
    byId: new Map(list.map(dept => [dept.id, dept])),
    bySlug: deptBySlug(list),
    byNormDir: deptByNormDir(list, homeDir),
    homeDir,
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
  | { source: 'folder'; dept: Department; filing: null }
  | { source: 'none'; dept: null; filing: null }

/**
 * Resolve one session. A manual filing always wins over the folder join — even
 * when the two disagree, which is the whole point of filing by hand.
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
