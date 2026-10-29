// The ask-history turn, reduced to the decisions that can be made without
// React or IPC.
//
// The overlay asks one private question about the local transcripts and shows
// the answer in place of the result list. Two things about that turn are easy
// to get quietly wrong, so they live here where they can be read and tested:
//
//   - what corpus is sent. Omitted (`undefined`) means the whole history. An
//     empty array is a deliberately empty scope: a department with nothing
//     filed under it, or an archive snapshot that the department filter leaves
//     nothing of. Falling back to the whole history in that case would answer
//     from conversations the user did not pick, so the empty scope is sent as
//     [] and never widened. An empty department scope therefore costs the engine
//     one turn that is guaranteed to find nothing, not a silent global search.
//     The row filter and this scope are independent: turning the scope off asks
//     the whole history while the list stays filtered.
//   - what the receipt says afterwards. The scope is frozen when the turn
//     starts (`AskedScope`) and the receipt reads that snapshot, never the live
//     toggle, because the input stays editable and the toggle disappears with
//     the list.
//
// Pure and React-free so the harness runs the same code the overlay runs.

import type { AskHistorySourceData } from '../../../../preload/index'
import { listScopeOmitted, type ListScope } from '../searchAskScope'
import type { DeptScopeSource } from '../searchDeptScan'

/**
 * Every ask source records the term it matched on, so a citation click can mark
 * that text instead of the whole question. The preload typing may lag the main
 * process change, so the field is carried here until `AskHistorySourceData`
 * declares it (then the intersection degrades to the declared type).
 */
export type AskSource = AskHistorySourceData & { matchedTerm?: string }

export type AskState = 'idle' | 'running' | 'answer'

/** Minimum query length worth an LLM turn — same threshold as the pinned row. */
export const ASK_MIN_QUERY = 4

/**
 * The corpus the visible answer was actually asked with. The two kinds are
 * kept apart because their receipts must say different things: a department
 * scope names a subtree and a total derived from folders and filings, while a
 * list scope names an exact snapshot the user picked in the archive, which may
 * have been capped and may have been narrowed further by a department.
 */
export type AskedScope =
  | {
      kind: 'dept'
      deptId: string
      label: string
      /** Sessions handed to the ask after the cap. */
      count: number
      /** Distinct sessions in the subtree before the cap. */
      total: number
      truncated: boolean
    }
  | {
      kind: 'list'
      /** Sessions handed to the ask: the snapshot, intersected with any
       *  department filter. Zero is a real empty scope, not a fallback. */
      count: number
      /** Rows the archive listed for this snapshot, after its cap. */
      listed: number
      /** Rows the archive was showing before its cap. */
      total: number
      /** Rows the archive's cap left out of the snapshot. */
      omitted: number
      /** The department filter the snapshot was also intersected with. */
      dept?: { label: string }
    }

export interface AskScopeInput {
  /** Whether the ask reads the rows' corpus; the toggle, not the filter. */
  askScopeOn: boolean
  listScope: ListScope | null
  /** The snapshot intersected with the department scope; null without a snapshot. */
  listAskIds: readonly string[] | null
  deptFilter: string | null
  deptScope: DeptScopeSource | null
  deptFilterLabel: string
}

export interface AskScopeRequest {
  /** `undefined` is the whole history; `[]` is an empty scope. */
  scopeIds: string[] | undefined
  /** What the receipt will name, frozen at the press. */
  scope: AskedScope | null
}

/**
 * Decide one turn's corpus. The snapshot wins over the department because it is
 * the narrower of the two; the department is then recorded as a second
 * narrowing, not as a replacement.
 */
export function deriveAskScope(input: AskScopeInput): AskScopeRequest {
  const { askScopeOn, listScope, listAskIds, deptFilter, deptScope, deptFilterLabel } = input
  if (!askScopeOn) return { scopeIds: undefined, scope: null }

  if (listScope) {
    const ids = listAskIds ? [...listAskIds] : []
    return {
      scopeIds: ids,
      scope: {
        kind: 'list',
        count: ids.length,
        listed: listScope.sessionIds.length,
        total: listScope.total,
        omitted: listScopeOmitted(listScope.total, listScope.sessionIds.length),
        dept: deptFilter && deptScope ? { label: deptFilterLabel } : undefined,
      },
    }
  }

  if (deptFilter && deptScope) {
    return {
      scopeIds: [...deptScope.ids],
      scope: {
        kind: 'dept',
        deptId: deptFilter,
        label: deptFilterLabel,
        count: deptScope.ids.length,
        total: deptScope.total,
        truncated: deptScope.truncated,
      },
    }
  }

  return { scopeIds: undefined, scope: null }
}

/**
 * Fresh id per ask: the main process echoes it on every progress event, and
 * anything carrying an older id is ignored by the listener. Clock and random
 * are injectable so the harness can pin the shape.
 */
export function newAskRequestId(
  now: () => number = Date.now,
  random: () => number = Math.random,
): string {
  return `ask-${now()}-${random().toString(36).slice(2, 10)}`
}

/**
 * A failed turn's toast copy. `error` is a stable code from main; anything
 * unrecognised falls back to the generic failure instead of leaking detail.
 */
export function askErrorKey(error: string | undefined): string {
  if (error === 'busy') return 'askHistory.busy'
  if (error === 'timeout') return 'askHistory.timeout'
  if (error === 'empty_response') return 'askHistory.empty'
  return 'askHistory.failed'
}
