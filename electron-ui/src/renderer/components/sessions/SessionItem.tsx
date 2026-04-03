import React from 'react'
import { Trash2, Star, GitBranch, Pencil, Tag, Download, MessageSquare, CheckSquare, Square, Clock, Copy, RefreshCw, Archive, ArchiveRestore } from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { useT, useDateLocale } from '../../i18n'
import { getSessionAvatarColor, formatSessionDuration, TAG_PRESETS, getMatchContext } from './sessionUtils'
import HighlightText from './HighlightText'
import { formatDistanceToNow } from 'date-fns'

interface SessionItemProps {
  session: SessionListItem
  isActive: boolean
  isFocused: boolean
  isPinned: boolean
  isStreaming: boolean
  isSelected: boolean
  isSelectDisabled: boolean
  selectMode: boolean
  filter: string
  renamingId: string | null
  renameValue: string
  confirmDeleteId: string | null
  sessionTags: Record<string, string[]>
  tagNames: string[]
  onOpen: (session: SessionListItem) => void
  onToggleSelect: (sessionId: string) => void
  onTogglePin: (e: React.MouseEvent, sessionId: string) => void
  onOpenTagPicker: (e: React.MouseEvent, sessionId: string) => void
  onStartRename: (e: React.MouseEvent, session: SessionListItem) => void
  onFork: (e: React.MouseEvent, session: SessionListItem) => void
  onDuplicate: (e: React.MouseEvent, session: SessionListItem) => void
  onRegenerateTitle: (e: React.MouseEvent, session: SessionListItem) => void
  onExport: (e: React.MouseEvent, session: SessionListItem) => void
  onDelete: (e: React.MouseEvent, sessionId: string) => void
  onRenameChange: (val: string) => void
  onRenameCommit: (sessionId: string) => void
  onRenameCancel: () => void
  onShowTooltip: (session: SessionListItem, e: React.MouseEvent) => void
  onHideTooltip: () => void
  isArchived?: boolean
  onToggleArchive?: (sessionId: string) => void
}

export default function SessionItem({
  session,
  isActive,
  isFocused,
  isPinned,
  isStreaming,
  isSelected,
  isSelectDisabled,
  selectMode,
  filter,
  renamingId,
  renameValue,
  confirmDeleteId,
  sessionTags,
  tagNames,
  onOpen,
  onToggleSelect,
  onTogglePin,
  onOpenTagPicker,
  onStartRename,
  onFork,
  onDuplicate,
  onRegenerateTitle,
  onExport,
  onDelete,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onShowTooltip,
  onHideTooltip,
  isArchived = false,
  onToggleArchive,
}: SessionItemProps) {
  const t = useT()
  const dateLocale = useDateLocale()
  const avatarColor = getSessionAvatarColor(session.sessionId)
  const previewText = (session.lastPrompt || '').slice(0, 50) || undefined
  const getTagName = (idx: number) => tagNames[idx] || t(TAG_PRESETS[idx]?.defaultKey || 'tags.work')

  return (
    <div
      onClick={() => {
        if (selectMode) {
          if (!isSelectDisabled) onToggleSelect(session.sessionId)
        } else {
          onOpen(session)
        }
      }}
      className="session-item"
      style={{
        padding: '10px 12px',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border)',
        borderLeft: isActive ? '3px solid var(--accent)' : isFocused ? '3px solid var(--text-muted)' : '3px solid transparent',
        background: isActive ? 'var(--session-active-bg)' : isFocused ? 'var(--session-hover-bg)' : 'transparent',
        position: 'relative',
        transition: 'background 0.15s ease, transform 0.15s ease, border-left-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isActive ? 'rgba(0, 122, 204, 0.18)' : 'var(--session-hover-bg)'
        if (!isActive) e.currentTarget.style.transform = 'translateX(2px)'
        const btns = e.currentTarget.querySelector('.action-btns') as HTMLElement
        if (btns) { btns.style.opacity = '1'; btns.style.transform = 'translateX(0)' }
        onShowTooltip(session, e)
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isActive ? 'var(--session-active-bg)' : 'transparent'
        e.currentTarget.style.transform = 'translateX(0)'
        const btns = e.currentTarget.querySelector('.action-btns') as HTMLElement
        if (btns) { btns.style.opacity = '0'; btns.style.transform = 'translateX(4px)' }
        onHideTooltip()
      }}
    >
      {/* Selection checkbox */}
      {selectMode && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            color: isSelectDisabled ? 'var(--text-muted)' : isSelected ? 'var(--accent)' : 'var(--text-muted)',
            opacity: isSelectDisabled ? 0.3 : 1,
            cursor: isSelectDisabled ? 'not-allowed' : 'pointer',
          }}
          title={isSelectDisabled ? t('session.cannotDeleteActive') : ''}
        >
          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        </div>
      )}

      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: avatarColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isPinned
            ? <Star size={18} color="#ffffff" />
            : <MessageSquare size={18} color="#ffffff" />
          }
        </div>
        {isActive && isStreaming && (
          <div
            style={{
              position: 'absolute',
              bottom: -1,
              right: -1,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#4ade80',
              border: '2px solid var(--bg-sessionpanel)',
              animation: 'pulse 1.2s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 4,
        }}>
          {renamingId === session.sessionId ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={() => onRenameCommit(session.sessionId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameCommit(session.sessionId)
                if (e.key === 'Escape') onRenameCancel()
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                background: 'var(--bg-input)',
                border: '1px solid var(--accent)',
                borderRadius: 3,
                padding: '2px 6px',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          ) : (
            <span
              onDoubleClick={(e) => onStartRename(e, session)}
              title={t('session.doubleClickRename')}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              <HighlightText text={session.title || session.lastPrompt || t('session.noContent')} highlight={filter} />
            </span>
          )}
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            {session.messageCount != null && session.messageCount > 0 && (
              <span style={{ opacity: 0.6 }} title={t('session.tooltipMessages')}>
                {session.messageCount}
                <MessageSquare size={8} style={{ marginLeft: 1, verticalAlign: 'middle' }} />
              </span>
            )}
            {(() => {
              const dur = formatSessionDuration(session.firstTimestamp, session.timestamp)
              if (!dur) return null
              return (
                <span style={{ opacity: 0.5, display: 'inline-flex', alignItems: 'center', gap: 2 }} title={t('session.tooltipDuration')}>
                  <Clock size={8} />
                  {dur}
                </span>
              )
            })()}
            {formatDistanceToNow(new Date(session.timestamp), { addSuffix: true, locale: dateLocale })}
          </span>
        </div>

        {/* Preview line + tag dots */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          lineHeight: 1.4,
        }}>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}>
            {previewText ? (
              <HighlightText text={previewText} highlight={filter} />
            ) : (
              <em style={{ opacity: 0.6 }}>{t('session.noContent')}</em>
            )}
          </div>
          {/* Tag color dots */}
          {(() => {
            const tags = sessionTags[session.sessionId] || []
            if (tags.length === 0) return null
            const visibleTags = tags.slice(0, 3)
            const overflow = tags.length - 3
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                {visibleTags.map(tagId => {
                  const preset = TAG_PRESETS.find(p => p.id === tagId)
                  if (!preset) return null
                  const idx = TAG_PRESETS.indexOf(preset)
                  return (
                    <span
                      key={tagId}
                      title={getTagName(idx)}
                      aria-hidden="true"
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: preset.color,
                        opacity: 0.85,
                        flexShrink: 0,
                      }}
                    />
                  )
                })}
                {overflow > 0 && (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>+{overflow}</span>
                )}
              </div>
            )
          })()}
        </div>

        {/* Search match context line */}
        {filter && (() => {
          const ctx = getMatchContext(session, filter, t)
          if (!ctx) return null
          return (
            <div style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.3,
              marginTop: 2,
              opacity: 0.8,
            }}>
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{ctx.source}</span>
              <span style={{ opacity: 0.5 }}>: </span>
              <HighlightText text={ctx.snippet} highlight={filter} />
            </div>
          )
        })()}
      </div>

      {/* Action buttons */}
      {!selectMode && (
        <div
          className="action-btns"
          style={{
            display: 'flex',
            position: 'absolute',
            right: 0,
            bottom: 0,
            gap: 4,
            alignItems: 'center',
            opacity: 0,
            transform: 'translateX(4px)',
            transition: 'opacity 0.15s ease, transform 0.15s ease',
            padding: '6px 10px 8px 20px',
            background: 'linear-gradient(to right, transparent, var(--bg-sessionpanel) 30%)',
            borderRadius: '0 0 0 0',
          }}
        >
          <button
            onClick={(e) => onTogglePin(e, session.sessionId)}
            title={isPinned ? t('session.unpinSession') : t('session.pinSession')}
            style={{
              background: 'none',
              border: 'none',
              color: isPinned ? 'var(--warning)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Star size={11} style={{ fill: isPinned ? 'var(--warning)' : 'none' }} />
          </button>
          <button
            onClick={(e) => onOpenTagPicker(e, session.sessionId)}
            title={t('tags.assign')}
            style={{
              background: 'none',
              border: 'none',
              color: (sessionTags[session.sessionId] || []).length > 0 ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Tag size={11} />
          </button>
          <button
            onClick={(e) => onStartRename(e, session)}
            title={t('session.rename')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={(e) => onFork(e, session)}
            title={t('session.fork')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <GitBranch size={11} />
          </button>
          <button
            onClick={(e) => onDuplicate(e, session)}
            title={t('session.duplicate')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <Copy size={11} />
          </button>
          <button
            onClick={(e) => onRegenerateTitle(e, session)}
            title={t('session.regenerateTitle')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={11} />
          </button>
          <button
            onClick={(e) => onExport(e, session)}
            title={t('session.export')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <Download size={11} />
          </button>
          {onToggleArchive && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleArchive(session.sessionId) }}
              title={isArchived ? t('session.unarchive') : t('session.archive')}
              style={{ background: 'none', border: 'none', color: isArchived ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              {isArchived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
            </button>
          )}
          <button
            onClick={(e) => onDelete(e, session.sessionId)}
            title={confirmDeleteId === session.sessionId ? t('session.confirmDelete') : t('session.delete')}
            style={{
              background: confirmDeleteId === session.sessionId ? 'var(--error)' : 'none',
              border: 'none',
              color: confirmDeleteId === session.sessionId ? '#fff' : 'var(--error)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              borderRadius: 3,
              padding: confirmDeleteId === session.sessionId ? '1px 6px' : 0,
              fontSize: 10,
              gap: 3,
            }}
          >
            <Trash2 size={12} />
            {confirmDeleteId === session.sessionId && <span>{t('common.confirm')}</span>}
          </button>
        </div>
      )}
    </div>
  )
}
