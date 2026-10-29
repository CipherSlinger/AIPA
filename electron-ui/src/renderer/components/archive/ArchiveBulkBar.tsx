// The ledger's selection bar: one checkbox for the filtered view, and the
// actions that apply to whatever is selected.
//
// It sits above the scroller (never inside it) so adding it cannot shift the
// analytic row offsets the windowed list depends on. It is always mounted while
// the ledger has rows: a selection control that only appears after a selection
// exists would have no way to start one.
import { useEffect, useRef } from 'react'
import { Archive, RotateCcw, Trash2, X } from 'lucide-react'
import { useT } from '../../i18n'
import type { SelectionMode } from './archiveSelection'

interface Props {
  /** none / some / all, measured on the current filtered view. */
  mode: SelectionMode
  /** Rows in the current filtered view — the scope of select-all. */
  visibleCount: number
  /** Selected rows inside that view. */
  selectedCount: number
  /** Selected rows that are not archived yet — what "Archive" would change. */
  archiveCount: number
  /** Selected rows that are archived — what "Restore" would change. */
  unarchiveCount: number
  /** Selected rows a filter change took out of the view since the last action. */
  prunedCount: number
  /** A delete is in flight; the controls stay put but do nothing twice. */
  busy: boolean
  onToggleAll: () => void
  onArchive: () => void
  onUnarchive: () => void
  onDelete: () => void
  onClear: () => void
}

const CHECKBOX_STYLE = { accentColor: 'var(--accent-solid)', cursor: 'pointer', width: 13, height: 13, flexShrink: 0 } as const

const BUTTON_BASE = {
  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
  height: 22, padding: '0 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  border: '1px solid var(--border)', background: 'transparent',
  transition: 'background 0.15s ease',
} as const

export default function ArchiveBulkBar({
  mode, visibleCount, selectedCount, archiveCount, unarchiveCount, prunedCount,
  busy, onToggleAll, onArchive, onUnarchive, onDelete, onClear,
}: Props) {
  const t = useT()
  const boxRef = useRef<HTMLInputElement>(null)

  // A checkbox cannot express "some" through `checked`; the DOM property does.
  useEffect(() => {
    if (boxRef.current) boxRef.current.indeterminate = mode === 'some'
  }, [mode])

  const disabled = busy || selectedCount === 0
  const archiveSkipped = selectedCount - archiveCount
  const unarchiveSkipped = selectedCount - unarchiveCount

  return (
    <div style={{
      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
      minHeight: 32, padding: '0 16px', boxSizing: 'border-box',
      borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)',
    }}>
      <input
        ref={boxRef}
        type="checkbox"
        checked={mode === 'all'}
        disabled={visibleCount === 0}
        onChange={onToggleAll}
        aria-label={t('archive.bulk.selectAllAria')}
        style={CHECKBOX_STYLE}
      />
      {/* The spoken count updates without stealing focus; a bulk action changes
          it, and a screen reader user needs to hear that. */}
      <span aria-live="polite" style={{ color: selectedCount > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {selectedCount === 0
          ? t('archive.bulk.selectAll', { count: visibleCount })
          : t('archive.bulk.selected', { count: selectedCount })}
      </span>

      {/* A filter change keeps only visible-and-selected rows; say so instead of
          letting the number quietly shrink. */}
      {prunedCount > 0 && (
        <span style={{ color: 'var(--text-subtle)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t('archive.bulk.pruned', { count: prunedCount })}
        </span>
      )}

      <span style={{ flex: 1 }} />

      {selectedCount > 0 && (
        <>
          <button
            onClick={onArchive}
            disabled={disabled || archiveCount === 0}
            className="archive-hover-btn"
            title={archiveSkipped > 0 ? t('archive.bulk.skipArchive', { count: archiveSkipped }) : undefined}
            style={{
              ...BUTTON_BASE,
              color: archiveCount === 0 ? 'var(--text-faint)' : 'var(--text-secondary)',
              cursor: disabled || archiveCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <Archive size={11} />{t('archive.bulk.archive', { count: archiveCount })}
          </button>
          <button
            onClick={onUnarchive}
            disabled={disabled || unarchiveCount === 0}
            className="archive-hover-btn"
            title={unarchiveSkipped > 0 ? t('archive.bulk.skipUnarchive', { count: unarchiveSkipped }) : undefined}
            style={{
              ...BUTTON_BASE,
              color: unarchiveCount === 0 ? 'var(--text-faint)' : 'var(--text-secondary)',
              cursor: disabled || unarchiveCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <RotateCcw size={11} />{t('archive.bulk.unarchive', { count: unarchiveCount })}
          </button>
          <button
            onClick={onDelete}
            disabled={disabled}
            className="archive-hover-btn"
            title={t('archive.bulk.deleteAria', { count: selectedCount })}
            aria-label={t('archive.bulk.deleteAria', { count: selectedCount })}
            style={{
              ...BUTTON_BASE,
              border: '1px solid rgba(248,113,113,0.35)',
              color: busy ? 'var(--text-faint)' : 'var(--danger-text)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            <Trash2 size={11} />{t('archive.bulk.delete', { count: selectedCount })}
          </button>
          <button
            onClick={onClear}
            className="archive-hover-link"
            aria-label={t('archive.bulk.clear')}
            style={{
              background: 'none', border: 'none', padding: 2, cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            }}
          >
            <X size={12} />
          </button>
        </>
      )}
    </div>
  )
}
