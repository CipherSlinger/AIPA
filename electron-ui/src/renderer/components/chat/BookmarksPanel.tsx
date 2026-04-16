import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Bookmark, Download, User, Bot } from 'lucide-react'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import { relativeTime } from './messageUtils'
import type { BookmarkedMessage } from '../../hooks/useConversationStats'
import type { StandardChatMessage } from '../../types/app.types'

interface BookmarksPanelProps {
  bookmarkedMessages: BookmarkedMessage[]
  onScrollToMessage: (idx: number) => void
  onExportBookmarks?: () => void
  headerBtnStyle: React.CSSProperties
  hoverIn: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean) => void
  hoverOut: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean, defaultColor?: string) => void
}

export default function BookmarksPanel({
  bookmarkedMessages,
  onScrollToMessage,
  onExportBookmarks,
  headerBtnStyle,
  hoverIn,
  hoverOut,
}: BookmarksPanelProps) {
  const t = useT()
  const [showBookmarks, setShowBookmarks] = useState(false)
  const bookmarksRef = useRef<HTMLDivElement>(null)

  useClickOutside(bookmarksRef, showBookmarks, useCallback(() => setShowBookmarks(false), []))

  // Listen for Ctrl+Shift+B toggle event
  useEffect(() => {
    const handler = () => setShowBookmarks(prev => !prev)
    window.addEventListener('aipa:toggleBookmarks', handler)
    return () => window.removeEventListener('aipa:toggleBookmarks', handler)
  }, [])

  return (
    <div style={{ position: 'relative' }} ref={bookmarksRef}>
      <button
        onClick={() => setShowBookmarks(!showBookmarks)}
        title={`${t('chat.bookmarks')} (${bookmarkedMessages.length})`}
        style={{
          ...headerBtnStyle,
          background: showBookmarks ? 'rgba(99,102,241,0.20)' : 'none',
          color: showBookmarks ? '#818cf8' : bookmarkedMessages.length > 0 ? '#818cf8' : 'var(--text-muted)',
          opacity: bookmarkedMessages.length === 0 && !showBookmarks ? 0.5 : 1,
          position: 'relative',
        }}
        onMouseEnter={(e) => hoverIn(e, showBookmarks)}
        onMouseLeave={(e) => hoverOut(e, showBookmarks, bookmarkedMessages.length > 0 ? '#818cf8' : 'var(--text-muted)')}
      >
        <Bookmark size={15} />
        {bookmarkedMessages.length > 0 && (
          <span style={{
            position: 'absolute',
            top: 2,
            right: 2,
            fontSize: 9,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.55)',
            background: 'var(--border)',
            borderRadius: 10,
            minWidth: 14,
            height: 14,
            padding: '1px 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}>{bookmarkedMessages.length > 9 ? '9+' : bookmarkedMessages.length}</span>
        )}
      </button>
      {showBookmarks && bookmarkedMessages.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 200,
            width: 300,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
            padding: '4px 0',
            marginTop: 4,
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--bg-active) transparent',
            animation: 'slideUp 0.15s ease',
          } as React.CSSProperties}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 12px',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {t('chat.bookmarks')}
              <span style={{
                background: 'var(--border)',
                borderRadius: 10,
                padding: '1px 6px',
                fontSize: 10,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.55)',
              }}>{bookmarkedMessages.length}</span>
            </span>
            {onExportBookmarks && (
              <button
                onClick={(e) => { e.stopPropagation(); onExportBookmarks() }}
                title={t('chat.exportBookmarks')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '3px 5px',
                  borderRadius: 8,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--border)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }}
              >
                <Download size={12} />
              </button>
            )}
          </div>
          {bookmarkedMessages.map(({ msg, idx }) => {
            const std = msg as StandardChatMessage
            const preview = (std.content || '').slice(0, 80).replace(/\n/g, ' ')
            const isUserMsg = std.role === 'user'
            return (
              <button
                key={msg.id}
                onClick={() => {
                  onScrollToMessage(idx)
                  setShowBookmarks(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  borderLeft: '2px solid rgba(99,102,241,0.5)',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  lineHeight: 1.4,
                  transition: 'all 0.15s ease',
                  marginTop: 2,
                  borderRadius: '0 7px 7px 0',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
                  e.currentTarget.style.borderLeftColor = 'rgba(99,102,241,0.75)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.borderLeftColor = 'rgba(99,102,241,0.5)'
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: isUserMsg ? 'rgba(99,102,241,0.35)' : 'var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                }}>
                  {isUserMsg ? <User size={10} color="#ffffff" /> : <Bot size={10} color="#ffffff" />}
                </div>
                <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                  }}>
                    {preview || t('chat.emptyPreview')}
                  </div>
                  {std.timestamp && (
                    <div style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      marginTop: 2,
                      fontVariantNumeric: 'tabular-nums',
                      fontFeatureSettings: '"tnum"',
                    }}>
                      {relativeTime(std.timestamp, t)}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
      {showBookmarks && bookmarkedMessages.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 200,
            width: 220,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
            padding: '20px 14px',
            marginTop: 4,
            textAlign: 'center',
            animation: 'slideUp 0.15s ease',
          } as React.CSSProperties}
        >
          <div style={{
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 8,
          }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Bookmark size={20} style={{ color: '#818cf8' }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{t('chat.noBookmarks')}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>{t('chat.bookmarkHint')}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>{t('chat.bookmarkShortcutHint')}</div>
        </div>
      )}
    </div>
  )
}
