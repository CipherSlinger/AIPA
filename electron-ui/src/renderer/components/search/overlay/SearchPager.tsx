// Paging, after the last conversation row and still inside the scroll box.
//
// The main process scans once per query and serves pages as slices of that one
// ordering, so the next page costs a slice, never a second corpus walk. Two
// rules keep the copy honest:
//
//   - every count here describes the LOADED set, not the corpus. `loaded` is
//     what the view holds; `total` is main's number for the same scan.
//   - `pagingCountKey(hasMore, ceilingReached)` picks between "of", "of at
//     least" and "all". At the ceiling `total` is the ceiling, not the corpus,
//     so "of 200" would state a total nobody measured.
//
// The button is a real button (Tab reaches it), and ArrowDown on the last row
// makes the same call, so paging never needs a mouse. It is `aria-disabled`, not
// `disabled`: a disabled element drops focus, and a page landing under the
// user's cursor must not move it; `loadMore` already ignores a second call
// while one runs.

import type { CSSProperties } from 'react'
import { useT } from '../../../i18n'
import { pagingCountKey } from '../searchMatchFilter'

interface Props {
  /** Rows the view holds now. Every count below is over this set. */
  loaded: number
  /** Main's total for the same scan; a ceiling when `ceilingReached`. */
  total: number
  hasMore: boolean
  ceilingReached: boolean
  loadingMore: boolean
  /** The last page failed; the rows already loaded stay. */
  failed: boolean
  /** How many rows the next page would actually add (the last page can be short). */
  nextCount: number
  onLoadMore: () => void
}

const PAGER_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '12px 16px 18px',
}

const PAGER_BUTTON_STYLE: CSSProperties = {
  padding: '5px 14px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--accent-text)',
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const PAGER_NOTE_STYLE: CSSProperties = {
  fontSize: 10,
  lineHeight: 1.5,
  color: 'var(--text-muted)',
  textAlign: 'center',
}

export function SearchPager({
  loaded,
  total,
  hasMore,
  ceilingReached,
  loadingMore,
  failed,
  nextCount,
  onLoadMore,
}: Props) {
  const t = useT()
  return (
    <div style={PAGER_STYLE}>
      {hasMore && (
        <button
          type="button"
          // Not `disabled`: a disabled element drops focus, and a
          // page landing under the user's cursor must not move it.
          // `loadMore` already ignores a second call while one runs.
          aria-disabled={loadingMore}
          onClick={onLoadMore}
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
            corpus. */}
        {t(pagingCountKey(hasMore, ceilingReached), {
          loaded,
          total,
        })}
      </div>
      {ceilingReached && !hasMore && (
        <div style={PAGER_NOTE_STYLE}>
          {t('globalSearch.paging.ceiling', { ceiling: total })}
        </div>
      )}
      {failed && (
        <div role="status" style={{ ...PAGER_NOTE_STYLE, color: 'var(--danger-text)' }}>
          {t('globalSearch.paging.failed')}
        </div>
      )}
    </div>
  )
}
