// The overlay's client-side narrowing, in the order it is applied.
//
// Every step runs over rows the scan already returned, so none of them can
// start a scan, race the request sequence or reach the main process again. The
// order is the contract:
//
//   1. transcript chips (match kind + origin)  — counts describe the scan's own
//      result set, so "3 tool matches" means that, not "3 that survived";
//   2. folder                                 — joins the loaded hits to the
//      session listing by id; its options describe the hits, not the rows the
//      chips left, so choosing a folder never removes the option just chosen;
//   3. department                             — one attribution pass per query;
//   4. the archive snapshot                   — applied late, so "these rows"
//      means these rows;
//   5. ordering                               — last, on exactly the rows about
//      to be drawn.
//
// Each step receives what the previous one kept, never the raw scan, which is
// why this lives in one hook: a filter added in the wrong position is a bug
// that is invisible in the UI but real in the counts.

import { useMemo } from 'react'
import type { SessionSearchResultData } from '../../../preload/index'
import type { Department, FilingMap } from '../../store/departmentStore'
import type { UiLocale } from '../departments/deptUtils'
import {
  filterResultsByMatchOrigin,
  sortSearchResults,
  type SearchMatchFilter,
  type SearchSortOrder,
} from './searchMatchFilter'
import {
  filterResultsByOrigin,
  type SearchOriginFilter,
  type SessionOriginMap,
} from './searchOriginFilter'
import {
  deriveSearchFolderOptions,
  filterResultsByFolder,
  type SearchFolderFilter,
  type SearchFolderMap,
  type SearchFolderOptions,
} from './searchFolderFilter'
import {
  buildDeptAttributionMap,
  filterResultsByDept,
  type DeptAttribution,
  type DeptSessionRef,
} from './searchDeptAttribution'
import { filterByListScope, type ListScope } from './searchAskScope'

export interface SearchFilterPipelineArgs {
  results: ReadonlyArray<SessionSearchResultData>
  matchFilter: SearchMatchFilter
  originMap: SessionOriginMap
  originFilter: SearchOriginFilter
  folderMap: SearchFolderMap
  folderFilter: SearchFolderFilter
  homeDir?: string
  platform?: string
  sessions: ReadonlyArray<DeptSessionRef>
  departments: ReadonlyArray<Department>
  locale: UiLocale
  filings?: Readonly<FilingMap>
  deptFilter: string | null
  listScope: ListScope | null
  sortOrder: SearchSortOrder
}

export interface SearchFilterPipeline {
  matchFiltered: ReturnType<typeof filterResultsByMatchOrigin<SessionSearchResultData>>
  filtered: ReturnType<typeof filterResultsByOrigin<SessionSearchResultData>>
  folderOptions: SearchFolderOptions
  folderFiltered: { visible: SessionSearchResultData[]; hidden: number }
  deptAttributions: Map<string, DeptAttribution>
  deptFiltered: { visible: SessionSearchResultData[]; hidden: number }
  listFiltered: { visible: SessionSearchResultData[]; hidden: number }
  sortedHits: SessionSearchResultData[]
}

export function useSearchFilterPipeline(args: SearchFilterPipelineArgs): SearchFilterPipeline {
  const {
    results,
    matchFilter,
    originMap,
    originFilter,
    folderMap,
    folderFilter,
    homeDir,
    platform,
    sessions,
    departments,
    locale,
    filings,
    deptFilter,
    listScope,
    sortOrder,
  } = args

  const matchFiltered = useMemo(
    () => filterResultsByMatchOrigin(results, matchFilter),
    [results, matchFilter],
  )
  const filtered = useMemo(
    () => filterResultsByOrigin(matchFiltered.visible, originMap, originFilter),
    [matchFiltered, originMap, originFilter],
  )
  const folderOptions = useMemo(
    () => deriveSearchFolderOptions(results, folderMap, { homeDir, platform }),
    [results, folderMap, homeDir, platform],
  )
  const folderFiltered = useMemo(
    () => filterResultsByFolder(filtered.visible, folderMap, folderFilter, platform),
    [filtered, folderMap, folderFilter, platform],
  )
  // One pass over this query's hits, shared by every row's chip and by the
  // department filter. Rebuilt when the listing, tree or language changes, not
  // per row and never through IPC.
  const deptAttributions = useMemo(
    () => buildDeptAttributionMap({
      results,
      sessions,
      departments,
      locale,
      homeDir,
      filings,
    }),
    [results, sessions, departments, locale, homeDir, filings],
  )
  const deptFiltered = useMemo(
    () => filterResultsByDept(folderFiltered.visible, deptAttributions, departments, deptFilter),
    [folderFiltered, deptAttributions, departments, deptFilter],
  )
  // `listScope.ids` is null when no snapshot was seeded; the rows pass through.
  const listFiltered = useMemo(
    () => filterByListScope(deptFiltered.visible, listScope?.ids ?? null),
    [deptFiltered, listScope],
  )
  const sortedHits = useMemo(
    () => sortSearchResults(listFiltered.visible, sortOrder),
    [listFiltered, sortOrder],
  )

  return {
    matchFiltered,
    filtered,
    folderOptions,
    folderFiltered,
    deptAttributions,
    deptFiltered,
    listFiltered,
    sortedHits,
  }
}
