// The overlay's empty-state decision, lifted out of the component.
//
// Every one of these flags answers the same question — "which narrowing, if
// any, is to blame for this empty screen?" — and the answer is ordered: the
// match filter runs first, then origin, then folder, then department, then the
// archive snapshot. A later stage may only claim the screen when every earlier
// stage kept something, which is why the chain's order is the whole rule and
// why it is written once, as a pure function, instead of being re-derived at
// each branch.
//
// The other half of the rule is that absence is not emptiness: `showEmpty`
// requires that the scan itself returned nothing, that it was not narrowed by
// the user, that no building-block list is still loading or matched, and that
// no filter has already spoken. Two screens must never both claim "nothing
// here" for different reasons.

import type { SessionSearchFilterEchoData } from '../../../preload/index'
import type { GlobalSearchStatus } from './useGlobalSessionSearch'
import { isMatchFilterEmpty, type SearchMatchFilter } from './searchMatchFilter'
import { isOriginFilterEmpty, type SearchOriginFilter } from './searchOriginFilter'
import { isFolderFilterEmpty, type SearchFolderFilter } from './searchFolderFilter'
import { isDeptFilterEmpty } from './searchDeptAttribution'

export interface SearchEmptyInputs {
  status: GlobalSearchStatus
  /** Query length after trimming; the overlay hides the list below 2 chars. */
  trimmedLength: number
  /** Rows the scan returned, before any client-side narrowing. */
  resultsCount: number
  /** Rows kept by the transcript-level (match) chips. */
  matchVisible: number
  matchFilter: SearchMatchFilter
  /** Rows kept by the origin chips. */
  originVisible: number
  originFilter: SearchOriginFilter
  /** Rows kept by the folder view. */
  folderVisible: number
  folderFilter: SearchFolderFilter
  /** Rows kept by the department view. */
  deptVisible: number
  deptFilter: string | null
  /** Whether an archive snapshot is narrowing the rows. */
  hasListScope: boolean
  /** Rows kept by the snapshot. */
  listVisible: number
  /** Task rows that match and survive the department filter. */
  taskHitCount: number
  /** Task rows that match before the department filter. */
  taskDeptTotal: number
  /** The task store has not finished its first read, so task absence is unknown. */
  tasksPending: boolean
  /** Length of the query the displayed rows were actually searched for. */
  searchedQueryLength: number
  /** The originating narrowing the scan reported, if it was narrowed. */
  filteredBy: SessionSearchFilterEchoData | null
  /** A building-block list is still being read for this query. */
  entityPending: boolean
  /** A building-block list matched this query. */
  hasEntityHits: boolean
  /**
   * The query whose scan was widened back with the bar's own action, or ''.
   * Keyed by the query so the note disappears as soon as the user searches for
   * something else instead of lingering over unrelated rows.
   */
  scanClearedFor: string
  /** The query in the box right now, trimmed. */
  trimmedQuery: string
  /** Whether the scan is still narrowed, so a widening note cannot stand. */
  scanPinned: boolean
}

export interface SearchEmptyFlags {
  /** Fewer than two characters: the list is hidden, not empty. */
  showIdle: boolean
  showLoading: boolean
  showMatchFilterEmpty: boolean
  showOriginFilterEmpty: boolean
  showFolderFilterEmpty: boolean
  showDeptFilterEmpty: boolean
  /** The archive snapshot hid everything that survived the other views. */
  showScopeEmpty: boolean
  /** The history itself has nothing for this query. */
  showEmpty: boolean
  /** The scan was narrowed by the user and found nothing in that scope. */
  showScopedEmpty: boolean
  /** No conversations matched, but a building-block list did. */
  showNoConversations: boolean
  /**
   * The scan was widened back for this exact query, and nothing has narrowed it
   * since. Shown once, then dropped by typing or by the next press.
   */
  showScanCleared: boolean
}

export function deriveSearchEmptyFlags(input: SearchEmptyInputs): SearchEmptyFlags {
  const ready = input.status === 'ready'
  const showIdle = input.trimmedLength < 2
  const showLoading = input.status === 'loading' && input.trimmedLength >= 2
  // A matching task row is still on screen, so no transcript filter may claim
  // the whole result set is empty. While the task list is still being read,
  // absence is not yet evidence either: never flash "no matches" before it.
  const noTaskHits = input.taskHitCount === 0
  const tasksSettled = !input.tasksPending

  const showMatchFilterEmpty = ready && noTaskHits && tasksSettled
    && isMatchFilterEmpty(input.resultsCount, input.matchVisible, input.matchFilter)
  const showOriginFilterEmpty = ready && noTaskHits && tasksSettled
    && !showMatchFilterEmpty
    && isOriginFilterEmpty(input.matchVisible, input.originVisible, input.originFilter)
  const showFolderFilterEmpty = ready && noTaskHits && tasksSettled
    && !showMatchFilterEmpty
    && !showOriginFilterEmpty
    && isFolderFilterEmpty(input.originVisible, input.folderVisible, input.folderFilter)
  // The department filter applies to tasks too, so the empty decision and its
  // count are over both groups. A task outside the node is hidden here exactly
  // like a conversation outside it.
  const showDeptFilterEmpty = ready && tasksSettled
    && !showMatchFilterEmpty
    && !showOriginFilterEmpty
    && !showFolderFilterEmpty
    && isDeptFilterEmpty(
      input.folderVisible + input.taskDeptTotal,
      input.deptVisible + input.taskHitCount,
      input.deptFilter,
    )
  const showScopeEmpty = ready && noTaskHits && tasksSettled
    && input.trimmedLength >= 2
    && input.searchedQueryLength >= 2
    && input.hasListScope
    && !showMatchFilterEmpty
    && !showOriginFilterEmpty
    && !showFolderFilterEmpty
    && !showDeptFilterEmpty
    && input.listVisible === 0

  // The scan was narrowed and found nothing. Saying "no matches" here would
  // speak for the whole history, which this scan never searched. A matching
  // task is outside that scan entirely and must not be hidden by the claim.
  const showScopedEmpty = ready && noTaskHits && tasksSettled
    && input.resultsCount === 0
    && input.filteredBy !== null
    && input.searchedQueryLength >= 2

  const noTranscriptMatches = ready
    && input.resultsCount === 0
    && input.searchedQueryLength >= 2
    && input.filteredBy === null
    && !input.hasListScope
  const showEmpty = noTranscriptMatches
    && !input.entityPending
    && !input.hasEntityHits
    && noTaskHits
    && tasksSettled
  const showNoConversations = noTranscriptMatches
    && input.entityPending === false
    && (input.hasEntityHits || input.taskHitCount > 0)

  // Said once, for the query it was pressed for, and only while the scan really
  // is the whole history again — a reply that still echoes a narrowing, or a
  // pin left standing, would make the sentence false.
  const showScanCleared = input.scanClearedFor !== ''
    && input.scanClearedFor === input.trimmedQuery
    && !input.scanPinned
    && input.filteredBy === null

  return {
    showIdle,
    showLoading,
    showMatchFilterEmpty,
    showOriginFilterEmpty,
    showFolderFilterEmpty,
    showDeptFilterEmpty,
    showScopeEmpty,
    showEmpty,
    showScopedEmpty,
    showNoConversations,
    showScanCleared,
  }
}
