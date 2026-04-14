import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'

interface ContextMenuProps {
  x: number
  y: number
  message: ChatMessage
  onCopy: () => void
  onCopyMarkdown?: () => void
  onCopyRichText?: () => void
  onCopyCodeBlocks?: () => void
  onSaveAsNote?: () => void
  onRememberThis?: () => void
  onQuoteReply?: () => void
  onEditMessage?: () => void
  onRate?: (rating: 'up' | 'down' | null) => void
  onRewind?: () => void
  onBookmark?: () => void
  onPin?: () => void
  onCollapse?: () => void
  onAnnotate?: () => void
  hasAnnotation?: boolean
  onClose: () => void
  onFork?: () => void
}

export default function MessageContextMenu({ x, y, message, onCopy, onCopyMarkdown, onCopyRichText, onCopyCodeBlocks, onSaveAsNote, onRememberThis, onQuoteReply, onEditMessage, onRate, onRewind, onBookmark, onPin, onCollapse, onAnnotate, hasAnnotation, onClose, onFork }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  // Clamp position to viewport
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let adjustedX = x
    let adjustedY = y
    if (x + rect.width > vw - 8) adjustedX = vw - rect.width - 8
    if (y + rect.height > vh - 8) adjustedY = vh - rect.height - 8
    if (adjustedX < 8) adjustedX = 8
    if (adjustedY < 8) adjustedY = 8
    el.style.left = adjustedX + 'px'
    el.style.top = adjustedY + 'px'
  }, [x, y])

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const isAssistant = message.role === 'assistant'
  const rating = isAssistant ? (message as StandardChatMessage).rating : undefined
  const isBookmarked = message.role !== 'permission' && message.role !== 'plan' ? (message as StandardChatMessage).bookmarked : false
  const isPinned = message.role !== 'permission' && message.role !== 'plan' ? (message as StandardChatMessage).pinned : false
  const isCollapsed = message.role !== 'permission' && message.role !== 'plan' ? (message as StandardChatMessage).collapsed : false
  const t = useT()

  const getItemStyle = (key: string, destructive?: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 14px',
    fontSize: 13,
    color: destructive ? '#fca5a5' : 'rgba(255,255,255,0.78)',
    cursor: 'pointer',
    background: hoveredItem === key
      ? (destructive ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.06)')
      : 'transparent',
    border: 'none',
    borderLeft: hoveredItem === key && !destructive
      ? '2px solid rgba(99,102,241,0.40)'
      : '2px solid transparent',
    width: '100%',
    textAlign: 'left',
    borderRadius: 0,
    transition: 'all 0.15s ease',
  })

  const getIconStyle = (key: string, destructive?: boolean): React.CSSProperties => ({
    flexShrink: 0,
    color: destructive ? '#f87171' : 'var(--text-muted)',
    fontSize: 14,
    transition: 'all 0.15s ease',
  })

  const getShortcutStyle = (): React.CSSProperties => ({
    fontSize: 11,
    color: 'var(--text-faint)',
    marginLeft: 'auto',
    fontFamily: 'monospace',
  })

  const separator = <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

  const itemHandlers = (key: string) => ({
    onMouseEnter: () => setHoveredItem(key),
    onMouseLeave: () => setHoveredItem(null),
  })

  const menu = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 100,
        minWidth: 160,
        background: 'var(--glass-bg-popup)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--glass-border-md)',
        borderRadius: 12,
        boxShadow: 'var(--glass-shadow)',
        padding: '4px 0',
        overflow: 'hidden',
        animation: 'slideUp 0.15s ease',
      }}
    >
      {/* Copy */}
      <button
        style={getItemStyle('copy')}
        onClick={() => { onCopy(); onClose() }}
        {...itemHandlers('copy')}
      >
        <span style={{ flex: 1 }}>{t('message.copy')}</span>
        <span style={getShortcutStyle()}>Ctrl+C</span>
      </button>

      {/* Copy as Markdown (assistant only) */}
      {isAssistant && onCopyMarkdown && (
        <button
          style={getItemStyle('copyMarkdown')}
          onClick={() => { onCopyMarkdown(); onClose() }}
          {...itemHandlers('copyMarkdown')}
        >
          <span>{t('message.copyMarkdown')}</span>
        </button>
      )}

      {/* Copy as Rich Text (assistant only) */}
      {isAssistant && onCopyRichText && (
        <button
          style={getItemStyle('copyRichText')}
          onClick={() => { onCopyRichText(); onClose() }}
          {...itemHandlers('copyRichText')}
        >
          <span>{t('message.copyRichText')}</span>
        </button>
      )}

      {/* Copy Code Blocks (assistant only, when code blocks present) */}
      {isAssistant && onCopyCodeBlocks && (
        <button
          style={getItemStyle('copyCodeBlocks')}
          onClick={() => { onCopyCodeBlocks(); onClose() }}
          {...itemHandlers('copyCodeBlocks')}
        >
          <span>{t('message.copyCodeBlocks')}</span>
        </button>
      )}

      {/* Save as Note (assistant only) */}
      {isAssistant && onSaveAsNote && (
        <button
          style={getItemStyle('saveAsNote')}
          onClick={() => { onSaveAsNote(); onClose() }}
          {...itemHandlers('saveAsNote')}
        >
          <span>{t('message.saveAsNote')}</span>
        </button>
      )}

      {/* Remember This (assistant only) */}
      {isAssistant && onRememberThis && (
        <button
          style={getItemStyle('rememberThis')}
          onClick={() => { onRememberThis(); onClose() }}
          {...itemHandlers('rememberThis')}
        >
          <span>{t('message.rememberThis')}</span>
        </button>
      )}

      {/* Quote Reply */}
      {onQuoteReply && (
        <button
          style={getItemStyle('quoteReply')}
          onClick={() => { onQuoteReply(); onClose() }}
          {...itemHandlers('quoteReply')}
        >
          <span>{t('message.quoteReply')}</span>
        </button>
      )}

      {/* Edit Message (user only) */}
      {onEditMessage && (
        <button
          style={getItemStyle('editMessage')}
          onClick={() => { onEditMessage(); onClose() }}
          {...itemHandlers('editMessage')}
        >
          <span>{t('message.editMessage')}</span>
        </button>
      )}

      {/* Fork from here (all message types) */}
      {onFork && message.role !== 'permission' && message.role !== 'plan' && (
        <button
          style={getItemStyle('fork')}
          onClick={() => { onFork(); onClose() }}
          {...itemHandlers('fork')}
        >
          <span style={{ flex: 1 }}>{t('fork.forkFromHere')}</span>
          <span style={getIconStyle('fork')}>⑂</span>
        </button>
      )}

      {/* Bookmark */}
      {onBookmark && message.role !== 'permission' && message.role !== 'plan' && (
        <button
          style={getItemStyle('bookmark')}
          onClick={() => { onBookmark(); onClose() }}
          {...itemHandlers('bookmark')}
        >
          <span style={{ flex: 1 }}>{isBookmarked ? t('message.removeBookmark') : t('message.bookmark')}</span>
          <span style={getIconStyle('bookmark')}>{isBookmarked ? '\u2605' : '\u2606'}</span>
        </button>
      )}

      {/* Pin */}
      {onPin && message.role !== 'permission' && message.role !== 'plan' && (
        <button
          style={getItemStyle('pin')}
          onClick={() => { onPin(); onClose() }}
          {...itemHandlers('pin')}
        >
          <span style={{ flex: 1 }}>{isPinned ? t('message.unpinMessage') : t('message.pinMessage')}</span>
          <span style={getIconStyle('pin')}>{isPinned ? '\u{1F4CC}' : '\u{1F4CC}'}</span>
        </button>
      )}

      {/* Annotate */}
      {onAnnotate && message.role !== 'permission' && message.role !== 'plan' && (
        <button
          style={getItemStyle('annotate')}
          onClick={() => { onAnnotate(); onClose() }}
          {...itemHandlers('annotate')}
        >
          <span style={{ flex: 1 }}>{hasAnnotation ? t('message.editAnnotation') : t('message.addAnnotation')}</span>
          <span style={getIconStyle('annotate')}>{hasAnnotation ? '\u{1F4DD}' : '\u{1F4CB}'}</span>
        </button>
      )}

      {/* Collapse / Expand */}
      {onCollapse && message.role !== 'permission' && message.role !== 'plan' && (
        <button
          style={getItemStyle('collapse')}
          onClick={() => { onCollapse(); onClose() }}
          {...itemHandlers('collapse')}
        >
          <span>{isCollapsed ? t('message.expand') : t('message.collapse')}</span>
        </button>
      )}

      {/* Assistant-only: rating */}
      {isAssistant && onRate && (
        <>
          {separator}
          <button
            style={getItemStyle('rateUp')}
            onClick={() => { onRate(rating === 'up' ? null : 'up'); onClose() }}
            {...itemHandlers('rateUp')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{t('message.thumbsUp')}</span>
              {rating === 'up' && <span style={{ color: '#4ade80', fontSize: 11 }}>{t('message.active')}</span>}
            </span>
          </button>
          <button
            style={getItemStyle('rateDown')}
            onClick={() => { onRate(rating === 'down' ? null : 'down'); onClose() }}
            {...itemHandlers('rateDown')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{t('message.thumbsDown')}</span>
              {rating === 'down' && <span style={{ color: '#f87171', fontSize: 11 }}>{t('message.active')}</span>}
            </span>
          </button>
        </>
      )}

      {/* Rewind to here (assistant messages only) */}
      {isAssistant && onRewind && (
        <>
          {separator}
          <button
            style={getItemStyle('rewind', true)}
            onClick={() => { onRewind(); onClose() }}
            {...itemHandlers('rewind')}
          >
            <span>{t('rewind.button')}</span>
          </button>
        </>
      )}
    </div>
  )

  return createPortal(menu, document.body)
}
