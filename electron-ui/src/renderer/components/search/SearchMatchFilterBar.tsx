// The where-it-matched strip above the results: four origin chips with counts,
// an order pair, a one-click clear, and the coverage lines that keep the
// narrowing honest.
//
// It owns no state and starts no search. Everything is derived from the rows
// the overlay already has, so changing a chip re-partitions the current result
// set and can never race `useGlobalSessionSearch`'s request sequencing. The
// overlay keeps the actual filter/order state, because its empty-state copy and
// its keyboard selection both depend on it.

import React from 'react'
import {
  GLOBAL_SEARCH_RESULT_LIMIT,
  SEARCH_MATCH_FILTERS,
  SEARCH_SORT_ORDERS,
  type MatchFilterCounts,
  type SearchMatchFilter,
  type SearchSortOrder,
} from './searchMatchFilter'
import { useT } from '../../i18n'

interface Props {
  filter: SearchMatchFilter
  onFilterChange: (next: SearchMatchFilter) => void
  order: SearchSortOrder
  onOrderChange: (next: SearchSortOrder) => void
  /** Totals over the current query's whole result window. */
  counts: MatchFilterCounts
  /** Rows the active filter keeps out of that window. */
  hidden: number
  /** The scan stopped at its cap, so the window itself is partial. */
  windowCapped: boolean
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
  windowCapped,
}: Props) {
  const t = useT()
  // The translated pill name, reused inside the coverage and empty-state copy
  // so no sentence has to hard-code a second name for the same bucket.
  const filterLabel = t(`globalSearch.match.${filter}`)
  // Filtering or reversing is a second-order narrowing on top of the scan's own
  // cut; admit both at once rather than implying the window is the whole story.
  const showWindowNote = windowCapped && (filter !== 'all' || order === 'oldest')

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
            removable from the place that states it. */}
        {filter !== 'all' && (
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
      {/* Coverage, not decoration: "tool output only" is a claim that matches
          elsewhere are being kept out. Without this line an empty list would
          read as "the phrase does not exist". */}
      {filter !== 'all' && hidden > 0 && (
        <div style={NOTE_STYLE}>
          {t(
            hidden === 1 ? 'globalSearch.match.scopeOne' : 'globalSearch.match.scope',
            { count: hidden, origin: filterLabel },
          )}
        </div>
      )}
      {showWindowNote && (
        <div role="status" style={NOTE_STYLE}>
          {t('globalSearch.match.windowCapped', { limit: GLOBAL_SEARCH_RESULT_LIMIT })}
        </div>
      )}
    </div>
  )
}
