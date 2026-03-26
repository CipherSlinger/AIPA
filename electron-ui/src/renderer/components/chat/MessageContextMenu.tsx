import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'

interface ContextMenuProps {
  x: number
  y: number
  message: ChatMessage
  onCopy: () => void
  onRate?: (rating: 'up' | 'down' | null) => void
  onRewind?: () => void
  onBookmark?: () => void
  onClose: () => void
}

export default function MessageContextMenu({ x, y, message, onCopy, onRate, onRewind, onBookmark, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

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

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    borderRadius: 0,
  }

  const separator = <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

  const menu = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 100,
        width: 210,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        padding: '4px 0',
        overflow: 'hidden',
      }}
    >
      {/* Copy */}
      <button
        style={itemStyle}
        onClick={() => { onCopy(); onClose() }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover, var(--bg-active))' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        <span>Copy text</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ctrl+C</span>
      </button>

      {/* Bookmark */}
      {onBookmark && message.role !== 'permission' && message.role !== 'plan' && (
        <button
          style={itemStyle}
          onClick={() => { onBookmark(); onClose() }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover, var(--bg-active))' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        >
          <span>{isBookmarked ? 'Remove bookmark' : 'Bookmark'}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isBookmarked ? '\u2605' : '\u2606'}</span>
        </button>
      )}

      {/* Assistant-only: rating */}
      {isAssistant && onRate && (
        <>
          {separator}
          <button
            style={itemStyle}
            onClick={() => { onRate(rating === 'up' ? null : 'up'); onClose() }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover, var(--bg-active))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Thumbs up</span>
              {rating === 'up' && <span style={{ color: 'var(--success)', fontSize: 11 }}>active</span>}
            </span>
          </button>
          <button
            style={itemStyle}
            onClick={() => { onRate(rating === 'down' ? null : 'down'); onClose() }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover, var(--bg-active))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Thumbs down</span>
              {rating === 'down' && <span style={{ color: 'var(--error)', fontSize: 11 }}>active</span>}
            </span>
          </button>
        </>
      )}

      {/* Assistant-only: rewind */}
      {isAssistant && onRewind && (
        <>
          {separator}
          <button
            style={itemStyle}
            onClick={() => { onRewind(); onClose() }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover, var(--bg-active))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            <span>Rewind to here</span>
          </button>
        </>
      )}
    </div>
  )

  return createPortal(menu, document.body)
}
