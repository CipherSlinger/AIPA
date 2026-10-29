// The where-it-matched strip above the results: four origin chips with counts,
// an order pair, a one-click clear, and the coverage lines that keep the
// narrowing honest.
//
// It owns no state and starts no search. Everything is derived from the rows
// the overlay already has, so changing a chip re-partitions the current result
// set and can never race `useGlobalSessionSearch`'s request sequencing. The
// overlay keeps the actual filter/order state, because its empty-state copy and
// its keyboard selection both depend on it.
//
// The department chip joins the same strip: it is a view over loaded rows too,
// so the only way it can narrow the corpus is the one explicit action below,
// and that action names both narrowings it will push.

import React from 'react'
import {
  SEARCH_MATCH_FILTERS,
  SEARCH_SORT_ORDERS,
  isLoadedSetPartial,
  pagingNarrowedKey,
  shouldOfferScopedScan,
  type MatchFilterCounts,
  type ScanOrigin,
  type SearchMatchFilter,
  type SearchSortOrder,
} from './searchMatchFilter'
import type { SessionSearchFilterEchoData } from '../../../preload/index'
import {
  echoNarrowsBoth,
  narrowingFromEcho,
  type DeptScanChip,
  type ScannedDeptState,
} from './searchDeptScan'
import { MAX_SCOPE_SESSIONS } from './searchDeptAttribution'
import { useT } from '../../i18n'

interface Props {
  filter: SearchMatchFilter
  onFilterChange: (next: SearchMatchFilter) => void
  order: SearchSortOrder
  onOrderChange: (next: SearchSortOrder) => void
  /** Totals over the rows currently loaded, not over the whole history. */
  counts: MatchFilterCounts
  /** Rows the active filter keeps out of the loaded set. */
  hidden: number
  /** Rows currently loaded. */
  loaded: number
  /** Distinct hits the query's scan knows; at the ceiling this is the ceiling. */
  total: number
  /** More rows can still be loaded. */
  hasMore: boolean
  /** The scan stopped at its own ceiling, so older hits were never collected. */
  ceilingReached: boolean
  /**
   * Origins the current scan was narrowed to, or null when it searched every
   * origin. The chips never set this: only `onScanWithFilter` does.
   */
  scannedOrigins: readonly ScanOrigin[] | null
  /**
   * Main's echo of what the scan actually kept. The status line reads this
   * rather than `scannedOrigins`, so it describes the reply and not a request
   * that may have failed.
   */
  scanEcho: SessionSearchFilterEchoData | null
  /** The only two actions that may restart the search. Neither is a chip. */
  onScanWithFilter: () => void
  onScanWholeHistory: () => void
  /** The user just widened the scan back to the whole history. */
  scanCleared: boolean
  /**
   * The live department chip, or null for All departments. Its `total` is the
   * number of conversations the department resolves to in this listing, before
   * the scope cap — zero is a real empty scope and must not become a scan.
   */
  dept: DeptScanChip | null
  /**
   * The department the running scan was narrowed to, from the press-time pin.
   * Kept even when the node has since been deleted, so the line can name it
   * instead of leaving an anonymous narrowing. `carried`/`truncated` come from
   * the pin rather than the reply: the renderer's cap happens before the ids
   * are sent, so main never sees the conversations it dropped.
   */
  scannedDept: ScannedDeptState | null
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '6px 16px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
}

const PILLS_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
}

/**
 * Same pill as the origin row. The overlay is narrow and the row already
 * carries two groups, so these are compact and wrap rather than shrink the
 * input or the result list.
 */
const PILL_STYLE: React.CSSProperties = {
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

/** A 1px rule between the match chips and the order chips. */
const DIVIDER_STYLE: React.CSSProperties = {
  width: 1,
  height: 14,
  background: 'var(--border)',
  margin: '0 2px',
  flexShrink: 0,
}

const CAPTION_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  flexShrink: 0,
}

/** The count inside a pill: same colour, quieter, aligned in a column. */
const COUNT_STYLE: React.CSSProperties = {
  marginLeft: 5,
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
  opacity: 0.75,
}

const NOTE_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  lineHeight: 1.5,
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    ...PILL_STYLE,
    borderColor: active ? 'rgba(99,102,241,0.5)' : 'var(--border)',
    background: active ? 'rgba(99,102,241,0.14)' : 'transparent',
    color: active ? 'var(--accent-text)' : 'var(--text-muted)',
    fontWeight: active ? 600 : 400,
  }
}

/**
 * A plain Enter on a focused pill activates the pill; without this it also
 * bubbles to the dialog and opens the highlighted hit. Ctrl/Cmd+Enter still
 * reaches the dialog's ask shortcut. Space is left to the button's own
 * activation, which keyup handles after this handler has only stopped the
 * propagation — not the default.
 */
function stopPillActivation(e: React.KeyboardEvent) {
  if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === ' ') e.stopPropagation()
}

export function SearchMatchFilterBar({
  filter,
  onFilterChange,
  order,
  onOrderChange,
  counts,
  hidden,
  loaded,
  total,
  hasMore,
  ceilingReached,
  scannedOrigins,
  scanEcho,
  onScanWithFilter,
  onScanWholeHistory,
  scanCleared,
  dept,
  scannedDept,
}: Props) {
  const t = useT()
  // The translated pill name, reused inside the coverage and empty-state copy
  // so no sentence has to hard-code a second name for the same bucket.
  const filterLabel = t(`globalSearch.match.${filter}`)
  // Filtering or reversing is a narrowing on top of the paging cut, so the
  // counts describe the loaded rows only. Say that when the loaded set is not
  // the whole answer — and say which kind of partial it is, because "more can
  // be loaded" and "the scan never went further" are different promises.
  const partial = isLoadedSetPartial(hasMore, ceilingReached)
  // What the reply says the scan kept. The copy reads this, never the request:
  // a scope that was asked for but never ran must not be shown as active, and
  // a reply narrowed on both sides must name both.
  const echo = narrowingFromEcho(scanEcho)
  const scoped = echo !== null
  const showWindowNote = partial && (filter !== 'all' || order === 'oldest')
  // Only an explicit press may restart the search with the narrowings pushed
  // into it. The department chip is part of the same decision, so it is passed
  // in — a selected department with no conversations is a scope worth no scan.
  const offerScopedScan = shouldOfferScopedScan(partial, filter, scannedOrigins, {
    selected: dept?.id ?? null,
    scanned: scannedDept?.id ?? null,
    sessionTotal: dept?.total ?? null,
  })
  // The scan's own narrowing, named the way the chips name it.
  const scanLabels = (echo?.origins ?? [])
    .map(origin => t(`globalSearch.match.${origin}`))
    .join(' + ')
  // A department with nothing in this machine's listing is an empty scope, not
  // a reason to fall back to the whole history. Say so before anything runs:
  // the press the user is considering would read nothing at all.
  const emptyDeptScope = dept !== null && dept.total === 0
  // Which narrowings the one action pushes right now, named individually. Never
  // "this filter": with a department selected the action is not about a filter
  // over loaded rows any more.
  const pushesOrigins = filter !== 'all'
  const pushesDept = dept !== null
  // The live chip and the pinned scan are named separately: after a department
  // is deleted the chip is gone but the scan still covers the conversations it
  // had, and the active line must use the pin's name rather than an empty one.
  const deptName = dept?.label ?? ''
  const scannedDeptName = scannedDept?.label ?? ''

  return (
    <div style={ROW_STYLE}>
      <div style={PILLS_STYLE}>
        {/* Sighted caption only: the group below carries the same name, so a
            screen reader hears it once instead of twice. */}
        <span aria-hidden="true" style={CAPTION_STYLE}>{t('globalSearch.match.groupLabel')}</span>
        <div
          role="group"
          aria-label={t('globalSearch.match.groupLabel')}
          style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}
        >
          {SEARCH_MATCH_FILTERS.map(kind => {
            const active = filter === kind
            // `all` is the window total; the three buckets are its parts. Title
            // hits belong to no bucket (a conversation's name is not prose), so
            // the parts need not add up to `all` — the coverage line below is
            // what accounts for the difference.
            const count = kind === 'all' ? counts.total : counts[kind]
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(kind)}
                onKeyDown={stopPillActivation}
                style={pillStyle(active)}
              >
                {t(`globalSearch.match.${kind}`)}
                <span style={COUNT_STYLE}>{count}</span>
              </button>
            )
          })}
        </div>
        <span style={DIVIDER_STYLE} aria-hidden="true" />
        <span aria-hidden="true" style={CAPTION_STYLE}>{t('globalSearch.sort.groupLabel')}</span>
        <div
          role="group"
          aria-label={t('globalSearch.sort.groupLabel')}
          title={t('globalSearch.sort.hint')}
          style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}
        >
          {SEARCH_SORT_ORDERS.map(next => {
            const active = order === next
            return (
              <button
                key={next}
                type="button"
                aria-pressed={active}
                onClick={() => onOrderChange(next)}
                onKeyDown={stopPillActivation}
                style={pillStyle(active)}
              >
                {t(`globalSearch.sort.${next}`)}
              </button>
            )
          })}
        </div>
        {/* One click back to everything: an active narrowing must always be
            removable from the place that states it. While the scan itself is
            narrowed, this chip-clear would only widen the view over rows that
            are still a narrowed scan — the widen action below is the honest
            clear, and it is the one that re-searches the whole history. */}
        {filter !== 'all' && !scanEcho && (
          <button
            type="button"
            onClick={() => onFilterChange('all')}
            onKeyDown={stopPillActivation}
            style={{
              ...PILL_STYLE,
              color: 'var(--accent-text)',
              borderColor: 'rgba(99,102,241,0.35)',
            }}
          >
            {t('globalSearch.originClear')}
          </button>
        )}
      </div>
      {/* The scan itself was narrowed at the source — by an origin, a
          department, or both. This is not a view over the loaded rows: main
          kept only these conversations/origins before its ceiling, so every
          count below describes that narrowed set. The action that widens it
          back is a real button, and pressing any chip above is not it. */}
      {echo && (echo.origins !== null || echo.sessionCount !== null) && (
        <div style={NOTE_STYLE}>
          <div role="status">
            {t(
              echoNarrowsBoth(echo)
                ? 'globalSearch.deptScan.activeBoth'
                : echo.sessionCount !== null
                  ? 'globalSearch.deptScan.activeDept'
                  : 'globalSearch.match.scanActive',
              { origin: scanLabels, dept: scannedDeptName },
            )}
          </div>
          {/* Title matches have no origin at all, so an origin narrowing
              excludes them. A department narrowing does not: a title match in
              a conversation filed there is still that conversation's name. */}
          {echo.origins !== null && <div>{t('globalSearch.match.scanTitleNote')}</div>}
          {/* The corpus is pinned, so a deleted node does not silently mix
              corpora — but the line must stop presenting it as live. */}
          {scannedDept?.gone && (
            <div>{t('globalSearch.deptScan.activeGone', { dept: scannedDeptName })}</div>
          )}
          {/* The cap was reported before the press; repeating it here keeps the
              counts honest for as long as the narrowed scan is on screen. The
              pin knows about the renderer's trim (main never saw those ids);
              the echo would report a trim main applied itself. */}
          {(scannedDept?.truncated || echo.sessionTruncated) && (
            <div>
              {t('globalSearch.deptScan.activeTruncated', {
                count: echo.sessionCount ?? scannedDept?.carried ?? 0,
              })}
            </div>
          )}
          <button
            type="button"
            onClick={onScanWholeHistory}
            onKeyDown={stopPillActivation}
            style={{
              ...PILL_STYLE,
              color: 'var(--accent-text)',
              borderColor: 'rgba(99,102,241,0.35)',
              marginTop: 4,
            }}
          >
            {t('globalSearch.match.scanClear')}
          </button>
        </div>
      )}
      {/* Nothing to search inside this department, so nothing is spent. The
          copy says that out loud instead of letting the next press widen to
          the whole history behind the user's back. */}
      {emptyDeptScope && (
        <div role="status" style={NOTE_STYLE}>
          {t('globalSearch.deptScan.emptyDeptScope', { dept: deptName })}
        </div>
      )}
      {/* Partial loaded set and at least one real chip: offer the one deliberate
          action that pushes exactly those chips into the scan. No chip click
          reaches this path — the chips above only call `onFilterChange`. */}
      {offerScopedScan && (
        <div style={NOTE_STYLE}>
          <div>
            {t(
              pushesDept && pushesOrigins
                ? 'globalSearch.deptScan.hintBoth'
                : pushesDept
                  ? 'globalSearch.deptScan.hintDept'
                  : 'globalSearch.match.scanWithFilterHint',
              { loaded, origin: filterLabel, dept: deptName },
            )}
          </div>
          {/* The cap is stated before the scan starts, not discovered from a
              short answer afterwards. */}
          {dept?.truncated && (
            <div>
              {t('globalSearch.deptScan.capped', {
                dept: deptName,
                total: dept.total,
                cap: MAX_SCOPE_SESSIONS,
              })}
            </div>
          )}
          <button
            type="button"
            onClick={onScanWithFilter}
            onKeyDown={stopPillActivation}
            style={{
              ...PILL_STYLE,
              color: 'var(--accent-text)',
              borderColor: 'rgba(99,102,241,0.35)',
              marginTop: 4,
            }}
          >
            {t(
              pushesDept && pushesOrigins
                ? 'globalSearch.deptScan.buttonBoth'
                : pushesDept
                  ? 'globalSearch.deptScan.buttonDept'
                  : 'globalSearch.match.scanWithFilter',
              { origin: filterLabel, dept: deptName },
            )}
          </button>
        </div>
      )}
      {/* A widened scan is worth saying once: the rows that follow are no
          longer a slice of a narrowed search. */}
      {!scanEcho && !offerScopedScan && scanCleared && (
        <div role="status" style={NOTE_STYLE}>
          {t('globalSearch.match.scanCleared')}
        </div>
      )}
      {/* Coverage, not decoration: "tool output only" is a claim that matches
          elsewhere are being kept out. Without this line an empty list would
          read as "the phrase does not exist". When only part of the answer is
          loaded, the line says "loaded" — the unseen matches were never
          filtered, and claiming otherwise would be a lie about the corpus. */}
      {filter !== 'all' && hidden > 0 && (
        <div style={NOTE_STYLE}>
          {t(
            partial
              ? (hidden === 1 ? 'globalSearch.match.scopeLoadedOne' : 'globalSearch.match.scopeLoaded')
              : (hidden === 1 ? 'globalSearch.match.scopeOne' : 'globalSearch.match.scope'),
            { count: hidden, origin: filterLabel },
          )}
        </div>
      )}
      {showWindowNote && (
        <div role="status" style={NOTE_STYLE}>
          {/* Once the department is part of the scan, "earlier {{origin}}
              matches were scanned" would describe half of the narrowing. The
              sentence names every side the scan actually kept. */}
          {t(
            echo?.sessionCount != null
              ? echo.origins !== null
                ? (hasMore
                    ? 'globalSearch.deptScan.narrowedBothMore'
                    : 'globalSearch.deptScan.narrowedBothCeiling')
                : (hasMore
                    ? 'globalSearch.deptScan.narrowedDeptMore'
                    : 'globalSearch.deptScan.narrowedDeptCeiling')
              : pagingNarrowedKey(hasMore, scoped),
            { loaded, ceiling: total, origin: filterLabel, dept: scannedDeptName },
          )}
        </div>
      )}
    </div>
  )
}
