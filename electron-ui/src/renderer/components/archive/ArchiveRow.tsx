// One record in the archive ledger.
//
// The row is a fixed 35px line because the windowed list computes offsets
// without measuring the DOM. Everything the ledger knows about the record is
// shown here: title, origin, command-only/archived markers, the employee handle,
// the department it is filed under (or the remembered name of a deleted one),
// when it ran and how many messages it holds. Selection adds a checkbox on the
// left; the write actions keep their existing hover-revealed slots.
import { useState } from 'react'
import {
  Archive, Building2, ExternalLink, FolderInput, FolderOpen, PenLine, Trash2,
} from 'lucide-react'
import {
  deptDisplayName, kindOf, type UiLocale,
} from '../departments/deptUtils'
import SessionOriginBadge from '../shared/SessionOriginBadge'
import { formatDateTimeShort } from '../../utils/formatDate'
import type { useT } from '../../i18n'
import { ELLIPSIS, employeeTag, recordTitle, type ArchiveRecord } from './archiveRecord'

export const ROW_H = 35

interface Props {
  record: ArchiveRecord
  /** Absolute row index inside the group — used for windowing verification. */
  index: number
  first: boolean
  opening: boolean
  selected: boolean
  onOpen: () => void
  onToggleArchived: () => void
  onFile: () => void
  onDelete: () => void
  onToggleSelected: () => void
  t: ReturnType<typeof useT>
  locale: UiLocale
}

export default function ArchiveRow({
  record, index, first, opening, selected,
  onOpen, onToggleArchived, onFile, onDelete, onToggleSelected, t, locale,
}: Props) {
  const [hovered, setHovered] = useState(false)
  const { session } = record
  const title = recordTitle(session, t('session.untitled'))
  const when = formatDateTimeShort(locale, session.timestamp)

  return (
    <div
      data-archive-row={index}
      data-session-id={session.sessionId}
      data-selected={selected ? 'true' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      // Keys pressed inside the checkbox or one of the row's buttons belong to
      // that control. Without this guard, Space on a checkbox would toggle the
      // selection *and* open the conversation.
      onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      title={session.lastPrompt || title}
      className="row-focus-inset"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        // Fixed height keeps the analytic offsets in `layout` exact.
        height: ROW_H, boxSizing: 'border-box',
        padding: '0 12px', cursor: 'pointer',
        // Hairlines use the same token as the card border; the brighter
        // --bg-active read as a second border colour inside the card.
        borderTop: first ? 'none' : '1px solid var(--border)',
        background: selected ? 'var(--accent-bg)' : hovered ? 'var(--bg-active)' : 'transparent',
        // Command-only rows are revealable, never promoted: they read as
        // background, which is what they are.
        opacity: record.archived || record.commandOnly ? 0.55 : 1,
        transition: 'background 0.15s ease',
      }}
    >
      {/* Always visible: a selection the user cannot see is a trap. The click
          and key press stay on the input, never on the row underneath. */}
      <input
        type="checkbox"
        checked={selected}
        onClick={e => e.stopPropagation()}
        onChange={onToggleSelected}
        aria-label={t('archive.bulk.selectRowAria', { title })}
        style={{ accentColor: 'var(--accent-solid)', cursor: 'pointer', width: 13, height: 13, flexShrink: 0 }}
      />

      <span style={{ fontSize: 11, width: 12, flexShrink: 0, color: 'var(--text-muted)' }}>
        {record.archived ? '📦' : '📄'}
      </span>

      <span title={title} style={{
        flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-primary)',
        fontWeight: 500, ...ELLIPSIS,
      }}>
        {title}
      </span>

      <SessionOriginBadge origin={session.origin} />

      {record.commandOnly && (
        <span style={{
          flexShrink: 0, fontSize: 9, padding: '1px 6px', borderRadius: 999,
          border: '1px solid var(--border)', color: 'var(--text-subtle)',
        }}>
          {t('archive.commandOnlyTag')}
        </span>
      )}

      {record.archived && (
        <span style={{
          flexShrink: 0, fontSize: 9, padding: '1px 6px', borderRadius: 999,
          border: '1px solid var(--border)', color: 'var(--text-muted)',
        }}>
          {t('archive.archivedTag')}
        </span>
      )}

      {/* Employee handle — a session has no name of its own, so the id is it. */}
      <span
        title={session.sessionId}
        style={{
          flexShrink: 0, fontSize: 10, fontFamily: 'monospace',
          padding: '1px 6px', borderRadius: 5,
          background: 'var(--accent-bg)', color: 'var(--accent-text)',
          border: '1px solid var(--accent-border)',
        }}
      >
        #{employeeTag(session.sessionId)}
      </span>

      {/* Hand-filed marker. The width is reserved even when the row has no
          filing, so revealing the pen never shifts the department columns.
          The tooltip says "by you, not by the folder" and never names a live
          department — a removed filing is described by the tag beside it. */}
      <span
        data-hand-filed={record.handFiled ? 'true' : undefined}
        title={record.handFiled ? t('archive.filedByYouTip') : undefined}
        style={{
          flexShrink: 0, width: 14, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--accent-text)',
        }}
      >
        {record.handFiled && <PenLine size={10} />}
      </span>

      {/* A manual filing whose node was deleted. The remembered name is the
          only honest label; the working folder is deliberately not shown as
          its department, and the row is not moved to a live node. */}
      {record.removedDeptName !== null ? (
        <span
          title={t('archive.removedDeptTip', { name: record.removedDeptName })}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', maxWidth: 200 }}
        >
          <Building2 size={10} style={{ opacity: 0.6 }} />
          <span style={ELLIPSIS}>{record.removedDeptName}</span>
          <span style={{
            fontSize: 9, padding: '0 5px', borderRadius: 999,
            border: '1px dashed var(--border)', color: 'var(--text-subtle)', flexShrink: 0,
          }}>
            {t('archive.removedDeptTag')}
          </span>
        </span>
      ) : record.dept && record.dept.id !== record.root?.id ? (
        /* Which desk inside the group's company this was worked at. Only shown
           when the record sat below the group node — a top-level department's
           own work would otherwise repeat its own name on every row. */
        <span
          title={record.dept.directory}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-subtle)', maxWidth: 180 }}
        >
          <FolderOpen size={10} />
          <span style={ELLIPSIS}>
            {kindOf(record.dept) === 'team'
              ? `${deptDisplayName(record.dept, locale)} · ${t('dept.team')}`
              : deptDisplayName(record.dept, locale)}
          </span>
        </span>
      ) : !record.dept ? (
        /* Unassigned records have no group to carry their folder, so spell it out. */
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-subtle)', maxWidth: 200 }}>
          <FolderOpen size={10} />
          <span title={session.project || undefined} style={ELLIPSIS}>{session.project || '—'}</span>
        </span>
      ) : null}

      <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-muted)', width: 118, textAlign: 'right' }}>
        {when}
      </span>

      <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-subtle)', width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {t('archive.rounds', { count: String(session.messageCount ?? 0) })}
      </span>

      <button
        onClick={(e) => { e.stopPropagation(); onToggleArchived() }}
        title={record.archived ? t('archive.unarchive') : t('archive.archive')}
        // Hover-revealed, but `row-action` also reveals it on keyboard focus:
        // an invisible control must not be the next tab stop.
        className="row-action"
        style={{
          flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', display: 'flex', padding: 2,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
        }}
      >
        <Archive size={12} />
      </button>

      {/* The single-row delete. It calls the same batch delete the bulk bar
          does, with a batch of one, so the trash entry, the undo toast and the
          refusal wording are identical. */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        title={t('archive.bulk.rowDelete')}
        aria-label={t('archive.bulk.rowDelete')}
        className="row-action"
        style={{
          flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
          color: hovered ? 'var(--danger-text)' : 'var(--text-muted)',
          display: 'flex', padding: 2,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
        }}
      >
        <Trash2 size={12} />
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onFile() }}
        title={t('archive.fileActionTip')}
        aria-label={t('archive.fileAction')}
        data-file-session-action
        // Same hover/focus idiom as the archive toggle: revealed on row hover,
        // and `row-action` keeps it visible when it is the keyboard's next stop.
        className="row-action"
        style={{
          flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', display: 'flex', padding: 2,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
        }}
      >
        <FolderInput size={12} />
      </button>

      <span style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, color: opening ? 'var(--text-muted)' : 'var(--accent-text)',
        opacity: opening || hovered ? 1 : 0.55, transition: 'opacity 0.15s ease',
      }}>
        <ExternalLink size={11} />{t('archive.open')}
      </span>
    </div>
  )
}
