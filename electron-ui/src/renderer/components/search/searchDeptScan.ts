// Pushing a department into the scan.
//
// The department chip is normally a view over the rows a search already
// returned. That view can only speak for the loaded window, so "search this
// department" could miss a conversation the unfiltered ceiling never reached.
// The scoped-scan action therefore hands the department's sessions to main,
// which applies them before its ceiling — the same list a scoped ask already
// builds, so the answer's corpus and this scan's corpus cannot disagree.
//
// Two facts make that honest:
//   - the id list is a snapshot taken at the press. Recomputing it per render
//     would let a filing change or a deleted node silently retarget a scan that
//     is already running, and a continuation page would slice a different
//     corpus than the first page did. `pinDeptScanScope` freezes it;
//   - the reply's `filteredBy` echo says what the scan actually kept. The copy
//     reads the echo, never the request, so a scan that failed or was refused
//     cannot be described as narrowed.
//
// Pure and React-free so the overlay and its harness run the same code.

import type { SessionSearchFilterEchoData } from '../../../preload/index'
import { SCAN_ORIGINS, type ScanOrigin } from './searchMatchFilter'

/** The live department chip, as far as the scan action is concerned. */
export interface DeptScanChip {
  id: string
  /** Resolved for the interface language; the pin keeps its own copy. */
  label: string
  /** In-scope conversations before the cap. Zero is a real empty scope. */
  total: number
  /** The resolution dropped conversations beyond the scan's cap. */
  truncated: boolean
}

/**
 * One scan's department narrowing, frozen.
 *
 * `ids` is copied, not aliased: the listing array it came from is rebuilt
 * whenever a conversation starts or a filing changes, and a scan must keep the
 * corpus it announced. `label` is the node's name at press time, so a node
 * deleted while the scan is on screen can still be named instead of becoming
 * an anonymous id.
 */
export interface DeptScanPin {
  deptId: string
  label: string
  ids: string[]
  /** In-scope conversations before the cap. `ids.length` is what is carried. */
  total: number
  truncated: boolean
}

export interface DeptScopeSource {
  ids: readonly string[]
  total: number
  truncated: boolean
}

/**
 * Freeze what the department resolves to right now.
 *
 * The overlay passes the scope it already computes for a scoped ask — there is
 * one department→sessions join in this file's callers, and this function only
 * copies its answer.
 */
export function pinDeptScanScope(
  deptId: string,
  label: string,
  scope: DeptScopeSource,
): DeptScanPin {
  return {
    deptId,
    label,
    ids: [...scope.ids],
    total: scope.total,
    truncated: scope.truncated,
  }
}

/** What a reply says the scan kept, read from main's echo rather than the request. */
export interface ScanEcho {
  /** Origins the scan kept, or null when it kept every origin. */
  origins: ScanOrigin[] | null
  /** Conversations the scan was limited to, or null for the whole history. */
  sessionCount: number | null
  /** The allowlist was cut to the scope cap before the scan. */
  sessionTruncated: boolean
}

/**
 * Read main's `filteredBy` echo. `null` means the reply was not narrowed — the
 * ordinary global scan — and every count describes the whole history.
 *
 * Main echoes all three origins when only the session list narrowed the scan,
 * so a full list means "not narrowed by origin". The interface never requests
 * all three either (a chip is one origin), which is what makes that reading
 * safe rather than lucky. An empty origin list is a scope that matched nothing
 * and stays an empty list, never "all".
 */
export function narrowingFromEcho(echo: SessionSearchFilterEchoData | null): ScanEcho | null {
  if (!echo) return null
  const rawOrigins: unknown[] = Array.isArray(echo.origins) ? echo.origins : []
  const origins = rawOrigins.filter(
    (origin): origin is ScanOrigin => (SCAN_ORIGINS as readonly string[]).includes(origin as string),
  ) as ScanOrigin[]
  const allOrigins = origins.length === SCAN_ORIGINS.length
    && SCAN_ORIGINS.every(origin => origins.includes(origin))
  return {
    origins: allOrigins ? null : origins,
    sessionCount: typeof echo.sessionCount === 'number' ? echo.sessionCount : null,
    sessionTruncated: Boolean(echo.sessionTruncated),
  }
}

/**
 * Whether the reply narrowed on both sides. Used to pick the copy that names
 * both narrowings; a single answer would let one of them go unmentioned.
 */
export function echoNarrowsBoth(echo: ScanEcho | null): boolean {
  return echo !== null && echo.origins !== null && echo.sessionCount !== null
}

/**
 * The department a narrowed scan names, and whether the org chart still has it.
 *
 * A deleted node does not invalidate the scan: its corpus is pinned, so the
 * rows and the pages that follow still belong to the conversations it had. The
 * copy says the node is gone instead of silently presenting it as current.
 */
export interface ScannedDeptState {
  id: string
  label: string
  /** The org chart no longer has this node; the scan still covers its old sessions. */
  gone: boolean
  /** Conversations the scan carried after the cap. */
  carried: number
  /** More conversations qualified than the scan could carry. */
  truncated: boolean
}

export function scanDeptState(
  pin: DeptScanPin | null,
  liveDeptIds: ReadonlySet<string>,
): ScannedDeptState | null {
  if (!pin) return null
  return {
    id: pin.deptId,
    label: pin.label,
    gone: !liveDeptIds.has(pin.deptId),
    carried: pin.ids.length,
    truncated: pin.truncated,
  }
}
