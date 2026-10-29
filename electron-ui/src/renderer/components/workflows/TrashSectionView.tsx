// The presentational half of "Recently deleted": the rows, the filter
// controls, and the three states the list can be in. Split from TrashSection.tsx
// so the view stays small and can be rendered on its own — the connected
// wrapper there owns the IPC reads and the restore/remove callbacks.
import React, { useEffect, useState } from 'react'
import { Undo2, Trash2, Workflow as WorkflowIcon, Puzzle, MessageSquare, CalendarClock, Search } from 'lucide-react'
import { useT, useI18n } from '../../i18n'
import { formatDateMedium } from '../../utils/formatDate'
import type { AppLocale } from '../../utils/formatDate'
import {
  EMPTY_TRASH_FILTER,
  TRASH_FILTER_KINDS,
  filterTrashRows,
  toggleTrashKind,
} from '../../lib/trashFilter'
import type { TrashFilterKind, TrashFilterState } from '../../lib/trashFilter'
import type { TrashActionOutcome, TrashKind, TrashRow } from '../../lib/trashRows'
import { SectionHeader } from './EmployeesShared'

function kindBadge(kind: TrashKind): { color: string; background: string; border: string } {
  switch (kind) {
    case 'workflow':
      return { color: '#a5b4fc', background: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.30)' }
    case 'skill':
      return { color: '#c4b5fd', background: 'rgba(167,139,250,0.14)', border: 'rgba(167,139,250,0.30)' }
    case 'session':
      return { color: '#7dd3fc', background: 'rgba(56,189,248,0.14)', border: 'rgba(56,189,248,0.30)' }
    case 'job':
      return { color: '#fbbf24', background: 'rgba(251,191,36,0.14)', border: 'rgba(251,191,36,0.30)' }
  }
}

function kindIcon(kind: TrashKind): React.ReactNode {
  if (kind === 'workflow') return <WorkflowIcon size={13} />
  if (kind === 'skill') return <Puzzle size={13} />
  if (kind === 'job') return <CalendarClock size={13} />
  return <MessageSquare size={13} />
}

type Translate = ReturnType<typeof useT>

/**
 * The badge text the row shows. Shared with the filter so what is searched is
 * by construction what is rendered — one function, not two copies that drift.
 */
function kindLabel(t: Translate, kind: TrashKind): string {
  if (kind === 'workflow') return t('trash.kindWorkflow')
  if (kind === 'skill') return t('trash.kindSkill')
  if (kind === 'job') return t('automation.trash.kind')
  return t('sessionTrash.kind')
}

/**
 * The row's second line: when it leaves, or why it cannot come back. A skill
 * was a folder and a conversation a transcript file, so say which one is gone
 * instead of reusing a sentence about folders. A job is a record, so it never
 * reaches the unavailable branch.
 *
 * Also the filter's `detail` text, for the same "searched == rendered" reason.
 */
function detailText(t: Translate, locale: AppLocale, row: TrashRow): string {
  if (!row.available) {
    return row.kind === 'session' ? t('sessionTrash.unavailable') : t('trash.folderUnavailable')
  }
  return t('trash.removesOn', { date: formatDateMedium(locale, row.purgeAt) })
}

function smallButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 24,
    padding: '0 9px',
    borderRadius: 7,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: disabled ? 'var(--text-faint, var(--text-muted))' : 'var(--text-secondary)',
    opacity: disabled ? 0.55 : 1,
  }
}

function TrashRowView({ row, locale, first, onRestore, onDeleteForever }: {
  row: TrashRow
  locale: 'en' | 'zh-CN'
  first: boolean
  onRestore: (row: TrashRow) => Promise<TrashActionOutcome>
  onDeleteForever: (row: TrashRow) => Promise<TrashActionOutcome>
}) {
  const t = useT()
  const [failure, setFailure] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  // "Delete forever" is the one irreversible action here, so it asks twice —
  // the same pattern the skill card uses for its delete button.
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])

  const run = async (action: (row: TrashRow) => Promise<TrashActionOutcome>) => {
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      const outcome = await action(row)
      // A refusal stays on screen. Reporting success when the folder was not
      // moved would tell the user their skill is back when it is not.
      if (!outcome.ok) setFailure(outcome.message)
    } catch (err) {
      setFailure(t('trash.failure.generic', { message: String(err) }))
    } finally {
      setBusy(false)
    }
  }

  const badge = kindBadge(row.kind)
  const canRestore = row.available && !busy
  const badgeText = kindLabel(t, row.kind)
  const secondLine = detailText(t, locale, row)

  return (
    <div style={{
      padding: '9px 12px',
      borderTop: first ? 'none' : '1px solid var(--border)',
      background: 'var(--bg-card, rgba(255,255,255,0.02))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: badge.color, background: badge.background, border: `1px solid ${badge.border}`,
        }}>
          {kindIcon(row.kind)}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{
              fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {row.name}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              flexShrink: 0, borderRadius: 20, padding: '1px 6px',
              color: badge.color, background: badge.background, border: `1px solid ${badge.border}`,
            }}>
              {badgeText}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {secondLine}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => { if (canRestore) void run(onRestore) }}
            disabled={!canRestore}
            title={row.available ? t('trash.restore') : secondLine}
            style={smallButtonStyle(!canRestore)}
          >
            <Undo2 size={11} />
            {t('trash.restore')}
          </button>
          <button
            onClick={() => {
              if (busy) return
              if (!confirming) { setConfirming(true); return }
              setConfirming(false)
              void run(onDeleteForever)
            }}
            disabled={busy}
            title={confirming ? t('trash.confirmForever') : t('trash.deleteForever')}
            style={{
              ...smallButtonStyle(busy),
              cursor: busy ? 'not-allowed' : 'pointer',
              ...(confirming ? { border: '1px solid #f87171', background: '#f87171', color: '#fff' } : null),
            }}
          >
            <Trash2 size={11} />
            {confirming ? t('trash.confirmForever') : t('trash.deleteForever')}
          </button>
        </div>
      </div>

      {failure && (
        <div role="alert" style={{ fontSize: 11.5, color: '#f87171', lineHeight: 1.45, marginTop: 6, marginLeft: 36 }}>
          {failure}
        </div>
      )}
    </div>
  )
}

/**
 * One compact control row: a text box and four kind chips. Nothing else — the
 * holding area is not a workspace and does not need a toolbar.
 */
function TrashFilterBar({ filter, byKind, onChange }: {
  filter: TrashFilterState
  /** Text-matched counts per kind, ignoring the chip selection (see trashFilter). */
  byKind: Record<TrashFilterKind, number>
  onChange: (next: TrashFilterState) => void
}) {
  const t = useT()

  // Escape clears the query and nothing else. stopPropagation keeps an outer
  // handler from reading the same key as "close the page", and the input keeps
  // focus so the user can keep typing. An empty query lets Escape bubble —
  // there is nothing here for it to clear.
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || filter.query === '') return
    event.preventDefault()
    event.stopPropagation()
    onChange({ ...filter, query: '' })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search
          size={12}
          aria-hidden="true"
          style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }}
        />
        <input
          type="text"
          value={filter.query}
          onChange={event => onChange({ ...filter, query: event.target.value })}
          onKeyDown={onKeyDown}
          placeholder={t('trashFilter.placeholder')}
          aria-label={t('trashFilter.inputLabel')}
          style={{
            width: 208,
            height: 26,
            padding: '0 8px 0 25px',
            borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
          }}
        />
      </div>

      <div role="group" aria-label={t('trashFilter.kindGroupLabel')} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {TRASH_FILTER_KINDS.map(kind => {
          const active = filter.kinds.includes(kind)
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...filter, kinds: toggleTrashKind(filter.kinds, kind) })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                height: 24,
                padding: '0 9px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                border: `1px solid ${active ? 'rgba(99,102,241,0.32)' : 'var(--border)'}`,
                background: active ? 'rgba(99,102,241,0.16)' : 'transparent',
                color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
              }}
            >
              {kindLabel(t, kind)}
              <span style={{
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                color: active ? 'var(--accent-text)' : 'var(--text-muted)',
                opacity: byKind[kind] === 0 ? 0.55 : 1,
              }}>
                {byKind[kind]}
              </span>
            </button>
          )
        })}
      </div>

      {/* No chip pressed is not "nothing to show" — it is every kind, and the
          UI has to say that out loud or an empty chip row reads as a filter
          that selected nothing. */}
      {filter.kinds.length === 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('trashFilter.allKinds')}</span>
      )}
    </div>
  )
}

/**
 * Pure view: nothing when the holding area is empty, otherwise one list for
 * all kinds. Exported so the harness can render it without an app instance.
 *
 * Three states, kept apart on purpose:
 *   - no rows at all            → the section renders nothing (unchanged);
 *   - rows, none match the filter → the no-match line, with the hidden count
 *     and a one-click clear;
 *   - rows, some match          → the list.
 * "Not read yet" is the parent's `loaded` flag: it keeps the palette jump from
 * concluding anything, and this view never invents a spinner for it.
 */
export function TrashView({
  rows,
  retentionDays,
  // Defaults keep the view renderable on its own, which is how the earlier
  // harnesses (and anything else that mounts the pure list) call it: no
  // filter means no narrowing.
  filter = EMPTY_TRASH_FILTER,
  onFilterChange = () => {},
  onRestore,
  onDeleteForever,
  sectionRef,
}: {
  rows: TrashRow[]
  retentionDays: number
  filter?: TrashFilterState
  onFilterChange?: (next: TrashFilterState) => void
  onRestore: (row: TrashRow) => Promise<TrashActionOutcome>
  onDeleteForever: (row: TrashRow) => Promise<TrashActionOutcome>
  /** Handed in so the connected wrapper can scroll here once the rows exist. */
  sectionRef?: React.RefObject<HTMLElement>
}) {
  const t = useT()
  const { resolvedLocale } = useI18n()
  if (rows.length === 0) return null

  const filtered = filterTrashRows(rows, filter, row => ({
    kind: kindLabel(t, row.kind),
    detail: detailText(t, resolvedLocale, row),
  }))
  const visible = filtered.visible

  const hasSkill = visible.some(row => row.kind === 'skill')
  const hasSession = visible.some(row => row.kind === 'session')
  const hasJob = visible.some(row => row.kind === 'job')

  return (
    <section
      ref={sectionRef}
      data-employees-section="trash"
      style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}
    >
      <SectionHeader
        icon={<Trash2 size={14} />}
        title={t('trash.title')}
        // The number on screen, not the number that existed before filtering:
        // a count that disagrees with the rows under it is a stale total.
        count={visible.length}
        subtitle={t('trash.subtitle', { days: retentionDays })}
      />
      <TrashFilterBar filter={filter} byKind={filtered.byKind} onChange={onFilterChange} />
      {hasSkill && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, marginLeft: 34, lineHeight: 1.45 }}>
          {t('trash.skillsHint')}
        </div>
      )}
      {hasSession && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, marginLeft: 34, lineHeight: 1.45 }}>
          {t('sessionTrash.hint')}
        </div>
      )}
      {hasJob && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, marginLeft: 34, lineHeight: 1.45 }}>
          {t('automation.trash.hint')}
        </div>
      )}
      {visible.length === 0 ? (
        // Rows exist, the filter hides all of them. Report how many are out of
        // sight and give the way back in one click — never an empty box that
        // looks like the holding area itself emptied.
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
          padding: '12px 12px', border: '1px solid var(--border)', borderRadius: 10,
          background: 'var(--bg-card, rgba(255,255,255,0.02))',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {t('trashFilter.noMatch', { count: filtered.hidden })}
          </span>
          <button type="button" onClick={() => onFilterChange(EMPTY_TRASH_FILTER)} style={smallButtonStyle(false)}>
            {t('trashFilter.clear')}
          </button>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {visible.map((row, index) => (
            <TrashRowView
              key={`${row.kind}:${row.id}`}
              row={row}
              locale={resolvedLocale}
              first={index === 0}
              onRestore={onRestore}
              onDeleteForever={onDeleteForever}
            />
          ))}
        </div>
      )}
    </section>
  )
}
