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
  findDeptForSession,
  kindOf,
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

/** Root → node, guarding against a malformed parent chain. */
function nodePath(
  node: Department,
  byId: ReadonlyMap<string, Department>,
  locale: UiLocale,
): string {
  const names: string[] = []
  const seen = new Set<string>()
  let cursor: Department | undefined = node
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    names.unshift(deptDisplayName(cursor, locale))
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return names.join(' › ')
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
      path: nodePath(node, byId, input.locale),
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

export interface DeptFilterOption {
  id: string
  label: string
  path: string
  depth: number
}

/**
 * Every node in tree order (parents before children), so the compact select
 * can indent descendants without the UI rebuilding the tree. Creation order is
 * kept among siblings. A dangling parent is treated as a root, and a cycle can
 * never hide a node.
 */
export function buildDeptFilterOptions(
  departments: ReadonlyArray<Department>,
  locale: UiLocale,
): DeptFilterOption[] {
  const ids = new Set(departments.map(d => d.id))
  const children = new Map<string, Department[]>()
  const roots: Department[] = []
  for (const node of departments) {
    if (node.parentId && node.parentId !== node.id && ids.has(node.parentId)) {
      const bucket = children.get(node.parentId)
      if (bucket) bucket.push(node)
      else children.set(node.parentId, [node])
    } else {
      roots.push(node)
    }
  }

  const byId = new Map(departments.map(d => [d.id, d]))
  const options: DeptFilterOption[] = []
  const seen = new Set<string>()
  const walk = (node: Department, depth: number) => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    options.push({
      id: node.id,
      label: deptDisplayName(node, locale),
      path: nodePath(node, byId, locale),
      depth,
    })
    for (const child of children.get(node.id) ?? []) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)
  // A pure cycle has no root; list its nodes at depth 0 rather than dropping
  // them from the filter entirely.
  for (const node of departments) walk(node, 0)
  return options
}

/** The option text: indentation that survives an HTML `<option>`'s spacing. */
export function deptFilterOptionText(option: Pick<DeptFilterOption, 'label' | 'depth'>): string {
  return `${'  '.repeat(Math.max(0, option.depth))}${option.label}`
}

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
