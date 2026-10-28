// Which org node a global-search hit belongs to.
//
// Search hits carry no department of their own. The session listing does: a
// session is filed under a node by its working folder (the same directory join
// the archive and the dashboards use). This module joins a hit's `sessionId`
// to that listing and then to the tree, producing one of three honest answers:
//
//   attributed   — the session is listed and its folder belongs to a node
//   unaffiliated — the session is listed but no node owns its folder
//   unlisted     — the session is not in this machine's listing at all
//
// `unlisted` matters: the search index can remember transcripts the sidebar
// does not currently show, and deriving a department from a project slug alone
// would turn "we cannot tell" into a false filing. `project` is a lossy display
// label, not a folder, so it is never used as a guess.
//
// Everything is a pure pass over data the overlay already holds: one scan of
// the results per query (memoized by the caller), no IPC per row, and filtering
// is client-side so it can never start a scan or race the result sequencing.

import type { Department, OrgNodeKind } from '../../store/departmentStore'
import {
  deptByNormDir,
  deptBySlug,
  deptDisplayName,
  deptTreeOptionText,
  deptTreeOptions,
  deptTreePath,
  findDeptForSession,
  kindOf,
  type DeptTreeOption,
  type UiLocale,
} from '../departments/deptUtils'

/** The slice of a listed session the directory join is allowed to read. */
export interface DeptSessionRef {
  sessionId: string
  cwd?: string
  project: string
  projectSlug: string
}

export type DeptAttribution =
  | {
    state: 'attributed'
    nodeId: string
    /** The node's own name, already resolved for the interface language. */
    label: string
    /** Names from the tree root down to the node, for the tooltip. */
    path: string
    kind: OrgNodeKind
    /** The folders this node owns; shown so the filing stays auditable. */
    directory: string
  }
  | { state: 'unaffiliated' }
  | { state: 'unlisted' }

export interface DeptAttributionInput {
  results: ReadonlyArray<{ sessionId: string }>
  sessions: ReadonlyArray<DeptSessionRef>
  departments: ReadonlyArray<Department>
  locale: UiLocale
  homeDir?: string
}

/**
 * sessionId -> attribution for every distinct session in `results`.
 *
 * One scan of the results and one scan of the session listing; repeated hits
 * from the same session (a title match and a content match) are resolved once.
 * A session absent from the listing is `unlisted` — never inferred from
 * `project`, and never silently treated as "belongs to no department".
 */
export function buildDeptAttributionMap(
  input: DeptAttributionInput,
): Map<string, DeptAttribution> {
  const departments = [...input.departments]
  const bySlug = deptBySlug(departments)
  const byNormDir = deptByNormDir(departments, input.homeDir)
  const byId = new Map(departments.map(d => [d.id, d]))
  const sessionById = new Map<string, DeptSessionRef>()
  for (const session of input.sessions) sessionById.set(session.sessionId, session)

  // Node metadata is shared: many sessions can sit in one folder, and walking
  // the ancestor chain once per node is enough.
  const nodeMeta = new Map<string, {
    label: string
    path: string
    kind: OrgNodeKind
    directory: string
  }>()
  const metaFor = (node: Department) => {
    const cached = nodeMeta.get(node.id)
    if (cached) return cached
    const meta = {
      label: deptDisplayName(node, input.locale),
      path: deptTreePath(node, byId, input.locale),
      kind: kindOf(node),
      directory: node.directory,
    }
    nodeMeta.set(node.id, meta)
    return meta
  }

  const out = new Map<string, DeptAttribution>()
  for (const hit of input.results) {
    if (out.has(hit.sessionId)) continue
    const session = sessionById.get(hit.sessionId)
    if (!session) {
      out.set(hit.sessionId, { state: 'unlisted' })
      continue
    }
    const node = findDeptForSession(session, bySlug, byNormDir, input.homeDir)
    if (!node) {
      out.set(hit.sessionId, { state: 'unaffiliated' })
      continue
    }
    out.set(hit.sessionId, {
      state: 'attributed',
      nodeId: node.id,
      ...metaFor(node),
    })
  }
  return out
}

/** A row whose session never entered the map is unlisted, not unaffiliated. */
export function deptAttributionFor(
  sessionId: string,
  attributions: ReadonlyMap<string, DeptAttribution>,
): DeptAttribution {
  return attributions.get(sessionId) ?? { state: 'unlisted' }
}

export type DeptFilterOption = DeptTreeOption

/**
 * The tree walk itself lives in `deptUtils`, so this overlay's filter and the
 * automation dialog's department picker cannot disagree about ordering, names
 * or malformed-parent handling. These aliases keep the overlay's vocabulary
 * stable.
 */
export const buildDeptFilterOptions = deptTreeOptions
export const deptFilterOptionText = deptTreeOptionText

/** `rootId` plus every node reachable from it through `parentId`. */
export function subtreeNodeIds(
  departments: ReadonlyArray<Department>,
  rootId: string,
): Set<string> {
  const ids = new Set(departments.map(d => d.id))
  if (!ids.has(rootId)) return new Set()
  const children = new Map<string, string[]>()
  for (const node of departments) {
    if (!node.parentId || node.parentId === node.id || !ids.has(node.parentId)) continue
    const bucket = children.get(node.parentId)
    if (bucket) bucket.push(node.id)
    else children.set(node.parentId, [node.id])
  }
  const out = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (out.has(id)) continue
    out.add(id)
    for (const child of children.get(id) ?? []) {
      if (!out.has(child)) stack.push(child)
    }
  }
  return out
}

/** The most sessions one scoped ask may hand to the main process. */
export const MAX_SCOPE_SESSIONS = 500

export interface DeptSessionScope {
  ids: string[]
  /** Distinct sessions that belong to the subtree, before the cap. */
  total: number
  truncated: boolean
}

/**
 * The session ids a scoped ask may read: conversations whose working folder
 * resolves to `rootId` or a descendant, in the listing's order.
 *
 * Membership is the same folder join the per-row chip uses, so the answer's
 * corpus and the chip on a hit cannot disagree. A session that is unlisted or
 * filed elsewhere contributes nothing; `project` is a lossy display label and
 * is never used as a guess (the slug/cwd join is the only evidence). Duplicate
 * listing rows collapse to their first occurrence, and the cap keeps the scope
 * bounded without changing which node a session belongs to.
 */
export function sessionIdsInDeptTree(
  sessions: ReadonlyArray<DeptSessionRef>,
  departments: ReadonlyArray<Department>,
  rootId: string,
  homeDir?: string,
): DeptSessionScope {
  const subtree = subtreeNodeIds(departments, rootId)
  if (subtree.size === 0) return { ids: [], total: 0, truncated: false }

  const bySlug = deptBySlug([...departments])
  const byNormDir = deptByNormDir([...departments], homeDir)
  // First occurrence wins: the listing can repeat a session (a title and a
  // content hit, or a refresh that appended rather than replaced), and the
  // later copy must not move it to another node.
  const unique = new Map<string, DeptSessionRef>()
  for (const session of sessions) {
    if (!unique.has(session.sessionId)) unique.set(session.sessionId, session)
  }

  const ids: string[] = []
  let total = 0
  for (const session of unique.values()) {
    const node = findDeptForSession(session, bySlug, byNormDir, homeDir)
    if (!node || !subtree.has(node.id)) continue
    total += 1
    if (ids.length < MAX_SCOPE_SESSIONS) ids.push(session.sessionId)
  }
  return { ids, total, truncated: total > ids.length }
}

export interface DeptFilteredResults<T> {
  visible: T[]
  /** Rows this department filter is keeping out of the current result set. */
  hidden: number
}

/**
 * Keep only rows whose owning node falls inside `rootId`'s subtree. Unlisted
 * and unaffiliated rows never match a department; `null` means no filter.
 */
export function filterResultsByDept<T extends { sessionId: string }>(
  results: ReadonlyArray<T>,
  attributions: ReadonlyMap<string, DeptAttribution>,
  departments: ReadonlyArray<Department>,
  rootId: string | null,
): DeptFilteredResults<T> {
  if (!rootId) return { visible: [...results], hidden: 0 }
  const ids = subtreeNodeIds(departments, rootId)
  if (ids.size === 0) return { visible: [], hidden: results.length }
  const visible: T[] = []
  for (const row of results) {
    const attribution = attributions.get(row.sessionId)
    if (attribution?.state === 'attributed' && ids.has(attribution.nodeId)) {
      visible.push(row)
    }
  }
  return { visible, hidden: results.length - visible.length }
}

/**
 * A department choice describes one query's rows. A changed query starts at
 * All, exactly like the origin filter: carrying a hidden-nothing choice over
 * would let a stale filter hide a fresh hit for an invisible reason.
 */
export function deptFilterForQuery(
  previousQuery: string,
  nextQuery: string,
  selected: string | null,
): string | null {
  return previousQuery.trim() === nextQuery.trim() ? selected : null
}

/** True only when the search found hits and this filter hid all of them. */
export function isDeptFilterEmpty(
  totalResults: number,
  visibleResults: number,
  selected: string | null,
): boolean {
  return selected !== null && totalResults > 0 && visibleResults === 0
}

/**
 * Stable React keys for the flat row list. Two hits can share a session and a
 * match type (the index does not promise otherwise), so repeats get a suffix
 * instead of colliding; the order is the rendered order.
 */
export function searchRowKeys(
  results: ReadonlyArray<{ sessionId: string; matchType: string }>,
): string[] {
  const used = new Map<string, number>()
  return results.map(hit => {
    const base = `${hit.sessionId}-${hit.matchType}`
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    return seen === 0 ? base : `${base}-${seen}`
  })
}
