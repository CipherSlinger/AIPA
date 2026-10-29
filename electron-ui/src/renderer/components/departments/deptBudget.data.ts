// The daily cap on a department's unattended spend, reduced to facts a surface
// can print and a payload the renderer can sync.
//
// Main owns enforcement and the window arithmetic. The renderer owns the org
// tree, so it resolves "this department and everything under it" to node ids
// here and sends them along; main has no tree to resolve on its own. This module
// is React-free and pure so both claims can be tested without a DOM:
//
//   * a cap request is parsed conservatively — a comma is refused rather than
//     guessed as a thousands separator or a decimal comma;
//   * a failed read is never "no cap", and an absent spend figure is never `$0`;
//   * a cap whose membership is empty is a broken sync and is reported as such,
//     not hidden behind a plausible-looking line;
//   * every tree walk reuses `briefSubtree`, so the cap covers exactly the nodes
//     the Brief shows — a second walk could drift.

import type { AutomationDeptBudgetReportData } from '../../../preload'
import type { Department } from '../../store'
import { briefSubtree } from './deptBrief.data'

/** One sync entry: the node the cap was set on and the ids it covers. */
export interface DeptBudgetSyncEntry {
  departmentId: string
  memberIds: string[]
}

/** The same ceiling main enforces; a larger number is refused before IPC. */
export const DEPT_BUDGET_MAX_USD = 10_000

export type DeptBudgetParseReason = 'empty' | 'nan' | 'negative' | 'zero' | 'tooLarge'

export type DeptBudgetParseResult =
  | { ok: true; usd: number }
  | { ok: false; reason: DeptBudgetParseReason }

/**
 * A plain decimal, with one optional sign. Scientific notation, currency
 * suffixes other than `usd`, and grouping separators all fall outside it: they
 * are ambiguous enough that refusing is more honest than picking a reading.
 */
const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/

/**
 * Read what the user typed into the cap field.
 *
 * Accepted shapes are the ones a person plausibly writes: `5`, `5.5`, `$5`,
 * `5 usd`, with surrounding space. `,` is always refused — `1,000` could be a
 * thousand or one, depending on where the user lives, and a cap is not a place
 * to guess. Reasons are distinct so the surface can say "positive amount" or
 * "above the ceiling" rather than one vague failure.
 */
export function parseBudgetInput(raw: string): DeptBudgetParseResult {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return { ok: false, reason: 'empty' }

  // Currency is written before or after the number, never both. A sign may sit
  // outside it (`-$5`), so the sign is preserved while the `$` is removed.
  let value = text
  const signedDollar = value.match(/^([+-])\$/)
  if (signedDollar) value = signedDollar[1] + value.slice(2).trim()
  else if (value.startsWith('$')) value = value.slice(1).trim()
  value = value.replace(/\s*usd$/i, '').trim()
  if (!value) return { ok: false, reason: 'nan' }

  // Refuse grouping and decimal commas outright instead of normalising them.
  if (value.includes(',')) return { ok: false, reason: 'nan' }
  if (!NUMERIC.test(value)) return { ok: false, reason: 'nan' }

  const usd = Number(value)
  if (!Number.isFinite(usd)) return { ok: false, reason: 'nan' }
  if (usd < 0) return { ok: false, reason: 'negative' }
  if (usd === 0) return { ok: false, reason: 'zero' }
  if (usd > DEPT_BUDGET_MAX_USD) return { ok: false, reason: 'tooLarge' }
  return { ok: true, usd }
}

export type DeptBudgetLoad = 'loading' | 'ready' | 'error'

export interface DeptBudgetFacts {
  /** `loading` and `error` are distinct from `none`; `none` is a real "no cap". */
  state: 'loading' | 'none' | 'set' | 'error'
  /** Present only for `state === 'set'`. */
  capUsd?: number
  /**
   * Present only when main reported money. An absent figure is displayed as
   * "could not be read", never synthesised into `$0`.
   */
  spentUsd?: number
  /** The spend figure is a floor: some runs reported no cost, or history is bounded. */
  floor: boolean
  /** Runs this cap actually held; worth saying out loud when positive. */
  heldRuns: number
  /**
   * Nodes the stored membership names. Zero on a set cap means the last sync
   * covered nothing — a real defect the surface must show, not paper over.
   */
  coversNodes: number
  /** Last membership sync, when the payload carries a usable timestamp. */
  syncedAt?: number
}

function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

/**
 * Turn the report for one department (or its absence) into a display fact.
 *
 * `kind` is the IPC status, kept separate from the payload so a failed or
 * in-flight read cannot be mistaken for "this department has no cap". A ready
 * read with no report *is* `none`; a report that cannot name a usable positive
 * cap is `error`, because a cap exists but its value cannot be read.
 */
export function describeDeptBudget(
  report: AutomationDeptBudgetReportData | null | undefined,
  kind: DeptBudgetLoad,
): DeptBudgetFacts {
  const blank = { floor: false, heldRuns: 0, coversNodes: 0 }

  // A *re-read* keeps the last answer on screen. The cap only changes when the
  // user changes it, while `spentUsd`/`heldRuns` move on every finished run; if
  // loading blanked the line, the control would flicker under the panel every
  // time an automation completed and a hold notice could blink out mid-read.
  // With no previous report there is nothing to keep, so loading stays loading.
  if (kind === 'loading' && !report) return { state: 'loading', ...blank }
  if (kind === 'error') return { state: 'error', ...blank }

  // A ready answer with no entry really is "no cap for this node".
  if (!report || typeof report !== 'object') return { state: 'none', ...blank }

  // Main refuses a non-positive limit, so one in a stored report is unreadable,
  // not a cap of zero and not the absence of a cap.
  if (typeof report.usd !== 'number' || !Number.isFinite(report.usd) || report.usd <= 0) {
    return { state: 'error', ...blank }
  }

  const raw = report as AutomationDeptBudgetReportData & Record<string, unknown>
  const memberIds = Array.isArray(raw.memberIds) ? raw.memberIds : []
  // Duplicates cannot make the membership larger; count distinct node ids.
  const coversNodes = new Set(
    memberIds.filter((id): id is string => typeof id === 'string' && id.length > 0),
  ).size

  const unreportedRuns = readCount(raw.unreportedRuns)
  const heldRuns = readCount(raw.heldRuns)
  const partial = raw.partial === true
  const unmeasured = raw.unmeasured === true

  // `unmeasured` says no total can be read, so even a stray `spentUsd` is not
  // shown as one. An absent field is missing information, not zero.
  const spentUsd = !unmeasured
    && typeof raw.spentUsd === 'number'
    && Number.isFinite(raw.spentUsd)
    && raw.spentUsd >= 0
    ? raw.spentUsd
    : undefined

  // With a figure: any run that reported nothing, a bounded history, or an
  // unmeasured flag makes it a floor. Without a figure: the floor claim still
  // applies when runs exist, so the surface can explain why no number is shown.
  const floor = spentUsd !== undefined
    ? unreportedRuns > 0 || partial || unmeasured
    : unreportedRuns > 0 || unmeasured

  const syncedAt = typeof raw.syncedAt === 'number' && Number.isFinite(raw.syncedAt)
    ? raw.syncedAt
    : undefined

  return {
    state: 'set',
    capUsd: report.usd,
    spentUsd,
    floor,
    heldRuns,
    coversNodes,
    ...(syncedAt !== undefined ? { syncedAt } : {}),
  }
}

/**
 * One sync entry per org node, in the tree's own array order.
 *
 * `memberIds` is the node plus its whole subtree, resolved by the same walk the
 * Brief uses. Duplicate nodes are collapsed so a malformed store cannot make
 * main see two different memberships for one cap.
 */
export function subtreeEntries(departments: readonly Department[]): DeptBudgetSyncEntry[] {
  if (!Array.isArray(departments)) return []

  const nodes = departments as Department[]
  const entries: DeptBudgetSyncEntry[] = []
  const seen = new Set<string>()

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    if (typeof node.id !== 'string' || !node.id) continue
    if (seen.has(node.id)) continue
    seen.add(node.id)
    entries.push({
      departmentId: node.id,
      memberIds: briefSubtree(nodes, node.id).map(member => member.id),
    })
  }
  return entries
}

/**
 * Whether a report names the node the Brief is showing. Exact match only: a
 * parent's cap is a different cap, even though its membership may include this
 * node, because the Brief edits the cap set on its own department.
 */
export function budgetCovers(
  report: AutomationDeptBudgetReportData | null | undefined,
  departmentId: string,
): boolean {
  if (!report || typeof report !== 'object') return false
  if (typeof departmentId !== 'string' || !departmentId) return false
  return report.departmentId === departmentId
}
