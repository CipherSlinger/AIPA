import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Bookmark } from 'lucide-react'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import type { BookmarkedMessage } from '../../hooks/useConversationStats'
import type { StandardChatMessage } from '../../types/app.types'

interface BookmarksPanelProps {
  bookmarkedMessages: BookmarkedMessage[]
  onScrollToMessage: (idx: number) => void
  headerBtnStyle: React.CSSProperties
  hoverIn: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean) => void
  hoverOut: (e: React.MouseEvent<HTMLButtonElement>, active?: boolean, defaultColor?: string) => void
}

export default function BookmarksPanel({
  bookmarkedMessages,
  onScrollToMessage,
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
          background: showBookmarks ? 'var(--accent)' : 'none',
          color: showBookmarks ? '#fff' : bookmarkedMessages.length > 0 ? 'var(--warning)' : 'var(--chat-header-icon)',
          opacity: bookmarkedMessages.length === 0 && !showBookmarks ? 0.5 : 1,
          position: 'relative',
        }}
        onMouseEnter={(e) => hoverIn(e, showBookmarks)}
        onMouseLeave={(e) => hoverOut(e, showBookmarks, bookmarkedMessages.length > 0 ? 'var(--warning)' : 'var(--chat-header-icon)')}
      >
        <Bookmark size={15} />
        {bookmarkedMessages.length > 0 && (
          <span style={{
            position: 'absolute',
            top: 2,
            right: 2,
            fontSize: 9,
            fontWeight: 600,
            color: '#fff',
            background: 'var(--warning)',
            borderRadius: '50%',
            width: 14,
            height: 14,
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
            zIndex: 60,
            width: 280,
            maxHeight: 300,
            overflowY: 'auto',
            background: 'var(--input-field-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: '4px 0',
            marginTop: 4,
          }}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
            {t('chat.bookmarks')}
          </div>
          {bookmarkedMessages.map(({ msg, idx }) => {
            const std = msg as StandardChatMessage
            const preview = (std.content || '').slice(0, 80).replace(/\n/g, ' ')
            return (
              <button
                key={msg.id}
                onClick={() => {
                  onScrollToMessage(idx)
                  setShowBookmarks(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 6 }}>
                  {std.role === 'user' ? t('chat.you') : t('chat.claude')}
                </span>
                {preview || t('chat.emptyPreview')}
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
            zIndex: 60,
            width: 200,
            background: 'var(--input-field-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: '16px 12px',
            marginTop: 4,
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          {t('chat.noBookmarks')}
          <div style={{ fontSize: 10, marginTop: 4 }}>{t('chat.bookmarkHint')}</div>
        </div>
      )}
    </div>
  )
}
