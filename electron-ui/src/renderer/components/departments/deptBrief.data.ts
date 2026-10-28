// Derivation for the department "Brief": what the selected node and its whole
// subtree can honestly say happened in a time window.
//
// This is a ledger excerpt, not a report. Every figure here is a count over rows
// the renderer already has. The module is React-free and pure so the claims can
// be tested without a DOM:
//
//   * "filed here" is a manual filing when one exists, otherwise directory
//     ownership — never proof of who did the work;
//   * Claude rows date a conversation by its last activity, Codex rows by its
//     creation time, so the two engines do not answer the same question;
//   * `messageCount` is a lifetime total for the session, not a window count, and
//     is deliberately not returned at all;
//   * scheduled jobs are not folded into these conversation figures. They are
//     derived separately in `deptJobs.data.ts`, where `departmentId` — and only
//     `departmentId` — decides which node a job belongs to.
//
// Total over malformed input: rows and nodes are normalised, cycles in the tree
// are walked once, and nothing here throws on a null, a NaN timestamp or a
// dangling parent.

import type { Department, Position } from '../../store'
import type { FilingMap } from '../../store/departmentStore'
import type { SessionListItem } from '../../types/app.types'
import { buildDeptLookup, resolveDeptForSession, resolvedDept } from './sessionFiling'

export type BriefWindow = 'today' | 'week'
export type BriefEngine = 'claude' | 'codex'
/** Which of a row's two dates placed it in the window. */
export type BriefDateBasis = 'activity' | 'created'

/**
 * `session:list` rows do not declare `engine`, but the field may arrive on a
 * payload. When it is absent, the one reliable separator is `cwd`: Codex reads
 * a real working directory from its rollout, Claude's list rows never have one.
 * That is the same signal `findDeptForSession` already trusts for ownership.
 */
export type BriefSession = SessionListItem & { engine?: string }

export interface BriefRecentRow {
  session: SessionListItem
  /** The covered node the resolver assigns this conversation to. */
  nodeId: string
  engine: BriefEngine
  basis: BriefDateBasis
  /** The date used for the window and for the relative time; never after `now`. */
  at: number
}

export interface BriefSeat {
  nodeId: string
  position: Position
}

export interface BriefCounts {
  /** Conversations filed under any covered node, ever. */
  allTimeSessions: number
  /** Claude rows whose last activity is inside the window. */
  activeConversations: number
  /** Rows with a real `firstTimestamp` inside the window. */
  firstSeenConversations: number
  /** Distinct conversations placed in the window by either claim. */
  windowConversations: number
  openSeats: number
  claudeSessions: number
  codexSessions: number
  /** Sessions owned by another node (a sibling, an ancestor, …). */
  outsideSessions: number
  /**
   * Sessions no live node owns — an unmatched directory, or a filing whose
   * target node has been deleted. Never silently re-attributed to a folder.
   */
  unownedSessions: number
}

export type BriefEmpty = 'noNode' | 'noSessions' | 'noActivity'

export interface BriefDisclosures {
  ownershipIsFiling: true
  codexUsesCreationDate: boolean
  claudeUsesActivityDate: boolean
  /** Covered conversations with no usable `firstTimestamp`; never inferred. */
  firstTimestampMissing: number
  messageCountIsLifetime: true
  localMachineOnly: true
  outsideOrgExcluded: true
}

export interface DeptBriefResult {
  rootId: string
  /** Inclusive bounds actually used; both are epoch ms. */
  window: { start: number; end: number }
  /** The covered subtree, breadth-first, root first. */
  nodes: Department[]
  /** Everything covered below the root; empty when the brief is one node. */
  descendants: Department[]
  counts: BriefCounts
  seats: BriefSeat[]
  /** At most five, newest first by the date used to place the row. */
  recent: BriefRecentRow[]
  empty: BriefEmpty | null
  disclosures: BriefDisclosures
  skipped: { nodes: number; sessions: number }
}

export interface BuildDeptBriefInput {
  nodes: readonly Department[]
  sessions: readonly BriefSession[]
  rootId: string
  window: BriefWindow
  now: number
  homeDir?: string
  /**
   * Manual filings, by session id. Absent/empty keeps the folder join, so a
   * caller that predates filing (or a harness) gets exactly the old figures.
   */
  filings?: Readonly<FilingMap>
}

const RECENT_LIMIT = 5

/** `today` starts at local midnight; `week` six local midnights earlier. */
export function briefWindowBounds(window: BriefWindow, now: number): { start: number; end: number } {
  const end = Number.isFinite(now) ? now : 0
  const startDate = new Date(end)
  // Calendar arithmetic, not `- 6 * 86_400_000`: a DST change would otherwise
  // move the boundary by an hour.
  startDate.setDate(startDate.getDate() - (window === 'week' ? 6 : 0))
  startDate.setHours(0, 0, 0, 0)
  return { start: startDate.getTime(), end }
}

/** Inclusive at both ends. A future timestamp is not past activity, so it is out. */
function inWindow(timestamp: number, start: number, end: number): boolean {
  return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end
}

/** Normalise one row, or reject it when it cannot name a conversation or a date. */
function readSession(raw: unknown): BriefSession | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.sessionId !== 'string' || !value.sessionId) return null
  if (typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp)) return null

  const row: BriefSession = {
    sessionId: value.sessionId,
    lastPrompt: typeof value.lastPrompt === 'string' ? value.lastPrompt : '',
    timestamp: value.timestamp,
    project: typeof value.project === 'string' ? value.project : '',
    projectSlug: typeof value.projectSlug === 'string' ? value.projectSlug : '',
  }
  if (typeof value.cwd === 'string' && value.cwd) row.cwd = value.cwd
  if (typeof value.title === 'string') row.title = value.title
  if (typeof value.messageCount === 'number' && Number.isFinite(value.messageCount)) {
    row.messageCount = value.messageCount
  }
  if (typeof value.firstTimestamp === 'number' && Number.isFinite(value.firstTimestamp)) {
    row.firstTimestamp = value.firstTimestamp
  }
  if (typeof value.engine === 'string') row.engine = value.engine
  return row
}

/** Normalise one node; a node without an id or a directory owns nothing. */
function readNode(raw: unknown): Department | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.id !== 'string' || !value.id) return null
  if (typeof value.directory !== 'string') return null

  const node = raw as Department
  return {
    ...node,
    id: value.id,
    directory: value.directory,
    name: typeof value.name === 'string' ? value.name : value.directory,
    createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : 0,
    parentId: typeof value.parentId === 'string' ? value.parentId : undefined,
    positions: readPositions(value.positions),
  }
}

function readPositions(raw: unknown): Position[] {
  if (!Array.isArray(raw)) return []
  const positions: Position[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const value = entry as Record<string, unknown>
    if (typeof value.title !== 'string') continue
    positions.push({
      ...(entry as Position),
      id: typeof value.id === 'string' && value.id ? value.id : `pos-unreadable-${positions.length}`,
      title: value.title,
      brief: typeof value.brief === 'string' ? value.brief : '',
    })
  }
  return positions
}

/**
 * The root and every node below it, breadth-first. Cycle-safe: a malformed
 * parent loop is visited once instead of expanding forever.
 */
export function briefSubtree(nodes: Department[], rootId: string): Department[] {
  const byId = new Map<string, Department>()
  for (const node of nodes) {
    if (!byId.has(node.id)) byId.set(node.id, node)
  }
  const root = byId.get(rootId)
  if (!root) return []

  const byParent = new Map<string, Department[]>()
  for (const node of nodes) {
    if (!node.parentId || !byId.has(node.parentId)) continue
    const siblings = byParent.get(node.parentId)
    if (siblings) siblings.push(node)
    else byParent.set(node.parentId, [node])
  }

  const out: Department[] = []
  const seen = new Set<string>()
  const queue: Department[] = [root]
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]
    if (seen.has(node.id)) continue
    seen.add(node.id)
    out.push(node)
    const children = byParent.get(node.id)
    if (children) queue.push(...children)
  }
  return out
}

// ── Membership helpers for the department views ─────────────────────────────
// The brief and the two org views all have to answer "which conversations belong
// to this node". They answer with one resolver, so a hand filing cannot show up
// in one surface and not another. React-free so the harness can drive them.

export interface DeptMembershipInput {
  departments: readonly Department[]
  /** Manual filings, by session id. Absent = folder ownership only. */
  filings?: Readonly<FilingMap>
  homeDir?: string
}

export interface ResolvedDeptSessions {
  /** Every node id is present, even with no sessions, so callers can index safely. */
  byDept: Record<string, SessionListItem[]>
  /** Sessions no live node owns: unmatched folders and filings to deleted nodes. */
  unowned: SessionListItem[]
}

/**
 * One pass over the session list, one lookup, one resolution per session.
 *
 * This is the *exact* ownership map — a node's headcount is its own desk, the
 * rule the sidebar and the org chart have always used (teams stay separate).
 * A manual filing wins over the folder; a filing whose node was deleted lands in
 * `unowned` rather than back in the folder the conversation ran in.
 */
export function groupSessionsByResolvedDept(
  sessions: readonly SessionListItem[],
  input: DeptMembershipInput,
): ResolvedDeptSessions {
  const lookup = buildDeptLookup(input.departments, input.homeDir)
  const byDept: Record<string, SessionListItem[]> = {}
  for (const node of input.departments) {
    if (!(node.id in byDept)) byDept[node.id] = []
  }

  const unowned: SessionListItem[] = []
  for (const session of sessions) {
    const dept = resolvedDept(session, lookup, input.filings)
    if (dept) (byDept[dept.id] ??= []).push(session)
    else unowned.push(session)
  }
  return { byDept, unowned }
}

export interface DeptRosterInput extends DeptMembershipInput {
  sessions: readonly SessionListItem[]
  rootId: string
}

/**
 * The roster of one department page.
 *
 * A folder-owned conversation belongs to the node whose folder it ran in, so
 * with no manual filings this is exactly the old "folder matches this directory"
 * predicate — team desks keep their own pages. A conversation the user filed by
 * hand is an assertion about the tree, so it follows this page's scope: `rootId`
 * plus its descendants. Filing a conversation into a team therefore also puts it
 * on the department page above that team. A filing to a deleted node belongs to
 * no page and is never given back to the folder.
 */
export function selectDeptRosterSessions(input: DeptRosterInput): SessionListItem[] {
  const lookup = buildDeptLookup(input.departments, input.homeDir)
  if (!lookup.byId.has(input.rootId)) return []
  // Cycle-safe: a malformed parent loop is visited once, not expanded forever.
  const scope = new Set(briefSubtree([...input.departments], input.rootId).map(node => node.id))

  const out: SessionListItem[] = []
  for (const session of input.sessions) {
    const resolution = resolveDeptForSession(session, lookup, input.filings)
    if (!resolution.dept) continue
    const member = resolution.source === 'filed'
      ? scope.has(resolution.dept.id)
      : resolution.dept.id === input.rootId
    if (member) out.push(session)
  }
  return out
}

/**
 * Which engine a row belongs to. An explicit field wins; otherwise Codex is the
 * reader that reports a real `cwd`, so a row without one is a Claude row.
 */
export function briefEngineOf(session: Pick<SessionListItem, 'cwd'> & { engine?: string }): BriefEngine {
  if (session.engine === 'codex' || session.engine === 'claude') return session.engine
  return session.cwd ? 'codex' : 'claude'
}

export function buildDeptBrief(input: BuildDeptBriefInput): DeptBriefResult {
  const { rootId, window, now } = input
  // A caller that lost its shape (a hydrated payload, a test fixture) must still
  // get an answer rather than an exception.
  const homeDir = typeof input.homeDir === 'string' ? input.homeDir : undefined
  const inputNodes: readonly unknown[] = Array.isArray(input.nodes) ? input.nodes : []
  const inputSessions: readonly unknown[] = Array.isArray(input.sessions) ? input.sessions : []
  const bounds = briefWindowBounds(window, now)
  const { start, end } = bounds

  // A node whose shape cannot name an id + directory cannot own a folder.
  let skippedNodes = 0
  const nodes: Department[] = []
  for (const raw of inputNodes) {
    const node = readNode(raw)
    if (node) nodes.push(node)
    else skippedNodes++
  }

  const byId = new Map<string, Department>()
  for (const node of nodes) {
    if (!byId.has(node.id)) byId.set(node.id, node)
  }
  const covered = briefSubtree(nodes, rootId)
  const descendants = covered.slice(1)
  const coveredIds = new Set(covered.map(node => node.id))

  // Ownership is matched against the whole tree: a session in a sibling node is
  // then recognisably outside the subtree rather than silently unowned. One
  // lookup and one resolution per session; a manual filing (present or stale)
  // wins over the folder exactly as the other department views resolve it.
  const lookup = buildDeptLookup(nodes, homeDir)
  const filings = input.filings

  const seats: BriefSeat[] = []
  for (const node of covered) {
    const positions = Array.isArray(node.positions) ? node.positions : []
    for (const position of positions) seats.push({ nodeId: node.id, position })
  }

  let allTimeSessions = 0
  let activeConversations = 0
  let firstSeenConversations = 0
  let claudeSessions = 0
  let codexSessions = 0
  let outsideSessions = 0
  let unownedSessions = 0
  let firstTimestampMissing = 0
  let skippedSessions = 0

  const candidates = new Map<string, BriefRecentRow>()

  for (const raw of inputSessions) {
    const session = readSession(raw)
    if (!session) {
      skippedSessions++
      continue
    }

    const owner = resolvedDept(session, lookup, filings)
    if (!owner) {
      unownedSessions++
      continue
    }
    if (!coveredIds.has(owner.id)) {
      outsideSessions++
      continue
    }

    allTimeSessions++
    const engine = briefEngineOf(session)
    if (engine === 'codex') codexSessions++
    else claudeSessions++

    const firstTimestamp = session.firstTimestamp
    const hasFirstTimestamp = typeof firstTimestamp === 'number' && Number.isFinite(firstTimestamp)
    if (!hasFirstTimestamp) firstTimestampMissing++

    // Claude's timestamp is the newest activity; Codex's is creation. Only the
    // first may support an "active" claim.
    const active = engine === 'claude' && inWindow(session.timestamp, start, end)
    // Never infer first-seen from `timestamp`: without the real field the row
    // cannot say when the conversation started.
    const firstSeen = hasFirstTimestamp && inWindow(firstTimestamp, start, end)
    if (!active && !firstSeen) continue

    let at: number
    let basis: BriefDateBasis
    if (inWindow(session.timestamp, start, end) && (engine === 'codex' || active)) {
      at = session.timestamp
      basis = engine === 'codex' ? 'created' : 'activity'
    } else if (hasFirstTimestamp) {
      // Reachable when the row is admitted only by its first-seen date (its
      // last activity lies in the future, i.e. clock skew).
      at = firstTimestamp
      basis = 'created'
    } else {
      continue
    }

    if (active) activeConversations++
    if (firstSeen) firstSeenConversations++
    candidates.set(session.sessionId, { session, nodeId: owner.id, engine, basis, at })
  }

  const recent = [...candidates.values()]
    .sort((a, b) => b.at - a.at || a.session.sessionId.localeCompare(b.session.sessionId))
    .slice(0, RECENT_LIMIT)

  const empty: BriefEmpty | null = covered.length === 0
    ? 'noNode'
    : allTimeSessions === 0
      ? 'noSessions'
      : candidates.size === 0
        ? 'noActivity'
        : null

  return {
    rootId,
    window: bounds,
    nodes: covered,
    descendants,
    counts: {
      allTimeSessions,
      activeConversations,
      firstSeenConversations,
      windowConversations: candidates.size,
      openSeats: seats.length,
      claudeSessions,
      codexSessions,
      outsideSessions,
      unownedSessions,
    },
    seats,
    recent,
    empty,
    disclosures: {
      ownershipIsFiling: true,
      codexUsesCreationDate: codexSessions > 0,
      claudeUsesActivityDate: claudeSessions > 0,
      firstTimestampMissing,
      messageCountIsLifetime: true,
      localMachineOnly: true,
      outsideOrgExcluded: true,
    },
    skipped: { nodes: skippedNodes, sessions: skippedSessions },
  }
}
