/**
 * Paged cross-session search.
 *
 * `session:search` used to stop at its result limit, so the overlay could only
 * ever show the newest N hits: a phrase that occurs fifty times in older
 * conversations was unreachable, and the origin/department filters could only
 * narrow the slice that happened to come back. Paging fixes that, and it must
 * do so without paying for the scan again.
 *
 * The scan is the expensive part — two transcript indexes walked newest-first,
 * with disk fallback for transcripts the index could not hold. So it runs once
 * per query, up to a hard ceiling, and the ordered rows are kept. A page is a
 * slice of that one list. That is what makes page two cheap, and it is also
 * what makes the pages consistent: every page is a window over the same
 * ordering, so a row can neither repeat nor be skipped between pages.
 *
 * The ceiling bounds the work. Two hundred rows is five pages of forty — enough
 * for the "there was an older conversation about this" case that motivated
 * paging — while keeping a query that matches thousands of messages from
 * walking the whole corpus for a list nobody will read. A hit that is not in
 * the ceiling is reported, never silently dropped: `ceilingReached` tells the
 * UI that older matches exist but were not collected.
 *
 * The origin filter and the session allowlist travel into the scan instead of
 * being applied to the page it returned. That distinction is the whole point:
 * a filter over a loaded page can only speak for rows that happened to load,
 * and a match outside the ceiling was never even looked at. Because the counts
 * now describe a narrowed scan, every reply that was narrowed echoes what the
 * scan kept (`filteredBy`) — the UI must never describe a filtered total as if
 * it came from the whole history.
 */
import { searchSessions as searchClaudeSessions } from './session-reader'
import { searchSessions as searchCodexSessions } from '../codex/codex-session-reader'
import { parseScopeSessionIds, type ParsedScope } from './ask-scope'
import type { SearchResult, SearchScanFilter, SearchTextOrigin } from './search-types'

/** Rows one page holds when the caller does not ask for a size. */
export const SEARCH_PAGE_SIZE = 40

/** Hard ceiling on how many hits one query's scan will collect. */
export const SEARCH_RESULT_CEILING = 200

/** The origins a scan may be narrowed to. Order is the UI's chip order. */
export const SEARCH_ORIGINS: readonly SearchTextOrigin[] = ['prose', 'tool', 'thinking']

/**
 * Stable codes for input the handler refuses. The message carries the code too:
 * a rejected `ipcMain.handle` reaches the renderer as a plain Error whose custom
 * properties are stripped, so the code has to survive inside the text.
 */
export const SEARCH_PAGE_ERROR_CODE = {
  invalidOrigins: 'SEARCH_INVALID_ORIGINS',
} as const

/** A refused `session:searchPage` request. Bad input never degrades to a full scan. */
export class SearchPageInputError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'SearchPageInputError'
    this.code = code
  }
}

/** What a narrowed scan actually kept, echoed so the reply explains its own counts. */
export interface SearchFilterEcho {
  /** Origins the scan kept. An empty array is a scope that collected nothing. */
  origins: SearchTextOrigin[]
  /** Session ids the scan was limited to, or null for the whole history. */
  sessionCount: number | null
  /** More ids arrived than the scope cap and were dropped before the scan. */
  sessionTruncated: boolean
}

/**
 * How long a completed scan may answer later pages. A user who pages through
 * results for a couple of minutes keeps one ordering; a page requested after a
 * long pause scans again (correct, just slower) rather than serve a list that
 * predates the conversation the user just had.
 */
const PAGE_CACHE_TTL_MS = 2 * 60 * 1000

/** One IPC reply. `results` is the requested page, never the whole ceiling. */
export interface SearchPageReply {
  results: SearchResult[]
  /**
   * Distinct hits this query's scan knows about. At the ceiling this is the
   * ceiling, not the corpus total — the caller must check `ceilingReached`
   * before describing it as "all matches".
   */
  total: number
  /** Further rows can be loaded by asking for a larger offset. */
  hasMore: boolean
  /** The scan stopped at the ceiling; older hits exist and were not collected. */
  ceilingReached: boolean
  /**
   * What the scan narrowed to, present only on a narrowed scan. `total`,
   * `hasMore` and `ceilingReached` describe that narrowed set, never the
   * unfiltered history — this field is how the caller can tell the difference.
   */
  filteredBy?: SearchFilterEcho
}

interface ScanEntry {
  query: string
  /** Query + narrowing, so a page never slices a scan of a different filter. */
  key: string
  at: number
  rows: SearchResult[]
  ceilingReached: boolean
  filteredBy?: SearchFilterEcho
}

/** The most recent completed scan. One slot: pages belong to one query at a time. */
let cache: ScanEntry | null = null

/**
 * Scans are serialized. Both readers cancel a superseded scan through a
 * module-level epoch, so two page requests in flight would race and one would
 * come back empty. The queue also keeps a page from slicing a list that a
 * concurrent first page is still replacing.
 */
let queue: Promise<unknown> = Promise.resolve()

function readOffset(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : NaN
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(n, 0), SEARCH_RESULT_CEILING)
}

function readLimit(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : NaN
  if (!Number.isFinite(n)) return SEARCH_PAGE_SIZE
  return Math.min(Math.max(n, 1), 100)
}

/**
 * The origin narrowing a caller asked for, or null for none.
 *
 * A value that is neither absent nor an array of known origins is refused with
 * a stable code. Silently ignoring it would run the full scan the caller did
 * not ask for and then label the answer as narrowed — the worst of both.
 */
function readOrigins(raw: unknown): SearchTextOrigin[] | null {
  if (raw === undefined || raw === null) return null
  if (!Array.isArray(raw)) {
    throw new SearchPageInputError(
      SEARCH_PAGE_ERROR_CODE.invalidOrigins,
      'origins must be an array of prose, tool or thinking',
    )
  }
  const origins: SearchTextOrigin[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string' || !(SEARCH_ORIGINS as readonly string[]).includes(entry)) {
      throw new SearchPageInputError(
        SEARCH_PAGE_ERROR_CODE.invalidOrigins,
        `unsupported origin ${JSON.stringify(entry)}`,
      )
    }
    if (!origins.includes(entry as SearchTextOrigin)) origins.push(entry as SearchTextOrigin)
  }
  return origins
}

/** A request, normalized: the page plus what the scan may report. */
interface ScanRequest {
  query: string
  origins: SearchTextOrigin[] | null
  scope: ParsedScope | null
  /** Null when nothing was narrowed, so the engines take their unchanged path. */
  filter: SearchScanFilter | null
  filteredBy?: SearchFilterEcho
  key: string
}

/**
 * Run both engines for one query and return the ordered, de-duplicated hit
 * list, capped at the ceiling.
 *
 * Each engine is asked for one row past the ceiling so a full ceiling is known
 * to be a truncation rather than a coincidence. Both engines scan their files
 * newest-first and stop at that count; the union is then ordered by the hit's
 * own timestamp, which is the ordering the overlay has always shown.
 */
async function scanToCeiling(request: ScanRequest): Promise<{
  rows: SearchResult[]
  ceilingReached: boolean
}> {
  // An empty origin list or an empty allowlist is a scope that matches nothing.
  // Running the engines would walk the corpus to discard every row.
  if (request.origins?.length === 0 || request.scope?.ids.length === 0) {
    return { rows: [], ceilingReached: false }
  }

  const want = SEARCH_RESULT_CEILING + 1
  const [codexHits, claudeHits] = await Promise.all([
    searchCodexSessions(request.query, want, request.filter),
    searchClaudeSessions(request.query, want, request.filter),
  ])
  // Both engines can surface the same session after a migration; keep one row
  // per session and let the newest hit represent it.
  const bySession = new Map<string, SearchResult>()
  for (const hit of [...codexHits, ...claudeHits]) {
    const existing = bySession.get(hit.sessionId)
    if (!existing || hit.timestamp > existing.timestamp) bySession.set(hit.sessionId, hit)
  }
  const rows = [...bySession.values()].sort((a, b) => b.timestamp - a.timestamp)
  return {
    rows: rows.slice(0, SEARCH_RESULT_CEILING),
    ceilingReached: rows.length > SEARCH_RESULT_CEILING,
  }
}

async function slicePage(request: ScanRequest, offset: number, limit: number): Promise<SearchPageReply> {
  const reuse = offset > 0
    && cache !== null
    && cache.query === request.query
    && cache.key === request.key
    && Date.now() - cache.at <= PAGE_CACHE_TTL_MS

  let entry: ScanEntry
  if (reuse && cache) {
    entry = cache
  } else {
    // Offset 0 is the start of a new search: the renderer cleared its rows, so
    // transcripts written since the last visit must be visible. Only a
    // continuation may reuse the ordered list.
    const scanned = await scanToCeiling(request)
    entry = {
      query: request.query,
      key: request.key,
      at: Date.now(),
      rows: scanned.rows,
      ceilingReached: scanned.ceilingReached,
      ...(request.filteredBy ? { filteredBy: request.filteredBy } : {}),
    }
    cache = entry
  }

  const total = entry.rows.length
  const end = Math.min(offset + limit, total)
  return {
    results: offset < total ? entry.rows.slice(offset, end) : [],
    total,
    hasMore: end < total,
    ceilingReached: entry.ceilingReached,
    ...(entry.filteredBy ? { filteredBy: entry.filteredBy } : {}),
  }
}

/**
 * Normalize one request. Returns null for a query too short to scan; throws for
 * a narrowing it cannot honour (see `readOrigins`).
 */
function buildScanRequest(raw: Record<string, unknown>): ScanRequest | null {
  const query = typeof raw.query === 'string' ? raw.query : ''
  if (query.length < 2) return null

  const origins = readOrigins(raw.origins)
  const scope = parseScopeSessionIds(raw.sessionIds)
  if (origins === null && scope === null) {
    return { query, origins: null, scope: null, filter: null, key: '*\u0000*' }
  }

  const filter: SearchScanFilter = {
    origins,
    // An empty array stays an empty set: the caller named a scope, and "none"
    // must not quietly widen to the whole history.
    sessionIds: scope ? new Set(scope.ids) : null,
  }
  const filteredBy: SearchFilterEcho = {
    // Echo every origin when only the session list narrowed the scan: a caller
    // must be able to read "narrowed, but not by origin" off this field.
    origins: origins ?? [...SEARCH_ORIGINS],
    sessionCount: scope ? scope.ids.length : null,
    sessionTruncated: scope ? scope.truncated : false,
  }
  const key = `${origins === null ? '*' : origins.join(',')}\u0000${scope === null ? '*' : scope.ids.join(',')}`
  return { query, origins, scope, filter, filteredBy, key }
}

/**
 * One page of `session:search` results. Every field in `input` is validated
 * here: the IPC handler is reachable from the renderer, and an older or
 * hand-written caller must not be able to make the scan do something absurd.
 */
export async function searchPage(input: unknown): Promise<SearchPageReply> {
  const raw = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  const request = buildScanRequest(raw)
  if (!request) {
    return { results: [], total: 0, hasMore: false, ceilingReached: false }
  }
  const offset = readOffset(raw.offset)
  const limit = readLimit(raw.limit)

  const run = queue.then(() => slicePage(request, offset, limit))
  // A failed scan must not poison the chain for the next request.
  queue = run.catch(() => undefined)
  return run
}

/** Test hook: forget the cached scan. */
export function resetSearchPageCacheForTests(): void {
  cache = null
  queue = Promise.resolve()
}
