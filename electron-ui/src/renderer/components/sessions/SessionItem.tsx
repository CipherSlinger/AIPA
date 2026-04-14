import React, { useState } from 'react'
import {
  Trash2, Star, GitBranch, Pencil, Tag, Download,
  MessageSquare, CheckSquare, Square, Clock, Copy,
  RefreshCw, Archive, ArchiveRestore,
} from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { useT, useDateLocale } from '../../i18n'
import { getSessionAvatarColor, formatSessionDuration, TAG_PRESETS, getMatchContext } from './sessionUtils'
import HighlightText from './HighlightText'
import { formatDistanceToNow } from 'date-fns'
import { firstLineOf } from '../../utils/stringUtils'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Convert a 6-digit hex color (#rrggbb) to an rgba() string. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Types ──────────────────────────────────────────────────────────────────

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
  onOpenInNewTab?: (session: SessionListItem) => void
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
  colorLabel?: string   // hex color for left border stripe
  autoTags?: string[]   // auto-generated topic tags
  compact?: boolean     // compact view mode
  unreadCount?: number  // per-session unread message count
}

// ── Component ──────────────────────────────────────────────────────────────

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
  onOpenInNewTab,
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
  colorLabel,
  autoTags,
  compact = false,
  unreadCount = 0,
}: SessionItemProps) {
  const t = useT()
  const dateLocale = useDateLocale()
  const avatarColor = getSessionAvatarColor(session.sessionId)
  const previewText = firstLineOf((session.lastPrompt || '').slice(0, 150)).slice(0, 50) || undefined
  const getTagName = (idx: number) => tagNames[idx] || t(TAG_PRESETS[idx]?.defaultKey || 'tags.work')

  const [hovered, setHovered] = useState(false)

  // Derive active left border color — colorLabel overrides state-based border
  const borderLeftColor = colorLabel
    ? colorLabel
    : isActive
      ? 'rgba(99,102,241,0.50)'
      : hovered
        ? 'var(--glass-border-md)'
        : 'transparent'

  // Tags assigned to this session
  const thisTags = sessionTags[session.sessionId] || []

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isActive}
      aria-label={session.title || session.lastPrompt || t('session.noContent')}
      data-active={String(isActive)}
      data-focused={String(isFocused)}
      data-selected={String(isSelected)}
      data-compact={String(compact)}
      data-hovered={String(hovered)}
      onClick={() => {
        if (selectMode) {
          if (!isSelectDisabled) onToggleSelect(session.sessionId)
        } else {
          onOpen(session)
        }
      }}
      onAuxClick={(e) => {
        // Middle-click opens in new tab
        if (e.button === 1 && onOpenInNewTab && !selectMode) {
          e.preventDefault()
          onOpenInNewTab(session)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (selectMode) {
            if (!isSelectDisabled) onToggleSelect(session.sessionId)
          } else {
            onOpen(session)
          }
        }
      }}
      className={undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 10,
        padding: compact ? '5px 12px' : '10px 12px',
        cursor: 'pointer',
        position: 'relative',
        borderBottom: '1px solid var(--glass-border)',
        borderLeft: '3px solid transparent',
        background: isSelected
          ? 'rgba(99,102,241,0.12)'
          : isActive
            ? 'rgba(99,102,241,0.08)'
            : hovered
              ? 'var(--glass-border)'
              : 'transparent',
        boxShadow: !isActive && hovered ? 'var(--glass-shadow)' : 'none',
        outline: isFocused ? '2px solid rgba(99,102,241,0.60)' : 'none',
        outlineOffset: isFocused ? -2 : 0,
        transition: 'background 0.15s ease, border-left-color 0.15s ease, box-shadow 0.15s ease',
        borderLeftColor,
      }}
      onMouseEnter={(e) => {
        setHovered(true)
        onShowTooltip(session, e)
      }}
      onMouseLeave={() => {
        setHovered(false)
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
            color: isSelectDisabled
              ? 'var(--text-muted)'
              : isSelected
                ? '#818cf8'
                : 'var(--text-muted)',
            opacity: isSelectDisabled ? 0.3 : 1,
            cursor: isSelectDisabled ? 'not-allowed' : 'pointer',
          }}
          title={isSelectDisabled ? t('session.cannotDeleteActive') : ''}
        >
          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        </div>
      )}

      {/* Avatar */}
      {!compact && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: avatarColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
            }}
          >
            {isPinned
              ? <Star size={18} color="#ffffff" />
              : <MessageSquare size={18} color="#ffffff" />
            }
          </div>

          {/* Streaming indicator dot */}
          {isActive && isStreaming && (
            <div
              style={{
                position: 'absolute',
                bottom: -1,
                right: -1,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#818cf8',
                border: '2px solid rgba(10,10,18,1)',
                animation: 'pulse 2s ease infinite',
              }}
            />
          )}

          {/* Unread badge */}
          {!isActive && unreadCount > 0 && (
            <div
              style={{
                position: 'absolute',
                top: -4,
                right: -6,
                minWidth: 16,
                height: 16,
                borderRadius: 10,
                background: 'rgba(99,102,241,0.25)',
                color: 'rgba(255,255,255,0.95)',
                fontSize: 10,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 5px',
                border: '2px solid rgba(10,10,18,1)',
                lineHeight: 1,
                textAlign: 'center' as const,
              }}
              title={t('session.unreadMessages')}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
        </div>
      )}

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: compact ? 0 : 4,
        }}>
          {renamingId === session.sessionId ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = ''
                e.currentTarget.style.boxShadow = ''
                onRenameCommit(session.sessionId)
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameCommit(session.sessionId)
                if (e.key === 'Escape') onRenameCancel()
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--glass-border)',
                borderRadius: 6,
                padding: '2px 6px',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box' as const,
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              }}
            />
          ) : (
            <span
              onDoubleClick={(e) => onStartRename(e, session)}
              title={t('session.doubleClickRename')}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: isActive ? 'var(--text-primary)' : 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                lineHeight: 1.3,
              }}
            >
              <HighlightText text={session.title || session.lastPrompt || t('session.noContent')} highlight={filter} />
            </span>
          )}

          {/* Timestamp + duration */}
          <span style={{
            fontSize: 10,
            color: 'var(--text-faint)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
            lineHeight: 1,
          }}>
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

        {/* Preview line + tag dots (hidden in compact mode) */}
        {!compact && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.5 }}>
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

            {/* Tag color pills */}
            {thisTags.length > 0 && (() => {
              const visibleTags = thisTags.slice(0, 3)
              const overflow = thisTags.length - 3
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
                        aria-label={getTagName(idx)}
                        style={{
                          borderRadius: 10,
                          padding: '1px 6px',
                          fontSize: 10,
                          background: preset.color ? hexToRgba(preset.color, 0.15) : 'rgba(128,128,128,0.15)',
                          color: preset.color || 'var(--text-muted)',
                          flexShrink: 0,
                          transition: 'all 0.15s ease',
                          lineHeight: '16px',
                          display: 'inline-block',
                        }}
                      >
                        {getTagName(idx)}
                      </span>
                    )
                  })}
                  {overflow > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>+{overflow}</span>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Auto-tags (hidden in compact mode) */}
        {!compact && autoTags && autoTags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {autoTags.map(tag => (
              <span
                key={tag}
                style={{
                  fontSize: 9,
                  fontStyle: 'italic',
                  color: 'var(--text-muted)',
                  opacity: 0.7,
                  background: 'rgba(128,128,128,0.10)',
                  border: '1px dashed var(--glass-border)',
                  borderRadius: 8,
                  padding: '0px 5px',
                  lineHeight: '16px',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

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
              <span style={{ color: '#818cf8', fontWeight: 500 }}>{ctx.source}</span>
              <span style={{ opacity: 0.5 }}>: </span>
              <HighlightText text={ctx.snippet} highlight={filter} />
            </div>
          )
        })()}
      </div>

      {/* Action buttons — visible on hover via CSS */}
      {!selectMode && (
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            position: 'absolute',
            right: 0,
            bottom: 0,
            gap: 4,
            alignItems: 'center',
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translateX(0)' : 'translateX(4px)',
            transition: 'opacity 0.15s ease, transform 0.15s ease',
            padding: '6px 10px 8px 20px',
            background: 'linear-gradient(to right, transparent, rgba(10,10,20,0.98) 28%)',
            pointerEvents: hovered ? 'auto' : 'none',
          }}
        >
          {/* Pin */}
          <button
            data-pinned={String(isPinned)}
            onClick={(e) => onTogglePin(e, session.sessionId)}
            title={isPinned ? t('session.unpinSession') : t('session.pinSession')}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              padding: '2px 4px',
              color: isPinned ? '#818cf8' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Star size={11} style={{ fill: isPinned ? '#818cf8' : 'none' }} />
          </button>

          {/* Tag */}
          <button
            data-tagged={String(thisTags.length > 0)}
            onClick={(e) => onOpenTagPicker(e, session.sessionId)}
            title={t('tags.assign')}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              padding: '2px 4px',
              color: thisTags.length > 0 ? '#818cf8' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Tag size={11} />
          </button>

          {/* Rename */}
          <button
            onClick={(e) => onStartRename(e, session)}
            title={t('session.rename')}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              padding: '2px 4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Pencil size={11} />
          </button>

          {/* Fork */}
          <button
            onClick={(e) => onFork(e, session)}
            title={t('session.fork')}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              padding: '2px 4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <GitBranch size={11} />
          </button>

          {/* Duplicate */}
          <button
            onClick={(e) => onDuplicate(e, session)}
            title={t('session.duplicate')}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              padding: '2px 4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Copy size={11} />
          </button>

          {/* Regenerate title */}
          <button
            onClick={(e) => onRegenerateTitle(e, session)}
            title={t('session.regenerateTitle')}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              padding: '2px 4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <RefreshCw size={11} />
          </button>

          {/* Export */}
          <button
            onClick={(e) => onExport(e, session)}
            title={t('session.export')}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              padding: '2px 4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Download size={11} />
          </button>

          {/* Archive / Unarchive */}
          {onToggleArchive && (
            <button
              data-archived={String(isArchived)}
              onClick={(e) => { e.stopPropagation(); onToggleArchive(session.sessionId) }}
              title={isArchived ? t('session.unarchive') : t('session.archive')}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                padding: '2px 4px',
                color: isArchived ? '#818cf8' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {isArchived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
            </button>
          )}

          {/* Delete */}
          <button
            data-confirm={String(confirmDeleteId === session.sessionId)}
            onClick={(e) => onDelete(e, session.sessionId)}
            title={confirmDeleteId === session.sessionId ? t('session.confirmDelete') : t('session.delete')}
            style={{
              background: confirmDeleteId === session.sessionId
                ? 'rgba(239,68,68,0.20)'
                : 'transparent',
              border: confirmDeleteId === session.sessionId
                ? '1px solid rgba(239,68,68,0.40)'
                : 'none',
              borderRadius: confirmDeleteId === session.sessionId ? 6 : 6,
              padding: confirmDeleteId === session.sessionId ? '1px 6px' : '2px 4px',
              color: '#f87171',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: confirmDeleteId === session.sessionId ? 10 : undefined,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => {
              if (confirmDeleteId !== session.sessionId) e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
            }}
            onMouseLeave={e => {
              if (confirmDeleteId !== session.sessionId) e.currentTarget.style.background = 'transparent'
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
