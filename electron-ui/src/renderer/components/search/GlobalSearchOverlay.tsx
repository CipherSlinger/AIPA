// Global cross-session search.
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Loader2, Lock, Search, Sparkles, X } from 'lucide-react'
import type {
  AskHistorySourceData,
  AutomationJobData,
  SessionSearchResultData,
  SkillInfoData,
} from '../../../preload/index'
import { useI18n, useT } from '../../i18n'
import { useChatStore, useDepartmentStore, usePrefsStore, useSessionStore, useUiStore } from '../../store'
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
import { SearchResultRow, relativeTime } from './SearchResultRow'
import { revealSessionEvidence } from './revealSessionEvidence'
import { parseAnswerCitations } from './answerCitations'
import {
  SEARCH_ORIGIN_FILTERS,
  buildSessionOriginMap,
  filterResultsByOrigin,
  isOriginFilterEmpty,
  originFilterForQuery,
  searchResultOrigin,
  type SearchOriginFilter,
} from './searchOriginFilter'
import {
  filterResultsByMatchOrigin,
  isLoadedSetPartial,
  isMatchFilterEmpty,
  nextPageSize,
  pagingCountKey,
  sortSearchResults,
  type SearchMatchFilter,
  type SearchSortOrder,
} from './searchMatchFilter'
import { SearchMatchFilterBar } from './SearchMatchFilterBar'
import {
  MAX_SCOPE_SESSIONS,
  buildDeptAttributionMap,
  buildDeptFilterOptions,
  deptAttributionFor,
  deptFilterForQuery,
  deptFilterOptionText,
  filterResultsByDept,
  isDeptFilterEmpty,
  searchRowKeys,
  sessionIdsInDeptTree,
} from './searchDeptAttribution'
import {
  buildListScope,
  filterByListScope,
  listScopeOmitted,
  resolveListAskIds,
  type ListScope,
} from './searchAskScope'

/**
 * Every ask source records the term it matched on, so a citation click can mark
 * that text instead of the whole question. The preload typing may lag the main
 * process change, so the field is carried here until `AskHistorySourceData`
 * declares it (then the intersection degrades to the declared type).
 */
type AskSource = AskHistorySourceData & { matchedTerm?: string }

/** Optional abort, same reason: the preload typing may not expose it yet. */
type AskHistoryCancelApi = { sessionAskHistoryCancel?: () => void | Promise<void> }

/** Optional progress feed, also tolerated when the preload lags this build. */
type AskHistoryProgressApi = {
  onAskHistoryProgress?: (
    cb: (data: { requestId: string; text: string }) => void,
  ) => () => void
}

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

function projectLabel(project: string, fallback: string): string {
  if (!project) return fallback
  const parts = project.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || project
}

type AskState = 'idle' | 'running' | 'answer'

/**
 * The corpus the visible answer was actually asked with. The two kinds are
 * kept apart because their receipts must say different things: a department
 * scope names a subtree and a total derived from folders and filings, while a
 * list scope names an exact snapshot the user picked in the archive, which may
 * have been capped and may have been narrowed further by a department.
 */
type AskedScope =
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

/** Minimum query length worth an LLM turn — same threshold as the pinned row. */
const ASK_MIN_QUERY = 4

const GHOST_BUTTON_STYLE: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '3px 10px',
  fontFamily: 'inherit',
}

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
 * A plain Enter on a focused pill activates the pill; without this it also
 * bubbles to the dialog and opens the highlighted hit. Ctrl/Cmd+Enter still
 * reaches the dialog's ask shortcut.
 */
function stopPillActivation(e: React.KeyboardEvent) {
  if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === ' ') e.stopPropagation()
}

const FOLLOW_UP_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 16px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
}

const FOLLOW_UP_CHIP_STYLE: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

const CHIP_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 4px',
  margin: '0 1px',
  borderRadius: 4,
  border: '1px solid rgba(99,102,241,0.35)',
  background: 'rgba(99,102,241,0.18)',
  color: 'var(--accent-text)',
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontVariantNumeric: 'tabular-nums',
}

/**
 * Render the answer with its `[n]` markers as chips. Only markers that point
 * at a real source become buttons; an out-of-range number stays literal text
 * rather than offering an action that cannot work.
 */
function AnswerBody({
  answer,
  sources,
  onCite,
}: {
  answer: string
  sources: AskSource[]
  onCite: (n: number, source: AskSource) => void
}) {
  const t = useT()
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = []
    // Shared with the in-chat history row: a number that does not map to a
    // returned source must stay literal text in both places.
    for (const segment of parseAnswerCitations(answer, sources.length)) {
      if (segment.kind === 'text') {
        out.push(segment.text)
        continue
      }
      const source = sources[segment.sourceIndex]
      if (!source) {
        out.push(segment.raw)
        continue
      }
      out.push(
        <button
          key={`cite-${segment.start}`}
          type="button"
          onClick={() => onCite(segment.n, source)}
          aria-label={t('askHistory.citeLabel', {
            n: segment.n,
            title: source.title || t('askHistory.untitled'),
          })}
          style={CHIP_STYLE}
        >
          [{segment.n}]
        </button>,
      )
    }
    return out
  }, [answer, sources, onCite, t])

  return (
    <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
      {nodes}
    </div>
  )
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
  // Newest first is what the main process returns; oldest first is a client-side
  // reversal of the same window, never a second scan.
  const [sortOrder, setSortOrder] = useState<SearchSortOrder>('newest')
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
  // The scope the visible answer was actually asked with, captured when the
  // turn starts. The input stays editable and the toggle disappears with the
  // list, so the receipt and the empty-answer copy must not read live state.
  const [askedScope, setAskedScope] = useState<AskedScope | null>(null)
  const [askAvailable, setAskAvailable] = useState(false)
  const [askState, setAskState] = useState<AskState>('idle')
  const [askAnswer, setAskAnswer] = useState('')
  // Cumulative answer text pushed while the private turn runs. It becomes the
  // visible body until the invoke resolves with the final answer.
  const [askDraft, setAskDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [askSources, setAskSources] = useState<AskSource[]>([])
  // The main process says an empty answer was answered before its transcript
  // index finished building, so the copy must not claim nothing matched.
  const [askIndexing, setAskIndexing] = useState(false)
  // The question the visible answer belongs to. The input stays editable, so
  // the citation click must reopen evidence for the query that produced it.
  const [askedQuestion, setAskedQuestion] = useState('')
  // The last successful exchange, sent with the next ask so "who decided
  // that?" resolves. It survives Stop (a re-ask keeps its context) and is
  // cleared only by the chip's × or by unmounting the overlay.
  const [lastExchange, setLastExchange] = useState<{ question: string; answer: string } | null>(null)
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
  // Set on the way out, whether through `close()` or a direct unmount. An
  // aborted turn still settles, and reporting that settlement would toast
  // "failed" for a turn the user deliberately stopped.
  const dismissedRef = useRef(false)
  const askRunRef = useRef(0)
  // Identifies the ask whose progress events are allowed to paint. A new ask
  // replaces it, so events from the previous turn can never leak in.
  const requestIdRef = useRef('')
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latest input text, readable from a turn that was started several renders
  // ago. The callback's captured `query` is the question as it was asked, so
  // it cannot tell whether the user has edited since.
  const queryRef = useRef('')
  // Ask state readable from the unmount cleanup, which has no captured render.
  const askStateRef = useRef<AskState>('idle')
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
    loadingMore,
    loadMoreFailed,
    loadMore,
    lastPage,
    runId,
  } = useGlobalSessionSearch(query, askState === 'idle')

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
  // Where-in-the-transcript narrowing runs first, on the raw window: its counts
  // describe the search's own result set, so "3 tool matches" means that, not
  // "3 that survived the other filters". Everything downstream sees what it kept.
  const matchFiltered = useMemo(
    () => filterResultsByMatchOrigin(results, matchFilter),
    [results, matchFilter],
  )
  const filtered = useMemo(
    () => filterResultsByOrigin(matchFiltered.visible, originMap, originFilter),
    [matchFiltered, originMap, originFilter],
  )
  // One pass over this query's hits, shared by every row's chip and by the
  // department filter. Rebuilt when the listing, tree or language changes, not
  // per row and never through IPC.
  const deptAttributions = useMemo(
    () => buildDeptAttributionMap({
      results,
      sessions,
      departments,
      locale: resolvedLocale,
      homeDir,
      filings,
    }),
    [results, sessions, departments, resolvedLocale, homeDir, filings],
  )
  const deptOptions = useMemo(
    () => buildDeptFilterOptions(departments, resolvedLocale),
    [departments, resolvedLocale],
  )
  const deptFiltered = useMemo(
    () => filterResultsByDept(filtered.visible, deptAttributions, departments, deptFilter),
    [filtered, deptAttributions, departments, deptFilter],
  )
  const deptFilterLabel = useMemo(
    () => deptOptions.find(option => option.id === deptFilter)?.label ?? '',
    [deptOptions, deptFilter],
  )
  // The archive's snapshot is applied last, after every existing narrowing, so
  // "these rows" means these rows. `listScope.ids` is null when no snapshot was
  // seeded, in which case the rows pass through untouched.
  const listFiltered = useMemo(
    () => filterByListScope(deptFiltered.visible, listScope?.ids ?? null),
    [deptFiltered, listScope],
  )
  // Ordering is applied last, on exactly the rows about to be drawn. The rows
  // stay grouped by project below; each group follows this order, and so do the
  // groups themselves. See `sortSearchResults` for the window caveat.
  const sortedHits = useMemo(
    () => sortSearchResults(listFiltered.visible, sortOrder),
    [listFiltered, sortOrder],
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

  const close = useCallback(() => {
    dismissedRef.current = true
    setOpen(false)
  }, [setOpen])

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

  useEffect(() => { queryRef.current = query }, [query])

  useEffect(() => { askStateRef.current = askState }, [askState])

  // The seed is one-shot: consume it on mount so closing and reopening the
  // overlay does not bring the palette's old question back — and so a later
  // search does not silently stay scoped to a department page's node.
  useEffect(() => {
    const store = useUiStore.getState()
    if (store.globalSearchSeed) store.setGlobalSearchSeed('')
    if (store.globalSearchSeedDeptId) store.setGlobalSearchSeedDeptId(null)
    if (store.globalSearchSeedScope) store.setGlobalSearchSeedScope(null)
  }, [])

  // Live answer text for the running ask. The optional call keeps an older
  // preload (no progress channel) from crashing the overlay.
  useEffect(() => {
    const api = window.electronAPI as (typeof window.electronAPI & AskHistoryProgressApi) | undefined
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = api?.onAskHistoryProgress?.(data => {
        if (!data || data.requestId !== requestIdRef.current) return
        if (askStateRef.current !== 'running') return
        if (dismissedRef.current) return
        if (typeof data.text !== 'string') return
        setAskDraft(data.text)
      })
    } catch {
      // Progress is an enhancement; the final invoke result still lands.
    }
    return () => {
      try { unsubscribe?.() } catch { /* the overlay is going away */ }
    }
  }, [])

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
  }, [])

  // Closing the overlay is the user's "stop". A turn that was still running
  // keeps a model call and the transcript readers' epoch alive behind a window
  // nobody can see, so abort it on the way out. Only an in-flight turn is
  // cancelled — once the answer has landed there is nothing left to abort, and
  // a late cancel could discard a turn a new overlay just started.
  useEffect(() => {
    // A StrictMode remount runs this cleanup once on the same instance; the
    // fresh mount must start undismissed.
    dismissedRef.current = false
    return () => {
      // Even when a parent unmounts the overlay without `close()`, the turn is
      // still the user's to stop and its late result must stay silent.
      dismissedRef.current = true
      if (askStateRef.current !== 'running') return
      const api = window.electronAPI as (typeof window.electronAPI & AskHistoryCancelApi) | undefined
      try {
        void api?.sessionAskHistoryCancel?.()
      } catch {
        // The overlay is going away; a failed abort has nowhere to report.
      }
    }
  }, [])

  // Cheap main-process check (no spawn). Without an authenticated engine the
  // entry point is not rendered at all — a hidden feature beats one that
  // always fails.
  useEffect(() => {
    let cancelled = false
    Promise.resolve(window.electronAPI?.sessionAskHistoryStatus?.())
      .then(result => {
        if (!cancelled) setAskAvailable(Boolean(result?.available))
      })
      .catch(() => { /* feature stays hidden */ })
    return () => { cancelled = true }
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
  }, [runId, matchFilter, originFilter, deptFilter, listScope, sortOrder])
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

  const runAsk = useCallback(async () => {
    const question = query.trim()
    if (!askAvailable || question.length < ASK_MIN_QUERY || askState === 'running') return

    const run = ++askRunRef.current
    // Freeze the scope of this turn before the network call: the result's
    // receipt and empty-answer copy must describe what was asked, not the
    // toggle's state after the user edited the query.
    let scopeForRun: AskedScope | null = null
    // Omitted means the whole history; an empty array is a deliberately empty
    // scope. The list path therefore always sends an array when the toggle is
    // on, even when the snapshot and the department share nothing.
    let scopeIds: string[] | undefined
    if (askScopeOn) {
      if (listScope) {
        const ids = listAskIds ?? []
        scopeIds = ids
        scopeForRun = {
          kind: 'list',
          count: ids.length,
          listed: listScope.sessionIds.length,
          total: listScope.total,
          omitted: listScopeOmitted(listScope.total, listScope.sessionIds.length),
          dept: deptFilter && deptScope ? { label: deptFilterLabel } : undefined,
        }
      } else if (deptFilter && deptScope) {
        scopeIds = deptScope.ids
        scopeForRun = {
          kind: 'dept',
          deptId: deptFilter,
          label: deptFilterLabel,
          count: deptScope.ids.length,
          total: deptScope.total,
          truncated: deptScope.truncated,
        }
      }
    }
    // Fresh id per ask: the main process echoes it on every progress event,
    // and anything carrying an older id is ignored by the listener.
    const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    requestIdRef.current = requestId
    setAskState('running')
    setAskAnswer('')
    setAskDraft('')
    setAskSources([])
    setAskIndexing(false)
    setCopied(false)
    setAskedQuestion(question)
    setAskedScope(scopeForRun)

    try {
      const api = window.electronAPI
      if (!api?.sessionAskHistory) throw new Error('sessionAskHistory unavailable')
      const result = await api.sessionAskHistory({
        question,
        locale: resolvedLocale,
        requestId,
        // The first ask sends nothing; every later one carries only the last
        // exchange, which is all the model needs to resolve a reference.
        history: lastExchange ? [lastExchange] : undefined,
        // Omitted means the whole history; an empty array is a deliberately
        // empty scope, which a department with no filed sessions — or a list
        // snapshot that the department filter leaves nothing of — really is.
        scopeSessionIds: scopeIds,
      })
      if (run !== askRunRef.current || dismissedRef.current) return
      if (queryRef.current.trim() !== question) {
        // The input no longer holds the question this turn was asked for.
        // Showing the answer would attach it to text the user has replaced.
        setAskState('idle')
        setAskDraft('')
        return
      }
      if (!result?.ok) {
        setAskState('idle')
        setAskDraft('')
        if (result?.error === 'busy') addToast('error', t('askHistory.busy'))
        else if (result?.error === 'timeout') addToast('error', t('askHistory.timeout'))
        else if (result?.error === 'empty_response') addToast('error', t('askHistory.empty'))
        else addToast('error', t('askHistory.failed'))
        return
      }
      const answer = result.answer || ''
      setAskAnswer(answer)
      setAskDraft('')
      setAskSources(result.sources || [])
      setAskIndexing(Boolean(result.indexing))
      setAskState('answer')
      // Remember the exchange only when there is an answer to continue from.
      if (answer) setLastExchange({ question, answer })
    } catch {
      if (run !== askRunRef.current || dismissedRef.current) return
      // Stay in the overlay with the query intact so the user can retry.
      setAskState('idle')
      setAskDraft('')
      addToast('error', t('askHistory.failed'))
    }
  }, [
    addToast,
    askAvailable,
    askScopeOn,
    askState,
    deptFilter,
    deptFilterLabel,
    deptScope,
    lastExchange,
    listAskIds,
    listScope,
    query,
    resolvedLocale,
    t,
  ])

  // Stop is a user decision, not an abort of the overlay: bump the run token
  // so the late invoke result is ignored, clear the partial text, and free the
  // main-process slot.
  const stopAsk = useCallback(() => {
    askRunRef.current += 1
    requestIdRef.current = ''
    setAskDraft('')
    setAskIndexing(false)
    setAskState('idle')
    const api = window.electronAPI as (typeof window.electronAPI & AskHistoryCancelApi) | undefined
    try {
      void api?.sessionAskHistoryCancel?.()
    } catch {
      // The turn may already have settled; nothing useful to report.
    }
  }, [])

  // Copy the answer verbatim, citations included — they mean something.
  const copyAnswer = useCallback(() => {
    const textToCopy = askAnswer
    if (!textToCopy) return
    const done = () => {
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
    }
    const fallback = () => {
      try {
        const area = document.createElement('textarea')
        area.value = textToCopy
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(area)
        if (ok) done()
        else addToast('error', t('askHistory.copyFailed'))
      } catch {
        addToast('error', t('askHistory.copyFailed'))
      }
    }
    try {
      void navigator.clipboard.writeText(textToCopy).then(done).catch(fallback)
    } catch {
      fallback()
    }
  }, [addToast, askAnswer, t])

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

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void runAsk()
      return
    }
    // While an ask is running or its answer is showing, the result rows are
    // not visible; only Escape applies. The answer's citation chips are real
    // buttons in the tab order.
    if (askState !== 'idle') {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      // At the last loaded row, ArrowDown asks for the next page instead of
      // wrapping to the top. That makes paging reachable without a mouse even
      // when a filter has hidden every loaded row (flat is empty then). Focus
      // stays on the input; the page appends below and the user keeps arrowing.
      if (flat.length === 0) {
        if (hasMore && !loadingMore) {
          e.preventDefault()
          loadMore()
        }
        return
      }
      e.preventDefault()
      if (active >= flat.length - 1 && hasMore && !loadingMore) {
        loadMore()
        return
      }
      setActive(prev => (prev + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      if (flat.length === 0) return
      e.preventDefault()
      setActive(prev => (prev - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = flat[active]
      if (hit) void openHit(hit)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  const trimmed = query.trim()
  // Rows the archive's cap left out of the snapshot. Used by the band and by
  // the receipt, so the two cannot disagree about how short the snapshot is.
  const listOmitted = listScope
    ? listScopeOmitted(listScope.total, listScope.sessionIds.length)
    : 0
  const showIdle = trimmed.length < 2
  const showLoading = status === 'loading' && trimmed.length >= 2
  // The search found matches but a filter is hiding all of them. The copy must
  // name the filter, not pretend the query had no results. The match filter
  // runs first, so it is the one to blame when it leaves nothing behind; the
  // origin filter only empties what survived it, and so on down the chain.
  const showMatchFilterEmpty = status === 'ready'
    && isMatchFilterEmpty(results.length, matchFiltered.visible.length, matchFilter)
  const showFilterEmpty = status === 'ready'
    && !showMatchFilterEmpty
    && isOriginFilterEmpty(matchFiltered.visible.length, filtered.visible.length, originFilter)
  const showDeptFilterEmpty = status === 'ready'
    && !showMatchFilterEmpty
    && !showFilterEmpty
    && isDeptFilterEmpty(filtered.visible.length, deptFiltered.visible.length, deptFilter)
  // The archive's snapshot is a client-side narrowing applied last. When it
  // hides every remaining row, blame the snapshot and offer a one-click clear.
  // The generic empty copy would say the history has nothing, when in fact the
  // user's own list is what kept the rows out.
  const showScopeEmpty = status === 'ready'
    && trimmed.length >= 2
    && searchedQuery.length >= 2
    && listScope !== null
    && !showMatchFilterEmpty
    && !showFilterEmpty
    && !showDeptFilterEmpty
    && listFiltered.visible.length === 0
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
  const showEmpty = status === 'ready'
    && results.length === 0
    && searchedQuery.length >= 2
    && !listScope
    && !entityPending
    && !hasEntityHits
  // Conversations had nothing, but the user's own building blocks did. One
  // quiet line says so; the sections below carry the hits.
  const showNoConversations = status === 'ready'
    && results.length === 0
    && searchedQuery.length >= 2
    && !listScope
    && hasEntityHits

  // The translated pill label, reused inside the empty-state copy below so no
  // sentence has to hard-code a second name for the same bucket. The coverage
  // lines inside the bar translate their own copies.
  const matchFilterLabel = t(`globalSearch.match.${matchFilter}`)
  // The loaded rows are only part of what the query knows: either more pages
  // can be fetched, or the scan's own ceiling stopped it. Every count below is
  // over the loaded set, and the copy says so when this is true.
  const partialLoaded = isLoadedSetPartial(hasMore, ceilingReached)
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
              // A pinned filter was chosen from a department page, not over
              // these rows, so typing must not drop it; a manual choice still
              // resets with the query.
              setDeptFilter(current => (
                deptPinned ? current : deptFilterForQuery(query, e.target.value, current)
              ))
              // Editing invalidates whatever the previous text produced. An
              // answer is simply stale, so return to the list; a running turn
              // must stop, because it streams for a question the input no
              // longer holds and its late result would be discarded anyway.
              if (askState === 'running') {
                stopAsk()
              } else if (askState === 'answer') {
                setAskState('idle')
                setAskIndexing(false)
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
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 16px',
              borderBottom: '1px solid var(--border)',
              fontSize: 11,
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            <Sparkles size={11} style={{ flexShrink: 0, color: 'var(--accent-text)' }} aria-hidden="true" />
            <span>
              {t(
                ASK_MIN_QUERY - trimmed.length === 1
                  ? 'globalSearch.askMoreCharOne'
                  : 'globalSearch.askMoreChars',
                { count: ASK_MIN_QUERY - trimmed.length },
              )}
            </span>
          </div>
        )}

        {/* Follow-up context. Hidden while a turn runs so it cannot look like
            the answer being streamed belongs to the older question. */}
        {askState !== 'running' && lastExchange && (
          <div style={FOLLOW_UP_ROW_STYLE}>
            <button
              type="button"
              onClick={focusComposer}
              title={t('askHistory.followUpOn', { question: lastExchange.question })}
              style={FOLLOW_UP_CHIP_STYLE}
            >
              {t('askHistory.followUpOn', { question: lastExchange.question })}
            </button>
            <button
              type="button"
              onClick={() => setLastExchange(null)}
              title={t('askHistory.followUpDismiss')}
              aria-label={t('askHistory.followUpDismiss')}
              style={{
                background: 'none',
                border: 'none',
                padding: '0 2px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                flexShrink: 0,
              }}
            >
              <X size={11} />
            </button>
          </div>
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
            loaded={results.length}
            total={totalHits}
            hasMore={hasMore}
            ceilingReached={ceilingReached}
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
            askDraft ? (
              <div
                role="region"
                aria-label={t('askHistory.answerLabel')}
                aria-live="polite"
                style={{ padding: '16px 16px 14px' }}
              >
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {askDraft}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 1,
                      height: '1em',
                      marginLeft: 2,
                      verticalAlign: 'text-bottom',
                      background: 'var(--accent-text)',
                      animation: 'ask-caret-blink 1s steps(1, end) infinite',
                    }}
                  />
                </div>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={stopAsk} style={GHOST_BUTTON_STYLE}>
                    {t('askHistory.stop')}
                  </button>
                </div>
              </div>
            ) : (
              <div
                aria-live="polite"
                style={{
                  ...EMPTY_STYLE,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Loader2
                    size={20}
                    style={{ color: 'var(--accent-text)', animation: 'spin 1s linear infinite' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {t('askHistory.reading')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Stops just the turn and returns to the search list. Closing
                      still dismisses the overlay and aborts through unmount. */}
                  <button type="button" onClick={stopAsk} style={GHOST_BUTTON_STYLE}>
                    {t('askHistory.stop')}
                  </button>
                  <button type="button" onClick={close} style={GHOST_BUTTON_STYLE}>
                    {t('askHistory.cancel')}
                  </button>
                </div>
              </div>
            )
          )}

          {askState === 'answer' && (
            <div
              role="region"
              aria-label={t('askHistory.answerLabel')}
              aria-live="polite"
              style={{ padding: '16px 16px 14px' }}
            >
              {/* After the fact, say which corpus answered: the department the
                  turn was scoped to and how many sessions it offered, or the
                  archive snapshot you picked and any rows its cap left out. A
                  scope with zero sessions is not "answered from 0
                  conversations" — the empty-answer copy below already names the
                  corpus. */}
              {askedScope && askedScope.count > 0 && (
                <div style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {askedScope.kind === 'dept' ? (
                    <>
                      {t('search.deptScope.answerScope', {
                        dept: askedScope.label,
                        count: askedScope.count,
                      })}
                      {askedScope.truncated && (
                        <> {t('search.deptScope.capped', { count: askedScope.count })}</>
                      )}
                    </>
                  ) : (
                    <>
                      {askedScope.dept
                        ? t('search.listScope.answerScopeDept', {
                            dept: askedScope.dept.label,
                            count: askedScope.count,
                          })
                        : t('search.listScope.answerScope', { count: askedScope.count })}
                      {askedScope.omitted > 0 && (
                        <> {t('search.listScope.answerCapped', {
                          listed: askedScope.listed,
                          total: askedScope.total,
                        })}</>
                      )}
                    </>
                  )}
                </div>
              )}
              {askAnswer ? (
                <>
                  {/* The row keeps its height in both states: growing it on
                      "Copied" would shift the answer under the cursor. */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 2, minHeight: 22 }}>
                    <button
                      type="button"
                      onClick={copyAnswer}
                      title={t(copied ? 'askHistory.copied' : 'askHistory.copy')}
                      aria-label={t(copied ? 'askHistory.copied' : 'askHistory.copy')}
                      style={{
                        ...GHOST_BUTTON_STYLE,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        color: copied ? 'var(--success-text)' : 'var(--text-muted)',
                        padding: '3px 8px',
                      }}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      <span>{t(copied ? 'askHistory.copied' : 'askHistory.copy')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={focusComposer}
                      title={t('askHistory.followUp')}
                      aria-label={t('askHistory.followUp')}
                      style={{ ...GHOST_BUTTON_STYLE, padding: '3px 8px' }}
                    >
                      {t('askHistory.followUp')}
                    </button>
                  </div>
                  <AnswerBody
                    answer={askAnswer}
                    sources={askSources}
                    onCite={(_n, source) => void openCitation(source)}
                  />
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {/* A scoped empty answer only says no in-scope transcript
                      matched; it does not claim the corpus never discussed the
                      topic. An empty list scope has no transcript to name, so
                      it says the scope itself held nothing rather than reusing
                      the "no match" wording. The generic copy would erase that
                      difference. */}
                  {askedScope
                    ? askedScope.kind === 'dept'
                      ? t('search.deptScope.noMatch', { dept: askedScope.label })
                      : askedScope.count > 0
                        ? t('search.listScope.noMatch', { count: askedScope.count })
                        : askedScope.dept
                          ? t('search.listScope.emptyAfterDept', { dept: askedScope.dept.label })
                          : t('search.listScope.emptyList')
                    : t(askIndexing ? 'askHistory.stillIndexing' : 'askHistory.noSources')}
                  {askedScope && askIndexing && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {askedScope.kind === 'dept'
                        ? t('search.deptScope.searching')
                        : t('search.listScope.searching')}
                    </div>
                  )}
                </div>
              )}

              {askSources.length > 0 && (
                <div role="group" aria-label={t('askHistory.sourcesTitle')} style={{ marginTop: 14 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {t('askHistory.sourcesTitle')}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {askSources.map((source, i) => (
                      <button
                        key={`${source.sessionId}-${i}`}
                        type="button"
                        onClick={() => void openCitation(source)}
                        aria-label={t('askHistory.citeLabel', {
                          n: i + 1,
                          title: source.title || t('askHistory.untitled'),
                        })}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 8,
                          width: '100%',
                          textAlign: 'left',
                          background: 'transparent',
                          border: 'none',
                          borderLeft: '2px solid transparent',
                          borderRadius: 0,
                          padding: '5px 6px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          color: 'inherit',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(99,102,241,0.12)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <span style={{ ...CHIP_STYLE, cursor: 'inherit' }}>[{i + 1}]</span>
                        <span
                          title={source.title || t('askHistory.untitled')}
                          style={{
                            fontSize: 12,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}
                        >
                          {source.title || t('askHistory.untitled')}
                        </span>
                        <span
                          title={projectLabel(source.project, t('askHistory.unknownProject'))}
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flexShrink: 1,
                          }}
                        >
                          {projectLabel(source.project, t('askHistory.unknownProject'))}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            marginLeft: 'auto',
                            flexShrink: 0,
                            fontVariantNumeric: 'tabular-nums',
                            fontFeatureSettings: '"tnum"',
                          }}
                        >
                          {relativeTime(source.timestamp, t)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {askState === 'idle' && (
            <>
              {/* The archive handed this overlay an exact list of rows. Say so
                  instead of letting a narrowed result set look like a global
                  search: the count is a snapshot, the cap may have left rows
                  out, and one control drops the whole thing. */}
              {listScope && (
                <div
                  role="status"
                  style={{
                    padding: '7px 16px 8px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Lock
                        size={11}
                        aria-hidden="true"
                        style={{ flexShrink: 0, color: 'var(--accent-text)' }}
                      />
                      <span>{t('search.listScope.label', { count: listScope.sessionIds.length })}</span>
                    </div>
                    <div style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                      {t('search.listScope.snapshot')}
                      {listScope.truncated && listOmitted > 0 && (
                        <> {t('search.listScope.capped', { count: listOmitted })}</>
                      )}
                      {listFiltered.hidden > 0 && (
                        <> {t(
                          listFiltered.hidden === 1
                            ? 'search.listScope.rowsHiddenOne'
                            : 'search.listScope.rowsHidden',
                          { count: listFiltered.hidden },
                        )}</>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setListScope(null)}
                    onKeyDown={stopPillActivation}
                    style={{ ...GHOST_BUTTON_STYLE, flexShrink: 0 }}
                  >
                    {t('search.listScope.clear')}
                  </button>
                </div>
              )}

              {/* With a department filter or an archive snapshot active the ask
                  can be narrowed to the same corpus. The scope is independent
                  of the row filter: turning it off asks the whole history while
                  the list stays filtered, so the helper line says exactly which
                  corpus will answer before the user commits. */}
              {askAvailable && ((deptFilter && deptScope) || listScope) && (
                <div
                  style={{
                    padding: '7px 16px 8px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={askScopeOn}
                      onChange={e => setAskScopeOn(e.target.checked)}
                      onKeyDown={stopPillActivation}
                      style={{ margin: 0, accentColor: 'var(--accent-text)', flexShrink: 0 }}
                    />
                    <span>
                      {listScope
                        ? t('search.listScope.askOnly', { count: listScope.sessionIds.length })
                        : t('search.deptScope.askOnly', { dept: deptFilterLabel })}
                    </span>
                  </label>
                  <div style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                    {askScopeOn ? (
                      listScope ? (
                        <>
                          {t('search.listScope.limits', { count: listScope.sessionIds.length })}
                          {deptFilter && deptScope && (
                            <> {t('search.listScope.deptNarrowed', {
                              dept: deptFilterLabel,
                              count: listAskIds ? listAskIds.length : 0,
                            })}</>
                          )}
                        </>
                      ) : (
                        <>
                          {t('search.deptScope.limits', {
                            dept: deptFilterLabel,
                            cap: MAX_SCOPE_SESSIONS,
                          })}
                          {deptScope && deptScope.truncated && (
                            <> {t('search.deptScope.capped', { count: deptScope.ids.length })}</>
                          )}
                        </>
                      )
                    ) : (
                      listScope
                        ? t('search.listScope.askOff')
                        : t('search.deptScope.scopeOff', { dept: deptFilterLabel })
                    )}
                  </div>
                </div>
              )}

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
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('globalSearch.idle')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {t('globalSearch.idleHint')}
                    </div>
                  </div>
                )}

                {showLoading && results.length === 0 && (
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('globalSearch.loading')}</div>
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
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {partialLoaded
                        // Only the loaded rows were looked at; saying "no
                        // matches for this query" would speak for matches the
                        // filter has never seen.
                        ? t('globalSearch.match.emptyLoadedTitle', {
                            origin: matchFilterLabel,
                            loaded: results.length,
                          })
                        : t('globalSearch.match.emptyTitle', { origin: matchFilterLabel })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {partialLoaded
                        ? t('globalSearch.match.emptyLoadedHint', { loaded: results.length })
                        : t(
                            results.length === 1
                              ? 'globalSearch.match.emptyHintOne'
                              : 'globalSearch.match.emptyHint',
                            { count: results.length },
                          )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setMatchFilter('all')}
                      onKeyDown={stopPillActivation}
                      style={{ ...GHOST_BUTTON_STYLE, marginTop: 12 }}
                    >
                      {t('globalSearch.originClear')}
                    </button>
                  </div>
                )}

                {showFilterEmpty && !showLoading && (
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {partialLoaded
                        ? t(
                            results.length === 1
                              ? 'globalSearch.originFilterEmptyLoadedOne'
                              : 'globalSearch.originFilterEmptyLoaded',
                            { count: results.length },
                          )
                        : t(
                            results.length === 1
                              ? 'globalSearch.originFilterEmptyOne'
                              : 'globalSearch.originFilterEmpty',
                            { count: results.length },
                          )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {t('globalSearch.originFilterEmptyHint')}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOriginFilter('all')}
                      onKeyDown={stopPillActivation}
                      style={{ ...GHOST_BUTTON_STYLE, marginTop: 12 }}
                    >
                      {t('globalSearch.originClear')}
                    </button>
                  </div>
                )}

                {showDeptFilterEmpty && !showLoading && (
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {partialLoaded
                        ? t(
                            filtered.visible.length === 1
                              ? 'globalSearch.dept.emptyLoadedOne'
                              : 'globalSearch.dept.emptyLoaded',
                            { count: filtered.visible.length },
                          )
                        : t(
                            filtered.visible.length === 1
                              ? 'globalSearch.dept.emptyOne'
                              : 'globalSearch.dept.empty',
                            { count: filtered.visible.length },
                          )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {t('globalSearch.dept.emptyHint')}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDeptFilter(null)
                        setDeptPinned(false)
                      }}
                      onKeyDown={stopPillActivation}
                      style={{ ...GHOST_BUTTON_STYLE, marginTop: 12 }}
                    >
                      {t('globalSearch.dept.clear')}
                    </button>
                  </div>
                )}

                {showScopeEmpty && !showLoading && (
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {t('search.listScope.emptyTitle', {
                        count: listScope?.sessionIds.length ?? 0,
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {t('search.listScope.emptyHint')}
                    </div>
                    <button
                      type="button"
                      onClick={() => setListScope(null)}
                      onKeyDown={stopPillActivation}
                      style={{ ...GHOST_BUTTON_STYLE, marginTop: 12 }}
                    >
                      {t('search.listScope.clear')}
                    </button>
                  </div>
                )}

                {groups.map(group => {
                  const groupStart = flat.indexOf(group.items[0])
                  return (
                    <div key={group.project || '__none'}>
                      <div
                        title={group.project || undefined}
                        style={{
                          padding: '8px 16px 4px',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.07em',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {projectLabel(group.project, t('globalSearch.unknownProject'))}
                      </div>
                      {group.items.map((hit, offset) => {
                        const index = groupStart + offset
                        return (
                          <SearchResultRow
                            key={rowKeys[index] ?? `${hit.sessionId}-${hit.matchType}-${index}`}
                            hit={hit}
                            query={searchedQuery || trimmed}
                            index={index}
                            selected={index === active}
                            onHover={() => setActive(index)}
                            onOpen={() => void openHit(hit)}
                            origin={searchResultOrigin(hit.sessionId, originMap)}
                            attribution={deptAttributionFor(hit.sessionId, deptAttributions)}
                          />
                        )
                      })}
                    </div>
                  )
                })}
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
                <div style={PAGER_STYLE}>
                  {hasMore && (
                    <button
                      type="button"
                      // Not `disabled`: a disabled element drops focus, and a
                      // page landing under the user's cursor must not move it.
                      // `loadMore` already ignores a second call while one runs.
                      aria-disabled={loadingMore}
                      onClick={loadMore}
                      onKeyDown={e => {
                        // Let the button keep Enter/Space for itself and keep
                        // the arrow keys from moving the row selection behind
                        // the pager while it is focused.
                        if (
                          e.key === 'ArrowDown' || e.key === 'ArrowUp'
                          || e.key === 'Enter' || e.key === ' '
                        ) e.stopPropagation()
                      }}
                      style={loadingMore ? { ...PAGER_BUTTON_STYLE, opacity: 0.7, cursor: 'default' } : PAGER_BUTTON_STYLE}
                    >
                      {loadingMore
                        ? t('globalSearch.paging.loadingMore')
                        : t(
                            nextCount === 1 ? 'globalSearch.paging.showMoreOne' : 'globalSearch.paging.showMore',
                            { count: nextCount },
                          )}
                    </button>
                  )}
                  <div style={PAGER_NOTE_STYLE}>
                    {/* `pagingCountKey` decides between "of", "of at least" and
                        "all": at the ceiling `total` is the ceiling, not the
                        corpus, so "of 200" would state a total nobody measured. */}
                    {t(pagingCountKey(hasMore, ceilingReached), {
                      loaded: results.length,
                      total: totalHits,
                    })}
                  </div>
                  {ceilingReached && !hasMore && (
                    <div style={PAGER_NOTE_STYLE}>
                      {t('globalSearch.paging.ceiling', { ceiling: totalHits })}
                    </div>
                  )}
                  {loadMoreFailed && (
                    <div role="status" style={{ ...PAGER_NOTE_STYLE, color: 'var(--danger-text)' }}>
                      {t('globalSearch.paging.failed')}
                    </div>
                  )}
                </div>
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
        <div
          style={{
            padding: '7px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          {askState === 'idle' ? (
            <>
              <span>{t('globalSearch.navHint')}</span>
              {askAvailable && <span>{t('askHistory.ctrlEnterHint')}</span>}
              {results.length > 0 && (
                <span style={{ marginLeft: 'auto' }}>
                  {listFiltered.visible.length !== results.length
                    // The count is over the loaded rows only. Say so, rather
                    // than let "3 results" read as the whole answer.
                    ? t('globalSearch.paging.footerNarrowed', {
                        visible: listFiltered.visible.length,
                        loaded: results.length,
                      })
                    : t(
                        results.length === 1
                          ? 'globalSearch.resultOne'
                          : 'globalSearch.resultsCount',
                        { count: results.length },
                      )}
                </span>
              )}
            </>
          ) : (
            <span>{t('askHistory.cancelHint')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

const EMPTY_STYLE: React.CSSProperties = {
  padding: '28px 20px',
  textAlign: 'center',
}

/**
 * The pager sits after the last conversation row, still inside the scroll box,
 * so it is reached by scrolling rather than pinned over the rows. It belongs to
 * the conversation list, never to the building-block sections below it.
 */
const PAGER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '12px 16px 18px',
}

const PAGER_BUTTON_STYLE: React.CSSProperties = {
  padding: '5px 14px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--accent-text)',
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const PAGER_NOTE_STYLE: React.CSSProperties = {
  fontSize: 10,
  lineHeight: 1.5,
  color: 'var(--text-muted)',
  textAlign: 'center',
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
