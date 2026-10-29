// The "Recently deleted" selection bar: one checkbox for the filtered view,
// the actions that apply to whatever is ticked, and the confirmation a permanent
// delete needs.
//
// Mounted above the list whenever the list can show a row, so the selection
// control exists before there is a selection to show. The confirmation lives
// here rather than on the rows because bulk delete is one irreversible action:
// the user must see the true count and the kinds in one place, and be told
// plainly that there is no undo.
//
// Props are plain data — no store, no IPC. The view above owns the selection.
import { useEffect, useRef, type CSSProperties } from 'react'
import { RotateCcw, Trash2, X } from 'lucide-react'
import { useT } from '../../i18n'
import type { SelectionMode } from '../../lib/rowSelection'

export interface TrashBulkKind {
  label: string
  count: number
}

interface Props {
  mode: SelectionMode
  visibleCount: number
  selectedCount: number
  /** Selected rows a filter change took out of view since the last action. */
  prunedCount: number
  /** What is about to be deleted, by kind — the confirmation's kind breakdown. */
  kinds: TrashBulkKind[]
  busy: boolean
  confirming: boolean
  onToggleAll: () => void
  onRestore: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onClear: () => void
}

const CHECKBOX_STYLE: CSSProperties = {
  accentColor: 'var(--accent-solid)', cursor: 'pointer', width: 13, height: 13, flexShrink: 0,
}

const BUTTON_BASE: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
  height: 24, padding: '0 9px', borderRadius: 7, fontSize: 11, fontWeight: 600,
  border: '1px solid var(--border)', background: 'transparent',
  transition: 'background 0.15s ease', whiteSpace: 'nowrap',
}

export default function TrashBulkBar({
  mode, visibleCount, selectedCount, prunedCount, kinds,
  busy, confirming, onToggleAll, onRestore, onRequestDelete, onConfirmDelete,
  onCancelDelete, onClear,
}: Props) {
  const t = useT()
  const boxRef = useRef<HTMLInputElement>(null)

  // A checkbox cannot express "some" through `checked`; the DOM property does.
  useEffect(() => {
    if (boxRef.current) boxRef.current.indeterminate = mode === 'some'
  }, [mode])

  // Escape backs out of the confirmation and nothing else. It does not reach an
  // outer handler: the key was meant for this panel, not for closing a page.
  useEffect(() => {
    if (!confirming) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancelDelete()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [confirming, onCancelDelete])

  const disabled = busy || selectedCount === 0

  return (
    <div
      role="group"
      aria-label={t('trashBulk.groupLabel')}
      style={{
        marginBottom: 10, border: '1px solid var(--border)', borderRadius: 10,
        background: 'var(--bg-card, rgba(255,255,255,0.02))', overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        minHeight: 34, padding: '0 12px', boxSizing: 'border-box',
        fontSize: 11, color: 'var(--text-muted)',
      }}>
        <input
          ref={boxRef}
          type="checkbox"
          checked={mode === 'all'}
          disabled={visibleCount === 0}
          onChange={onToggleAll}
          aria-label={t('trashBulk.selectAllAria')}
          style={CHECKBOX_STYLE}
        />
        {/* A bulk action changes this number; a screen reader user must hear it. */}
        <span aria-live="polite" style={{
          color: selectedCount > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {selectedCount === 0
            ? t('trashBulk.viewCount', { count: visibleCount })
            : t('trashBulk.selected', { count: selectedCount })}
        </span>

        {/* A filter change keeps only visible-and-selected rows; say so instead
            of letting the number quietly shrink. */}
        {prunedCount > 0 && (
          <span style={{ color: 'var(--text-subtle, var(--text-muted))', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t('trashBulk.pruned', { count: prunedCount })}
          </span>
        )}

        <span style={{ flex: 1 }} />

        {selectedCount > 0 && !confirming && (
          <>
            <button
              type="button"
              onClick={onRestore}
              disabled={disabled}
              title={t('trashBulk.restoreHint')}
              style={{
                ...BUTTON_BASE,
                color: disabled ? 'var(--text-faint, var(--text-muted))' : 'var(--text-secondary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <RotateCcw size={11} />
              {t('trashBulk.restore', { count: selectedCount })}
            </button>
            <button
              type="button"
              onClick={onRequestDelete}
              disabled={disabled}
              title={t('trashBulk.deleteAria', { count: selectedCount })}
              aria-label={t('trashBulk.deleteAria', { count: selectedCount })}
              style={{
                ...BUTTON_BASE,
                border: '1px solid rgba(248,113,113,0.35)',
                color: disabled ? 'var(--text-faint, var(--text-muted))' : 'var(--danger-text, #f87171)',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <Trash2 size={11} />
              {t('trashBulk.delete', { count: selectedCount })}
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label={t('trashBulk.clear')}
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

      {confirming && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '8px 12px', borderTop: '1px solid var(--border)',
          background: 'rgba(248,113,113,0.06)',
        }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('trashBulk.confirmTitle', { count: selectedCount })}
            </div>
            {/* The kinds, counted, so "twenty rows" never resolves to "some
                workflows, I think". */}
            <div aria-label={t('trashBulk.kindGroupLabel')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
              {kinds.map(entry => (
                <span key={entry.label} style={{
                  fontSize: 10, fontWeight: 600, borderRadius: 20, padding: '1px 7px',
                  color: 'var(--text-secondary)', border: '1px solid var(--border)',
                }}>
                  {t('trashBulk.kindCount', { kind: entry.label, count: entry.count })}
                </span>
              ))}
            </div>
            {/* Said here, not implied: there is nothing to undo afterwards. */}
            <div style={{ fontSize: 11, color: 'var(--danger-text, #f87171)', marginTop: 4, lineHeight: 1.45 }}>
              {t('trashBulk.confirmNoUndo')}
            </div>
          </div>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={busy}
            style={{
              ...BUTTON_BASE,
              border: '1px solid #f87171', background: '#f87171', color: '#fff',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            <Trash2 size={11} />
            {t('trashBulk.confirmDelete')}
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            disabled={busy}
            autoFocus
            style={{
              ...BUTTON_BASE,
              color: 'var(--text-secondary)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {t('trashBulk.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
