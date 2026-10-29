// The per-filter empty states inside the result list.
//
// Each one blames the thing that actually hid the rows, and each one keeps two
// distinctions the generic "no matches" copy would erase:
//   - a filtered empty state is not an empty search. The phrase exists; the
//     filter is looking somewhere else. It counts what it hid and offers a
//     one-click clear.
//   - when only part of the scan is loaded (`partialLoaded`), the copy says the
//     claim is about the loaded rows, not about matches the filter never saw.
//
// The scan-scoped, generic and building-block empty states stay in the
// coordinator: their copy speaks for the whole search and has to read the
// entity sources and main's `filteredBy` echo, which this file knows nothing
// about.

import type { CSSProperties } from 'react'
import { useT } from '../../../i18n'
import { EMPTY_STYLE, GHOST_BUTTON_STYLE, stopPillActivation } from './shared'

const TITLE_STYLE: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)' }
const HINT_STYLE: CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }
const CLEAR_STYLE: CSSProperties = { ...GHOST_BUTTON_STYLE, marginTop: 12 }

/** Below the two-character search floor. */
export function SearchIdleState() {
  const t = useT()
  return (
    <div style={EMPTY_STYLE}>
      <div style={TITLE_STYLE}>{t('globalSearch.idle')}</div>
      <div style={HINT_STYLE}>{t('globalSearch.idleHint')}</div>
    </div>
  )
}

/** The first scan for a query that is long enough to run. */
export function SearchLoadingState() {
  const t = useT()
  return (
    <div style={EMPTY_STYLE}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('globalSearch.loading')}</div>
    </div>
  )
}

interface FilterEmptyProps {
  /** Only the loaded rows were looked at; the filter never saw the rest. */
  partialLoaded: boolean
  /** Rows the search returned; the denominator of every count here. */
  loaded: number
  onClear: () => void
}

/** The search found rows, the where-it-matched filter kept none. */
export function MatchFilterEmptyState({
  partialLoaded,
  loaded,
  label,
  onClear,
}: FilterEmptyProps & { label: string }) {
  const t = useT()
  return (
    <div style={EMPTY_STYLE}>
      <div style={TITLE_STYLE}>
        {partialLoaded
          // Only the loaded rows were looked at; saying "no
          // matches for this query" would speak for matches the
          // filter has never seen.
          ? t('globalSearch.match.emptyLoadedTitle', {
              origin: label,
              loaded,
            })
          : t('globalSearch.match.emptyTitle', { origin: label })}
      </div>
      <div style={HINT_STYLE}>
        {partialLoaded
          ? t('globalSearch.match.emptyLoadedHint', { loaded })
          : t(
              loaded === 1
                ? 'globalSearch.match.emptyHintOne'
                : 'globalSearch.match.emptyHint',
              { count: loaded },
            )}
      </div>
      <button
        type="button"
        onClick={onClear}
        onKeyDown={stopPillActivation}
        style={CLEAR_STYLE}
      >
        {t('globalSearch.originClear')}
      </button>
    </div>
  )
}

/** The origin filter emptied what the match filter left. */
export function OriginFilterEmptyState({ partialLoaded, loaded, onClear }: FilterEmptyProps) {
  const t = useT()
  return (
    <div style={EMPTY_STYLE}>
      <div style={TITLE_STYLE}>
        {partialLoaded
          ? t(
              loaded === 1
                ? 'globalSearch.originFilterEmptyLoadedOne'
                : 'globalSearch.originFilterEmptyLoaded',
              { count: loaded },
            )
          : t(
              loaded === 1
                ? 'globalSearch.originFilterEmptyOne'
                : 'globalSearch.originFilterEmpty',
              { count: loaded },
            )}
      </div>
      <div style={HINT_STYLE}>
        {t('globalSearch.originFilterEmptyHint')}
      </div>
      <button
        type="button"
        onClick={onClear}
        onKeyDown={stopPillActivation}
        style={CLEAR_STYLE}
      >
        {t('globalSearch.originClear')}
      </button>
    </div>
  )
}

/**
 * The department filter emptied what the origin filter left. `visible` is the
 * count after that filter, which is what the copy names.
 */
export function DeptFilterEmptyState({
  partialLoaded,
  visible,
  onClear,
}: Omit<FilterEmptyProps, 'loaded'> & { visible: number }) {
  const t = useT()
  return (
    <div style={EMPTY_STYLE}>
      <div style={TITLE_STYLE}>
        {partialLoaded
          ? t(
              visible === 1
                ? 'globalSearch.dept.emptyLoadedOne'
                : 'globalSearch.dept.emptyLoaded',
              { count: visible },
            )
          : t(
              visible === 1
                ? 'globalSearch.dept.emptyOne'
                : 'globalSearch.dept.empty',
              { count: visible },
            )}
      </div>
      <div style={HINT_STYLE}>
        {t('globalSearch.dept.emptyHint')}
      </div>
      <button
        type="button"
        onClick={onClear}
        onKeyDown={stopPillActivation}
        style={CLEAR_STYLE}
      >
        {t('globalSearch.dept.clear')}
      </button>
    </div>
  )
}

/** The archive's snapshot hid every remaining row. */
export function ListScopeEmptyState({ count, onClear }: { count: number; onClear: () => void }) {
  const t = useT()
  return (
    <div style={EMPTY_STYLE}>
      <div style={TITLE_STYLE}>
        {t('search.listScope.emptyTitle', { count })}
      </div>
      <div style={HINT_STYLE}>
        {t('search.listScope.emptyHint')}
      </div>
      <button
        type="button"
        onClick={onClear}
        onKeyDown={stopPillActivation}
        style={CLEAR_STYLE}
      >
        {t('search.listScope.clear')}
      </button>
    </div>
  )
}
