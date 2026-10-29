// Global cross-session search: the coordinator.
//
// Mounted from App, not from ChatPanel: the shortcut works from every view,
// and the overlay must survive the view switch that opening a hit causes.
// Rows are grouped by project in the order the main process returned them
// (newest first), so the first group is always the most recently active work.
//
// The same overlay hosts "Ask AIPA about your history": Ctrl+Enter (or the
// pinned first row) sends the typed question to the main process, which
// retrieves local transcripts and runs one private, ephemeral turn. The answer
// replaces the list, and its [n] markers open the cited session at the exact
// message the answer was built from.
//
// This file keeps the state, the derivations and the wiring that the views in
// `./overlay/` are composed from. The invariants the scoped-scan waves
// established live where they are enforced:
//
//   - SCAN NARROWING: only `scanWithCurrentNarrowing` and `scanWholeHistory`
//     (below) set `scanOrigins` / `scanDept`. The filter bar receives them as
//     callbacks; no chip, order or select handler can reach them, so a filter
//     change never starts a scan behind the user's back.
//   - SCAN KEY: `useGlobalSessionSearch` keys its scan on query + origins +
//     department id list (`searchScanKey`). The pinned array is passed as-is,
//     not `[...ids]`, so a new identity every render cannot look like a new
//     narrowing and restart the scan.
//   - COUNTS: every count below is over the loaded set. `SearchPager` gets
//     `loaded`/`total` unchanged and lets `pagingCountKey` choose "of", "of at
//     least" or "all".
//   - EMPTY CORPUS: `deriveAskScope` sends `[]` for an empty department or list
//     scope and never omits the field; an empty scope costs one engine turn
//     that is guaranteed to find nothing, not a silent global search.
//   - ASK LIFE CYCLE: `useAskHistory` owns the run token, the request id, the
//     stopped/timed-out settlement and the draft clearing. See its header.
//   - REQUEST SEQUENCE: a reply is compared against `askRunRef` and the live
//     input before it may paint; a slow reply can never land under a newer
//     query.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Lock, Search, Sparkles, X } from 'lucide-react'
import type {
  AutomationJobData,
  SessionSearchResultData,
  SkillInfoData,
} from '../../../preload/index'
import { useI18n, useT } from '../../i18n'
import {
  useChatStore,
  useDepartmentStore,
  usePrefsStore,
  useSessionStore,
  useUiStore,
} from '../../store'
import {
  ENTITY_HIT_ROWS,
  ENTITY_SEARCH_MIN_CHARS,
  deriveJobHits,
  deriveSkillHits,
  deriveWorkflowHits,
} from '../../lib/entitySearch'
import { pushEscapeHandler } from '../ui/escapeStack'
import { EntityHitGroups, type EntitySourceStatus } from './EntityHitGroups'
import { useGlobalSessionSearch } from './useGlobalSessionSearch'
import { revealSessionEvidence } from './revealSessionEvidence'
import {
  SEARCH_ORIGIN_FILTERS,
  buildSessionOriginMap,
  originFilterForQuery,
  type SearchOriginFilter,
} from './searchOriginFilter'
import {
  isLoadedSetPartial,
  nextPageSize,
  type ScanOrigin,
  type SearchMatchFilter,
  type SearchSortOrder,
} from './searchMatchFilter'
import { SearchMatchFilterBar } from './SearchMatchFilterBar'
import {
  ALL_FOLDERS_FILTER,
  buildSearchFolderMap,
  folderFilterForQuery,
  type SearchFolderFilter,
} from './searchFolderFilter'
import {
  buildDeptFilterOptions,
  deptFilterForQuery,
  deptFilterOptionText,
  searchRowKeys,
  sessionIdsInDeptTree,
} from './searchDeptAttribution'
import {
  buildListScope,
  listScopeOmitted,
  resolveListAskIds,
  type ListScope,
} from './searchAskScope'
import {
  narrowingFromEcho,
  pinDeptScanScope,
  scanDeptState,
  type DeptScanPin,
} from './searchDeptScan'
import { ASK_MIN_QUERY, type AskSource } from './overlay/askHistory'
import { useAskHistory } from './overlay/useAskHistory'
import { handleOverlayKeyDown } from './overlay/keyboard'
import { deriveSearchEmptyFlags } from './searchEmptyFlags'
import { useSearchFilterPipeline } from './useSearchFilterPipeline'
import { AskAnswerView } from './overlay/AskAnswerView'
import { AskMoreCharsHint } from './overlay/AskMoreCharsHint'
import { AskRunningView } from './overlay/AskRunningView'
import { AskScopeControls } from './overlay/AskScopeControls'
import { FollowUpRow } from './overlay/FollowUpRow'
import { OverlayFooter } from './overlay/OverlayFooter'
import { SearchPager } from './overlay/SearchPager'
import { SearchResultGroups } from './overlay/SearchResultGroups'
import {
  DeptFilterEmptyState,
  FolderFilterEmptyState,
  ListScopeEmptyState,
  MatchFilterEmptyState,
  OriginFilterEmptyState,
  SearchIdleState,
  SearchLoadingState,
} from './overlay/SearchEmptyStates'
import {
  EMPTY_STYLE,
  GHOST_BUTTON_STYLE,
  stopPillActivation,
} from './overlay/shared'

// Streaming answers blink a caret at the end. Injected once, module-wide, so
// every overlay mount can reuse it.
;(function ensureAskCaretKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById('ask-history-kf')) return
  const style = document.createElement('style')
  style.id = 'ask-history-kf'
  style.textContent = '@keyframes ask-caret-blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }'
  document.head.appendChild(style)
})()

/**
 * Compact origin pills. The overlay is narrow and already has a query bar, a
 * hint row and a footer, so this row wraps at most once and never shrinks the
 * input or the result list.
 */
const ORIGIN_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
  padding: '6px 16px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
}

/**
 * The department narrowing lives in the same row as the origin pills. A
 * select, not a second row: the overlay is narrow, and a full tree of pills
 * would push the results down for a filter most sessions do not need.
 */
const DEPT_SELECT_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '2px 5px',
  maxWidth: 180,
  flexShrink: 0,
}

const ORIGIN_PILL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 9px',
  borderRadius: 999,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-muted)',
  transition: 'all 0.15s ease',
}

/**
 * Visually hidden but still announced. The overlay is a dialog with no room
 * for another status line, and the announcement exists for screen readers
 * only; a sighted user reads the pager's own count.
 */
const SR_ONLY_STYLE: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export default function GlobalSearchOverlay() {
  const t = useT()
  const { resolvedLocale } = useI18n()
  const addToast = useUiStore(s => s.addToast)
  const setOpen = useUiStore(s => s.setGlobalSearchOpen)
  // The command palette can hand a typed question to the next overlay mount.
  // Read it once here (the state initializer runs on mount only) so typing
  // remains fully controlled afterwards.
  const [query, setQuery] = useState(() => useUiStore.getState().globalSearchSeed || '')
  const [active, setActive] = useState(0)
  // Which origin kind the current result set is narrowed to. It is a client
  // view over the rows already returned — never a new search.
  const [originFilter, setOriginFilter] = useState<SearchOriginFilter>('all')
  // Where the matched text lived: prose, tool output or a thinking block. This
  // is the filter that answers "show me only the command that failed", and it
  // is deliberately sticky across query edits: skipping thinking blocks is a
  // preference about the corpus, not a guess about one query. The scope line
  // below keeps it visible, so it can never hide rows unnoticed.
  const [matchFilter, setMatchFilter] = useState<SearchMatchFilter>('all')
  // Which folder the loaded hits are narrowed to. The hit itself carries no
  // cwd, so this is a view over the session listing joined by `sessionId` — it
  // is applied after the search returns and can never start a scan.
  const [folderFilter, setFolderFilter] = useState<SearchFolderFilter>(ALL_FOLDERS_FILTER)
  // Newest first is what the main process returns; oldest first is a client-side
  // reversal of the same window, never a second scan.
  const [sortOrder, setSortOrder] = useState<SearchSortOrder>('newest')
  // Origins the scan itself is narrowed to, or null for the whole history. Set
  // only by the bar's explicit scoped-scan action and cleared by its "search
  // the whole history again" action. Changing a chip never touches it: a filter
  // change must never start a scan behind the user's back.
  const [scanOrigins, setScanOrigins] = useState<ScanOrigin[] | null>(null)
  // The department the scan itself is narrowed to, frozen at the press: the
  // exact session ids, plus the name and totals the bar announced. A snapshot
  // rather than the live resolution, so a filing change, a session that starts
  // or a node deleted mid-scan cannot retarget the ordering a page will slice.
  // Set only by the same explicit action as `scanOrigins`.
  const [scanDept, setScanDept] = useState<DeptScanPin | null>(null)
  // The query for which the scan was last widened back to the whole history.
  // Keyed by the query so the note disappears as soon as the user searches for
  // something else instead of lingering over unrelated rows.
  const [scanClearedFor, setScanClearedFor] = useState('')
  // The org node whose subtree the current rows are narrowed to, or null for
  // every department. Like the origin filter, this is a client view over rows
  // already returned — it never starts a new search.
  //
  // The department page seeds this before opening the overlay, so the first
  // mount reads it once here (a state initializer, not an effect, so the first
  // result set is already scoped). A node the tree no longer has falls back to
  // All instead of hiding every row behind a filter the user cannot see.
  const [deptFilter, setDeptFilter] = useState<string | null>(() => {
    const seeded = useUiStore.getState().globalSearchSeedDeptId
    if (!seeded) return null
    return useDepartmentStore.getState().departments.some(d => d.id === seeded) ? seeded : null
  })
  // True while the filter came from a department page. The user explicitly
  // asked for a scoped search there, so editing the query must keep the
  // department; a department chosen manually from a normal search is not
  // pinned and keeps the reset-on-query behaviour.
  const [deptPinned, setDeptPinned] = useState(() => deptFilter !== null)
  // The exact rows the archive asked this overlay to search and ask within.
  // Like the department seed it is read once, in a state initializer, so the
  // first result set is already narrowed; a later archive filter change must
  // not retarget an overlay that is already open. `null` is the ordinary
  // global search, and everything below behaves exactly as before.
  const [listScope, setListScope] = useState<ListScope | null>(() =>
    buildListScope(useUiStore.getState().globalSearchSeedScope))
  // Whether the ask reads only this node's subtree (or the archive snapshot).
  // Follows the row scope by default; the user may turn it off and still keep
  // the row filter.
  const [askScopeOn, setAskScopeOn] = useState(() => deptFilter !== null || listScope !== null)
  // The two IPC-backed building-block lists. Each keeps its own status: one
  // list failing must not hide the other, and neither may read as "no matches"
  // when it was never read. `null` means "not read" — never "empty".
  const [skills, setSkills] = useState<SkillInfoData[] | null>(null)
  const [skillStatus, setSkillStatus] = useState<EntitySourceStatus>('loading')
  const [jobs, setJobs] = useState<AutomationJobData[] | null>(null)
  const [jobStatus, setJobStatus] = useState<EntitySourceStatus>('loading')
  // Retry tokens. Bumping one re-runs that source's read without closing the
  // overlay or touching the other list.
  const [skillsReload, setSkillsReload] = useState(0)
  const [jobsReload, setJobsReload] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const openingRef = useRef(false)

  // Search hits carry no origin of their own; the session listing does. A hit
  // that is not listed stays unknown and shows no badge.
  const sessions = useSessionStore(s => s.sessions)
  const homeDir = useSessionStore(s => s.homeDir)
  const departments = useDepartmentStore(s => s.departments)
  // Manual filings override the folder join. Subscribed here so a card's chip,
  // the department filter and a scoped ask all change the moment the user
  // files or un-files a conversation.
  const filings = useDepartmentStore(s => s.filings)
  // Building blocks are not sessions: they are read from their own stores and
  // IPC, never through `session:search`, and the session filters below never
  // touch them.
  const workingDir = useChatStore(s => s.workingDir)
  const workflows = usePrefsStore(s => s.prefs.workflows)
  // A scheduled job carries only a workflow id, so the name the user recognises
  // is resolved here, where the workflow list is at hand.
  const workflowName = useCallback(
    (id: string) => (workflows || []).find(workflow => workflow.id === id)?.name,
    [workflows],
  )
  const originMap = useMemo(() => buildSessionOriginMap(sessions), [sessions])
  // Session id -> recorded cwd. A hit not in this map, or listed without a cwd,
  // has no known folder; the filter represents that instead of guessing from
  // the row's `project` label (a Claude project slug is not a cwd).
  const folderMap = useMemo(() => buildSearchFolderMap(sessions), [sessions])
  const platform = window.electronAPI?.versions?.platform
  const deptOptions = useMemo(
    () => buildDeptFilterOptions(departments, resolvedLocale),
    [departments, resolvedLocale],
  )
  const deptFilterLabel = useMemo(
    () => deptOptions.find(option => option.id === deptFilter)?.label ?? '',
    [deptOptions, deptFilter],
  )
  // The corpus a scoped ask may read: sessions whose resolved owner (manual
  // filing first, then the folder join) is this node or a descendant, in
  // listing order. `null` when no department is selected, so the ask is
  // unrestricted rather than accidentally empty.
  const deptScope = useMemo(
    () => (deptFilter
      ? sessionIdsInDeptTree(sessions, departments, deptFilter, homeDir, filings)
      : null),
    [sessions, departments, deptFilter, homeDir, filings],
  )
  // The live chip as the filter bar describes it. `total` is what the subtree
  // holds before the scope cap, so the bar can say "640, the scan carries 500"
  // before anything runs — and can say "none" without pretending otherwise.
  const deptScanChip = useMemo(
    () => (deptFilter && deptScope
      ? {
          id: deptFilter,
          label: deptFilterLabel,
          total: deptScope.total,
          truncated: deptScope.truncated,
        }
      : null),
    [deptFilter, deptScope, deptFilterLabel],
  )
  // The pin named the way the scan-active line needs it. `gone` is computed
  // from the live tree, so a node deleted while its narrowed scan is on screen
  // is reported instead of being presented as current.
  const liveDeptIds = useMemo(() => new Set(departments.map(dept => dept.id)), [departments])
  const scannedDept = useMemo(
    () => scanDeptState(scanDept, liveDeptIds),
    [scanDept, liveDeptIds],
  )
  // What a list-scoped ask would send: the archive's exact ids, narrowed by the
  // department subtree when one is also selected. Preserving the list order
  // keeps the receipt's count and the rows the user sees describing the same
  // snapshot. An empty result here is a real empty scope; it is never treated
  // as "no list" and widened back to global.
  const listAskIds = useMemo(
    () => (listScope
      ? resolveListAskIds(listScope.sessionIds, deptScope ? deptScope.ids : null)
      : null),
    [listScope, deptScope],
  )

  // The ask turn owns every piece of ask state, including the run token that
  // keeps a stale reply from painting. Its corpus decision is pure and lives in
  // `./overlay/askHistory.ts`.
  const {
    askAvailable,
    askState,
    askAnswer,
    askDraft,
    askSources,
    askIndexing,
    askedQuestion,
    askedScope,
    lastExchange,
    copied,
    runAsk,
    stopAsk,
    dropAnswer,
    clearLastExchange,
    copyAnswer,
    markDismissed,
  } = useAskHistory({
    query,
    resolvedLocale,
    askScopeOn,
    listScope,
    listAskIds,
    deptFilter,
    deptFilterLabel,
    deptScope,
    addToast,
    t,
  })

  // Retrieval inside the ask owns the readers' search epochs; a keystroke that
  // starts another scan would cancel it and empty the digest.
  //
  // The list is hidden for the whole answer view, not just while the turn
  // runs. Gating on `!== 'running'` flipped back on the moment the answer
  // arrived, firing a full-corpus scan nobody could see. Only an idle overlay
  // searches: editing the query (which stops a running turn or drops a stale
  // answer) or a later open resumes it.
  const {
    results,
    status,
    searchedQuery,
    total: totalHits,
    hasMore,
    ceilingReached,
    filteredBy,
    loadingMore,
    loadMoreFailed,
    loadMore,
    lastPage,
    runId,
  } = useGlobalSessionSearch(
    query,
    askState === 'idle',
    scanOrigins,
    // The pinned array, not a fresh `[...ids]`: the hook keys its scan on the
    // id list, and a new identity every render would look like a new narrowing
    // and restart the scan under the user.
    scanDept ? scanDept.ids : null,
  )

  // Every client-side narrowing, in order, in one place — see the hook's header
  // for why the order is the contract.
  const {
    matchFiltered,
    filtered,
    folderOptions,
    folderFiltered,
    deptAttributions,
    deptFiltered,
    listFiltered,
    sortedHits,
  } = useSearchFilterPipeline({
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
    locale: resolvedLocale,
    filings,
    deptFilter,
    listScope,
    sortOrder,
  })

  const close = useCallback(() => {
    markDismissed()
    setOpen(false)
  }, [markDismissed, setOpen])

  // The two deliberate ways to change what the scan collects. Both are buttons
  // in the filter bar; nothing else in this file may set `scanOrigins` or
  // `scanDept`, so a chip click or an order change cannot turn into a scan.
  //
  // One action, whatever the chips say: the origin chip (if one is active) and
  // the department's sessions, using the same resolution a scoped ask uses. The
  // bar names exactly which narrowings will be pushed before this runs.
  const scanWithCurrentNarrowing = useCallback(() => {
    setScanClearedFor('')
    setScanOrigins(matchFilter === 'all' ? null : [matchFilter])
    setScanDept(
      deptFilter && deptScope
        ? pinDeptScanScope(deptFilter, deptFilterLabel, deptScope)
        : null,
    )
  }, [matchFilter, deptFilter, deptScope, deptFilterLabel])
  // Widening also clears the chips: the rows that follow are the whole history,
  // and leaving "prose only" or a department selected over them would describe
  // a scan that is no longer narrowed. The department pin is dropped with them
  // so no later page can slice the old department's corpus.
  const scanWholeHistory = useCallback(() => {
    setScanOrigins(null)
    setScanDept(null)
    setMatchFilter('all')
    setDeptFilter(null)
    setDeptPinned(false)
    setScanClearedFor(query.trim())
  }, [query])

  // Put the caret at the end of the question, selecting nothing. Used by both
  // the follow-up chip and the answer card's "Follow up" action, so the user
  // can extend the question instead of retyping it.
  const focusComposer = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    const end = el.value.length
    try {
      el.setSelectionRange(end, end)
    } catch {
      // Some input types refuse selection ranges; focus alone is enough.
    }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    return pushEscapeHandler(close)
  }, [close])

  // The seed is one-shot: consume it on mount so closing and reopening the
  // overlay does not bring the palette's old question back — and so a later
  // search does not silently stay scoped to a department page's node.
  useEffect(() => {
    const store = useUiStore.getState()
    if (store.globalSearchSeed) store.setGlobalSearchSeed('')
    if (store.globalSearchSeedDeptId) store.setGlobalSearchSeedDeptId(null)
    if (store.globalSearchSeedScope) store.setGlobalSearchSeedScope(null)
  }, [])

  // Both lists are read when the overlay opens and not before: the overlay is
  // only mounted while it is open, so a closed search never pays for either
  // call. The cancelled flag keeps a read that outlives the overlay from
  // setting state on an unmounted component.
  useEffect(() => {
    let cancelled = false
    setSkillStatus('loading')
    const api = window.electronAPI
    if (!api?.skillsList) {
      // An older preload that cannot list skills still has to answer honestly:
      // the section says it could not read the list, not that none matched.
      setSkills(null)
      setSkillStatus('failed')
      return () => { cancelled = true }
    }
    Promise.resolve(api.skillsList(workingDir || undefined))
      .then(list => {
        if (cancelled) return
        setSkills(Array.isArray(list) ? list : [])
        setSkillStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setSkills(null)
        setSkillStatus('failed')
      })
    return () => { cancelled = true }
  }, [workingDir, skillsReload])

  useEffect(() => {
    let cancelled = false
    setJobStatus('loading')
    const api = window.electronAPI
    if (!api?.automationList) {
      setJobs(null)
      setJobStatus('failed')
      return () => { cancelled = true }
    }
    Promise.resolve(api.automationList())
      .then(result => {
        if (cancelled) return
        setJobs(Array.isArray(result?.jobs) ? result.jobs : [])
        setJobStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setJobs(null)
        setJobStatus('failed')
      })
    return () => { cancelled = true }
  }, [jobsReload])

  const groups = useMemo(() => {
    const map = new Map<string, SessionSearchResultData[]>()
    for (const hit of sortedHits) {
      const key = hit.project || ''
      const bucket = map.get(key)
      if (bucket) bucket.push(hit)
      else map.set(key, [hit])
    }
    // Insertion order is the sort's order: the first group holds the newest
    // (or oldest) visible hit, matching the header the user reads first.
    return [...map.entries()].map(([project, items]) => ({ project, items }))
  }, [sortedHits])

  const flat = useMemo(() => groups.flatMap(group => group.items), [groups])
  // Two hits can share a session and match type; a suffixed key keeps React
  // from merging rows that describe different messages.
  const rowKeys = useMemo(() => searchRowKeys(flat), [flat])

  // A filter choice that points at a node the org chart no longer has would
  // hide every row for a reason the user cannot see. Clearing it also drops the
  // page's pin: there is no scoped search left to preserve across typing.
  useEffect(() => {
    if (deptFilter && !deptOptions.some(option => option.id === deptFilter)) {
      setDeptFilter(null)
      setDeptPinned(false)
    }
  }, [deptFilter, deptOptions])

  // A department filter or an archive snapshot turns the ask scope on by
  // default (seeded and manual alike), and clearing both turns it off. The
  // effect only follows those scopes, so unchecking the ask scope while either
  // stays active stays unchecked.
  useEffect(() => {
    setAskScopeOn(deptFilter !== null || listScope !== null)
  }, [deptFilter, listScope])

  // A new query run — or a different narrowing — starts at the best visible
  // hit. `runId` rather than `results`: a loaded page also changes `results`,
  // and landing a page must leave the highlighted row (and the input's focus)
  // exactly where the user had it. A session-list refresh alone moves nothing.
  useEffect(() => {
    setActive(0)
  }, [runId, matchFilter, originFilter, folderFilter, deptFilter, listScope, sortOrder])
  useEffect(() => {
    if (active >= flat.length) setActive(Math.max(0, flat.length - 1))
  }, [flat.length, active])
  // The list scrolls inside a fixed-height box; keyboard navigation must keep
  // the selected row visible without moving the focused input.
  useEffect(() => {
    document.getElementById(`global-search-row-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const openHit = useCallback(async (hit: SessionSearchResultData) => {
    if (openingRef.current) return
    openingRef.current = true
    const searched = query.trim()
    close()
    const ok = await revealSessionEvidence(hit, searched)
    openingRef.current = false
    if (!ok) addToast('error', t('globalSearch.openFailed'))
  }, [addToast, close, query, t])

  const openCitation = useCallback(async (source: AskSource) => {
    if (openingRef.current) return
    openingRef.current = true
    close()
    // Highlight the term this source was retrieved for. Passing the question
    // made the opened message flash without marking anything, because the
    // question as typed is never the text stored in the transcript.
    const ok = await revealSessionEvidence(source, source.matchedTerm || askedQuestion)
    openingRef.current = false
    if (!ok) addToast('error', t('globalSearch.openFailed'))
  }, [addToast, askedQuestion, close, t])

  // Entity rows open the thing itself. The target is handed to the view that
  // owns it and the overlay closes first, so the view switch happens behind a
  // dismissed search. There is nothing to await: none of the three needs a
  // transcript read, so none of them can fail into a toast.
  const openEntityWorkflow = useCallback((workflowId: string) => {
    useUiStore.getState().openWorkflowDetail(workflowId)
    close()
  }, [close])

  const openEntitySkill = useCallback((dirPath: string) => {
    useUiStore.getState().openSkillDetail(dirPath)
    close()
  }, [close])

  const openEntityJob = useCallback((jobId: string) => {
    useUiStore.getState().focusAutomationJob(jobId)
    close()
  }, [close])

  const retrySkills = useCallback(() => setSkillsReload(n => n + 1), [])
  const retryJobs = useCallback(() => setJobsReload(n => n + 1), [])

  const onKeyDown = (e: React.KeyboardEvent) => handleOverlayKeyDown(e, {
    askState,
    flat,
    active,
    hasMore,
    loadingMore,
    loadMore,
    setActive,
    openHit,
    close,
    runAsk,
  })

  const trimmed = query.trim()
  // Rows the archive's cap left out of the snapshot. Used by the band and by
  // the receipt, so the two cannot disagree about how short the snapshot is.
  const listOmitted = listScope
    ? listScopeOmitted(listScope.total, listScope.sessionIds.length)
    : 0
  const showAskEntry = askState === 'idle' && askAvailable && trimmed.length >= ASK_MIN_QUERY
  // The building-block sections share the transcript query but none of its
  // filters. They are hidden while an answer is on screen — that view is about
  // one question, not a list of everything — and below the minimum length,
  // where every list would match itself.
  const entityQuery = askState === 'idle' && trimmed.length >= ENTITY_SEARCH_MIN_CHARS ? trimmed : ''
  // Totals only, derived from the same functions the sections use. This exists
  // so the transcript empty state cannot claim "no matches" over three sections
  // of matches directly below it; the sections still render from their own
  // derivation, so there is one definition of "matches" and no prop plumbing.
  const entityTotals = useMemo(() => {
    if (entityQuery === '') return 0
    return deriveWorkflowHits(workflows, entityQuery, ENTITY_HIT_ROWS).total
      + deriveSkillHits(skills, entityQuery, ENTITY_HIT_ROWS).total
      + deriveJobHits(jobs, entityQuery, ENTITY_HIT_ROWS, { workflowName }).total
  }, [entityQuery, workflows, skills, jobs, workflowName])
  const hasEntityHits = entityTotals > 0
  // "No matches" is a claim about the whole search. While a building-block list
  // is still being read, or when one of them did match, the transcript copy
  // must not make it on their behalf.
  const entityPending = entityQuery !== '' && (skillStatus === 'loading' || jobStatus === 'loading')
  // Which narrowing — if any — may claim this empty screen. Ordered, because a
  // later view may only speak when every earlier one kept something; see
  // `deriveSearchEmptyFlags` for the chain and for why absence is not emptiness.
  const {
    showIdle,
    showLoading,
    showMatchFilterEmpty,
    showOriginFilterEmpty: showFilterEmpty,
    showFolderFilterEmpty,
    showDeptFilterEmpty,
    showScopeEmpty,
    showEmpty,
    showScopedEmpty,
    showNoConversations,
  } = deriveSearchEmptyFlags({
    status,
    trimmedLength: trimmed.length,
    resultsCount: results.length,
    matchVisible: matchFiltered.visible.length,
    matchFilter,
    originVisible: filtered.visible.length,
    originFilter,
    folderVisible: folderFiltered.visible.length,
    folderFilter,
    deptVisible: deptFiltered.visible.length,
    deptFilter,
    hasListScope: listScope !== null,
    listVisible: listFiltered.visible.length,
    searchedQueryLength: searchedQuery.length,
    filteredBy,
    entityPending,
    hasEntityHits,
  })

  // The translated pill label, reused inside the empty-state copy below so no
  // sentence has to hard-code a second name for the same bucket. The coverage
  // lines inside the bar translate their own copies.
  const matchFilterLabel = t(`globalSearch.match.${matchFilter}`)
  // What the reply says it kept. The scoped-empty copy names those narrowings
  // and nothing else: "no matches anywhere in the history" is a claim a
  // department-scoped scan never earned.
  const scopedEcho = narrowingFromEcho(filteredBy)
  const scopedOriginLabels = (scopedEcho?.origins ?? [])
    .map(origin => t(`globalSearch.match.${origin}`))
    .join(' + ')
  // The loaded rows are only part of what the query knows: either more pages
  // can be fetched, or the scan's own ceiling stopped it. Every count below is
  // over the loaded set, and the copy says so when this is true.
  const partialLoaded = isLoadedSetPartial(hasMore, ceilingReached)
  // Shown once after the scan was widened back to the whole history. Keyed by
  // the query it was pressed for, so typing a new one drops it.
  const scanCleared = scanClearedFor !== ''
    && scanClearedFor === trimmed
    && scanOrigins === null
    && scanDept === null
    && filteredBy === null
  // How many rows the next page would actually add (the last page can be short).
  const nextCount = nextPageSize(results.length, totalHits)
  // Built here, not in the hook, because it must be translated. It changes only
  // when a page lands, which is what the polite live region announces.
  const pageAnnouncement = lastPage
    ? t(
        lastPage.added === 1 ? 'globalSearch.paging.announceOne' : 'globalSearch.paging.announce',
        { added: lastPage.added, loaded: lastPage.loaded },
      )
    : ''

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'var(--glass-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'gsearch-fade 0.15s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('globalSearch.title')}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          position: 'fixed',
          top: '12%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 700,
          maxWidth: '92vw',
          maxHeight: '72vh',
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: 'var(--dialog-shadow)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'gsearch-slide 0.18s ease',
        }}
      >
        {/* Query */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            data-global-search-input
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              // A changed query has a different result set, so an origin
              // choice made over the old rows no longer describes it. Reset
              // synchronously — an effect would let a stale filter hide the
              // new query's rows for a frame.
              setOriginFilter(current => originFilterForQuery(query, e.target.value, current))
              // A folder choice described the old rows; a new query's loaded
              // hits may all have run elsewhere, so it starts at All. This only
              // touches the filter — the query text is whatever the user typed.
              setFolderFilter(current => folderFilterForQuery(query, e.target.value, current))
              // A pinned filter was chosen from a department page, not over
              // these rows, so typing must not drop it; a manual choice still
              // resets with the query. While the scan itself carries a
              // department, the chip keeps naming it too — otherwise the next
              // result set would be narrowed at the source by a department the
              // visible control says is not selected.
              setDeptFilter(current => (
                deptPinned || scanDept !== null
                  ? current
                  : deptFilterForQuery(query, e.target.value, current)
              ))
              // Editing invalidates whatever the previous text produced. An
              // answer is simply stale, so return to the list; a running turn
              // must stop, because it streams for a question the input no
              // longer holds and its late result would be discarded anyway.
              if (askState === 'running') {
                stopAsk()
              } else if (askState === 'answer') {
                dropAnswer()
              }
            }}
            placeholder={t('globalSearch.placeholder')}
            aria-label={t('globalSearch.placeholder')}
            aria-controls="global-search-results"
            aria-activedescendant={
              askState === 'idle' && flat.length > 0 ? `global-search-row-${active}` : undefined
            }
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onFocus={e => {
              const bar = e.currentTarget.parentElement
              if (bar) {
                bar.style.boxShadow = 'inset 0 0 0 2px var(--accent-border)'
                bar.style.background = 'var(--accent-bg)'
              }
            }}
            onBlur={e => {
              const bar = e.currentTarget.parentElement
              if (bar) {
                bar.style.boxShadow = 'none'
                bar.style.background = 'transparent'
              }
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              fontSize: 15,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          {showLoading && askState === 'idle' && (
            <Loader2
              size={14}
              style={{ color: 'var(--text-muted)', flexShrink: 0, animation: 'spin 1s linear infinite' }}
            />
          )}
          <button
            onClick={close}
            title={t('globalSearch.close')}
            aria-label={t('globalSearch.close')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              padding: 4,
              borderRadius: 6,
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Ask becomes possible at four characters. Between two and three,
            say so instead of leaving the floor invisible. */}
        {askState === 'idle' && askAvailable && trimmed.length >= 2 && trimmed.length < ASK_MIN_QUERY && (
          <AskMoreCharsHint remaining={ASK_MIN_QUERY - trimmed.length} />
        )}

        {/* Follow-up context. Hidden while a turn runs so it cannot look like
            the answer being streamed belongs to the older question. */}
        {askState !== 'running' && lastExchange && (
          <FollowUpRow
            question={lastExchange.question}
            onFollowUp={focusComposer}
            onDismiss={clearLastExchange}
          />
        )}

        {/* Origin narrowing. It filters the rows already on screen, so changing
            it never starts a scan and never races the search sequencing. */}
        {askState === 'idle' && results.length > 0 && (
          <div role="group" aria-label={t('globalSearch.filtersLabel')} style={ORIGIN_ROW_STYLE}>
            {SEARCH_ORIGIN_FILTERS.map(kind => {
              const active = originFilter === kind
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setOriginFilter(kind)}
                  onKeyDown={stopPillActivation}
                  style={{
                    ...ORIGIN_PILL_STYLE,
                    borderColor: active ? 'rgba(99,102,241,0.5)' : 'var(--border)',
                    background: active ? 'rgba(99,102,241,0.14)' : 'transparent',
                    color: active ? 'var(--accent-text)' : 'var(--text-muted)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {t(`globalSearch.origin.${kind}`)}
                </button>
              )
            })}
            {/* Narrow to one node's subtree. Native options keep the row a
                single compact control; filtering is local and never re-runs
                the query. */}
            {deptOptions.length > 0 && (
              <select
                aria-label={t('globalSearch.dept.filterLabel')}
                title={t('globalSearch.dept.selectTitle')}
                value={deptFilter ?? ''}
                onChange={e => {
                  // A manual choice replaces the page's pin. "All departments"
                  // therefore clears both the filter and the pin, while a
                  // hand-picked node keeps the reset-on-query behaviour.
                  setDeptFilter(e.target.value || null)
                  setDeptPinned(false)
                }}
                onKeyDown={e => {
                  // Let the select keep its own arrow/Enter handling instead of
                  // moving the result selection or opening the highlighted hit.
                  if (
                    e.key === 'ArrowDown' || e.key === 'ArrowUp'
                    || e.key === 'Enter' || e.key === ' '
                  ) e.stopPropagation()
                }}
                style={{
                  ...DEPT_SELECT_STYLE,
                  borderColor: deptFilter ? 'rgba(99,102,241,0.5)' : 'var(--border)',
                  color: deptFilter ? 'var(--accent-text)' : 'var(--text-muted)',
                }}
              >
                <option value="">{t('globalSearch.dept.all')}</option>
                {deptOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {deptFilterOptionText(option)}
                  </option>
                ))}
              </select>
            )}
            {/* The select alone cannot say why typing will not clear it. */}
            {deptFilter && deptPinned && (
              <span
                title={t('search.deptScope.pinned')}
                aria-label={t('search.deptScope.pinned')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: 'var(--accent-text)',
                  flexShrink: 0,
                }}
              >
                <Lock size={11} />
              </span>
            )}
            {deptFilter && deptFiltered.hidden > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 0 }}>
                {t(
                  deptFiltered.hidden === 1
                    ? 'globalSearch.dept.hiddenOne'
                    : 'globalSearch.dept.hidden',
                  { count: deptFiltered.hidden },
                )}
              </span>
            )}
            {originFilter !== 'all' && (
              <>
                {filtered.hidden > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 0 }}>
                    {t(
                      filtered.hidden === 1
                        ? 'globalSearch.originHiddenOne'
                        : 'globalSearch.originHidden',
                      { count: filtered.hidden },
                    )}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setOriginFilter('all')}
                  onKeyDown={stopPillActivation}
                  style={{
                    ...ORIGIN_PILL_STYLE,
                    color: 'var(--accent-text)',
                    borderColor: 'rgba(99,102,241,0.35)',
                    background: 'transparent',
                    marginLeft: 'auto',
                  }}
                >
                  {t('globalSearch.originClear')}
                </button>
              </>
            )}
          </div>
        )}

        {/* Where in the transcript the words matched, plus the order of the
            rows. Both are client-side views over the window the search already
            returned — changing either never starts a scan. The strip owns no
            state: the empty-state copy and the keyboard selection below read
            the same filter, so it has to live with them. */}
        {askState === 'idle' && results.length > 0 && (
          <SearchMatchFilterBar
            filter={matchFilter}
            onFilterChange={setMatchFilter}
            order={sortOrder}
            onOrderChange={setSortOrder}
            counts={matchFiltered.counts}
            hidden={matchFiltered.hidden}
            folderFilter={folderFilter}
            onFolderFilterChange={setFolderFilter}
            folderOptions={folderOptions}
            homeDir={homeDir}
            folderHidden={folderFiltered.hidden}
            loaded={results.length}
            total={totalHits}
            hasMore={hasMore}
            ceilingReached={ceilingReached}
            scannedOrigins={scanOrigins}
            scanEcho={filteredBy}
            onScanWithFilter={scanWithCurrentNarrowing}
            onScanWholeHistory={scanWholeHistory}
            scanCleared={scanCleared}
            dept={deptScanChip}
            scannedDept={scannedDept}
          />
        )}

        {/* Results / ask states */}
        <div
          style={{
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border) transparent',
            minHeight: 120,
          }}
        >
          {askState === 'running' && (
            <AskRunningView draft={askDraft} onStop={stopAsk} onClose={close} />
          )}

          {askState === 'answer' && (
            <AskAnswerView
              askedScope={askedScope}
              answer={askAnswer}
              sources={askSources}
              copied={copied}
              indexing={askIndexing}
              onCopy={copyAnswer}
              onFollowUp={focusComposer}
              onCite={source => void openCitation(source)}
            />
          )}

          {askState === 'idle' && (
            <>
              {/* The archive handed this overlay an exact list of rows, and the
                  ask can be narrowed to the same corpus. Both bands render from
                  the snapshot state; neither starts a scan. */}
              <AskScopeControls
                listScope={listScope}
                listOmitted={listOmitted}
                listHidden={listFiltered.hidden}
                deptFilter={deptFilter}
                deptFilterLabel={deptFilterLabel}
                deptScope={deptScope}
                askScopeOn={askScopeOn}
                listAskCount={listAskIds ? listAskIds.length : 0}
                askAvailable={askAvailable}
                onAskScopeChange={setAskScopeOn}
                onClearListScope={() => setListScope(null)}
              />

              {/* Pinned first row: an explicit affordance, because Ctrl+Enter
                  alone is invisible. Keyboard users can Tab to it; Enter still
                  opens the highlighted search result. */}
              {showAskEntry && (
                <button
                  type="button"
                  onClick={() => void runAsk()}
                  aria-label={t('askHistory.entry')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 16px',
                    background: 'rgba(99,102,241,0.08)',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: '2px solid rgba(99,102,241,0.45)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: 'var(--accent-text)',
                  }}
                >
                  <Sparkles size={14} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{t('askHistory.entry')}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}
                  >
                    {t('askHistory.ctrlEnterHint')}
                  </span>
                </button>
              )}

              <div id="global-search-results" role="listbox" aria-label={t('globalSearch.title')}>
                {showIdle && (
                  <SearchIdleState />
                )}

                {showLoading && results.length === 0 && (
                  <SearchLoadingState />
                )}

                {/* The scan was narrowed at the source and found nothing. The
                    phrase may exist in matches the user excluded, so this must
                    not read as "nothing anywhere". A department-scoped scan
                    never looked outside that department, and the copy says
                    which corpus it spoke for. The way back is one press. */}
                {showScopedEmpty && !showLoading && (
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {t(
                        scopedEcho?.sessionCount != null
                          ? scopedEcho.origins !== null
                            ? 'globalSearch.deptScan.emptyBothTitle'
                            : 'globalSearch.deptScan.emptyDeptTitle'
                          : 'globalSearch.match.scanEmptyTitle',
                        {
                          origin: scopedOriginLabels,
                          dept: scannedDept?.label ?? '',
                          count: scopedEcho?.sessionCount ?? 0,
                        },
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {t(
                        scopedEcho?.sessionCount != null
                          ? scopedEcho.origins !== null
                            ? 'globalSearch.deptScan.emptyBothHint'
                            : 'globalSearch.deptScan.emptyDeptHint'
                          : 'globalSearch.match.scanEmptyHint',
                        {
                          origin: scopedOriginLabels,
                          dept: scannedDept?.label ?? '',
                          count: scopedEcho?.sessionCount ?? 0,
                        },
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={scanWholeHistory}
                      onKeyDown={stopPillActivation}
                      style={{ ...GHOST_BUTTON_STYLE, marginTop: 12 }}
                    >
                      {t('globalSearch.match.scanClear')}
                    </button>
                  </div>
                )}

                {showEmpty && !showLoading && (
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('globalSearch.empty')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {t('globalSearch.emptyHint')}
                    </div>
                    {/* "No matches" is a claim about the transcripts only. When
                        a building-block list could not be read, the empty
                        state has to admit what was not searched, or it reads
                        as "nothing anywhere matched". */}
                    {skillStatus === 'failed' && (
                      <div style={{ fontSize: 11, color: 'var(--danger-text)', marginTop: 6 }}>
                        {t('globalSearch.entities.emptyFailedSkills')}
                      </div>
                    )}
                    {jobStatus === 'failed' && (
                      <div style={{ fontSize: 11, color: 'var(--danger-text)', marginTop: 6 }}>
                        {t('globalSearch.entities.emptyFailedJobs')}
                      </div>
                    )}
                  </div>
                )}

                {/* Conversations had nothing, the building blocks did. Naming
                    only the transcripts keeps the claim true; the sections
                    below carry the hits. */}
                {showNoConversations && !showLoading && (
                  <div style={{ ...EMPTY_STYLE, paddingTop: 14, paddingBottom: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('globalSearch.noConversations')}
                    </div>
                  </div>
                )}

                {/* The search found rows, the match filter kept none. Saying
                    "no matches" here would be false: the phrase exists, just
                    not where this filter looks. Name the filter, count what it
                    hid, and make clearing it one click. */}
                {showMatchFilterEmpty && !showLoading && (
                  <MatchFilterEmptyState
                    partialLoaded={partialLoaded}
                    loaded={results.length}
                    label={matchFilterLabel}
                    onClear={() => setMatchFilter('all')}
                  />
                )}

                {showFilterEmpty && !showLoading && (
                  <OriginFilterEmptyState
                    partialLoaded={partialLoaded}
                    loaded={results.length}
                    onClear={() => setOriginFilter('all')}
                  />
                )}

                {/* The folder choice hid what the earlier views left. Name the
                    filter, count the loaded rows it hid, and make clearing it
                    one click — without touching the query text. */}
                {showFolderFilterEmpty && !showLoading && (
                  <FolderFilterEmptyState
                    partialLoaded={partialLoaded}
                    visible={filtered.visible.length}
                    onClear={() => setFolderFilter(ALL_FOLDERS_FILTER)}
                  />
                )}

                {showDeptFilterEmpty && !showLoading && (
                  <DeptFilterEmptyState
                    partialLoaded={partialLoaded}
                    visible={folderFiltered.visible.length}
                    onClear={() => {
                      setDeptFilter(null)
                      setDeptPinned(false)
                    }}
                  />
                )}

                {showScopeEmpty && !showLoading && (
                  <ListScopeEmptyState
                    count={listScope?.sessionIds.length ?? 0}
                    onClear={() => setListScope(null)}
                  />
                )}

                <SearchResultGroups
                  groups={groups}
                  flat={flat}
                  rowKeys={rowKeys}
                  query={searchedQuery || trimmed}
                  active={active}
                  onHover={setActive}
                  onOpen={hit => void openHit(hit)}
                  originMap={originMap}
                  deptAttributions={deptAttributions}
                />
              </div>

              {/* Polite announcement for a page that just landed. The region
                  is always mounted (an empty live region cannot announce), and
                  its text changes only when rows are appended. Focus stays
                  wherever the user left it — the input keeps the selection, or
                  the button keeps focus; nothing is moved to a new row. */}
              <div role="status" aria-live="polite" style={SR_ONLY_STYLE}>
                {pageAnnouncement}
              </div>

              {/* Paging. The main process scans once per query and serves pages
                  as slices of that one ordering, so asking for the next page
                  costs a slice, never a second corpus walk. The button is a
                  real button (Tab reaches it), and ArrowDown on the last row
                  makes the same call, so paging never needs a mouse. */}
              {askState === 'idle' && results.length > 0 && (
                <SearchPager
                  loaded={results.length}
                  total={totalHits}
                  hasMore={hasMore}
                  ceilingReached={ceilingReached}
                  loadingMore={loadingMore}
                  failed={loadMoreFailed}
                  nextCount={nextCount}
                  onLoadMore={loadMore}
                />
              )}

              {/* After the transcript groups, and outside every session
                  filter: a workflow is not filed by origin or department, so
                  a filter that hides conversations must not hide it. */}
              {entityQuery !== '' && (
                <EntityHitGroups
                  query={entityQuery}
                  workflows={workflows}
                  skills={skills}
                  jobs={jobs}
                  skillStatus={skillStatus}
                  jobStatus={jobStatus}
                  workflowName={workflowName}
                  onOpenWorkflow={openEntityWorkflow}
                  onOpenSkill={openEntitySkill}
                  onOpenJob={openEntityJob}
                  onRetrySkills={retrySkills}
                  onRetryJobs={retryJobs}
                />
              )}
            </>
          )}
        </div>

        {/* Keyboard legend */}
        <OverlayFooter
          askState={askState}
          askAvailable={askAvailable}
          loaded={results.length}
          visible={listFiltered.visible.length}
        />
      </div>
    </div>
  )
}
