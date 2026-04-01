import React, { useState } from 'react'
import { StandardChatMessage } from '../../types/app.types'
import { Copy, Check, Bookmark, Code2, Pencil, MessageSquareQuote, NotebookPen, Volume2, VolumeX, Brain, Share2, Pin, Languages, StickyNote, ThumbsUp, ThumbsDown, Undo2 } from 'lucide-react'
import { useT } from '../../i18n'

const actionBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 5,
  padding: '3px 5px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  color: 'var(--text-muted)',
  transition: 'background 0.12s ease, color 0.12s ease',
}

const hoverIn = (e: React.MouseEvent<HTMLButtonElement>, skipIf?: boolean) => {
  if (!skipIf) (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)'
}
const hoverOut = (e: React.MouseEvent<HTMLButtonElement>, skipIf?: boolean) => {
  if (!skipIf) (e.currentTarget as HTMLElement).style.background = 'transparent'
}

interface MessageActionToolbarProps {
  isUser: boolean
  isAssistant: boolean
  isPermission: boolean
  isPlan: boolean
  message: StandardChatMessage
  copied: boolean
  showRawMarkdown: boolean
  globalIsStreaming: boolean
  onToggleRawMarkdown: () => void
  onStartEdit: () => void
  onCopy: () => void
  onBookmark: () => void
  onQuote: () => void
  onSaveAsNote: () => void
  onRememberThis: () => void
  onShare: () => void
  onPin: () => void
  onTranslate: () => void
  onReadAloud?: () => void
  isSpeaking?: boolean
  hasOnEdit: boolean
  onAnnotate?: () => void
  hasAnnotation?: boolean
  onRate?: (rating: 'up' | 'down' | null) => void
  onRewind?: () => void
  isLastMessage?: boolean
}

export default function MessageActionToolbar({
  isUser, isAssistant, isPermission, isPlan, message,
  copied, showRawMarkdown, globalIsStreaming,
  onToggleRawMarkdown, onStartEdit, onCopy, onBookmark, onQuote, onSaveAsNote, onRememberThis, onShare, onPin, onTranslate, onReadAloud, isSpeaking,
  hasOnEdit,
  onAnnotate, hasAnnotation,
  onRate,
  onRewind,
  isLastMessage,
}: MessageActionToolbarProps) {
  const t = useT()

  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      className="popup-enter"
      style={{
        position: 'absolute',
        top: -14,
        ...(isUser ? { left: 0 } : { right: 0 }),
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '3px 5px',
        background: 'var(--popup-bg)',
        border: '1px solid var(--popup-border)',
        boxShadow: 'var(--popup-shadow)',
        borderRadius: 8,
        zIndex: 20,
      }}
    >
      {/* Raw markdown toggle (assistant only) */}
      {isAssistant && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleRawMarkdown() }}
          title={showRawMarkdown ? t('message.formattedView') : t('message.rawMarkdown')}
          style={{
            ...actionBtnStyle,
            background: showRawMarkdown ? 'var(--accent)' : 'transparent',
            color: showRawMarkdown ? '#fff' : 'var(--text-muted)',
          }}
          onMouseEnter={(e) => hoverIn(e, showRawMarkdown)}
          onMouseLeave={(e) => hoverOut(e, showRawMarkdown)}
        >
          <Code2 size={13} />
        </button>
      )}

      {/* Edit (user messages only) */}
      {isUser && hasOnEdit && !globalIsStreaming && (
        <button
          onClick={(e) => { e.stopPropagation(); onStartEdit() }}
          title={t('message.editMessage')}
          style={actionBtnStyle}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <Pencil size={13} />
        </button>
      )}

      {/* Rewind to here (not shown on last message or while streaming) */}
      {onRewind && !isLastMessage && !globalIsStreaming && !isPermission && !isPlan && (
        <button
          onClick={(e) => { e.stopPropagation(); onRewind() }}
          title={t('rewind.button')}
          style={actionBtnStyle}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <Undo2 size={13} />
        </button>
      )}

      {/* Copy */}
      <button
        onClick={(e) => { e.stopPropagation(); onCopy() }}
        title={copied ? t('message.copied') : t('message.copy')}
        style={{
          ...actionBtnStyle,
          gap: 3,
          color: copied ? 'var(--success)' : 'var(--text-muted)',
          fontSize: 11,
        }}
        onMouseEnter={(e) => hoverIn(e, copied)}
        onMouseLeave={(e) => hoverOut(e)}
      >
        {copied ? (
          <>
            <Check size={13} />
            <span style={{ fontSize: 11, lineHeight: 1 }}>{t('message.copied')}</span>
          </>
        ) : (
          <Copy size={13} />
        )}
      </button>

      {/* Bookmark */}
      {!isPermission && !isPlan && (
        <button
          onClick={(e) => { e.stopPropagation(); onBookmark() }}
          title={message.bookmarked ? t('message.removeBookmark') : t('message.bookmark')}
          style={{
            ...actionBtnStyle,
            color: message.bookmarked ? 'var(--warning)' : 'var(--text-muted)',
          }}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <Bookmark
            size={13}
            style={message.bookmarked ? { fill: 'var(--warning)' } : {}}
          />
        </button>
      )}

      {/* Pin */}
      {!isPermission && !isPlan && (
        <button
          onClick={(e) => { e.stopPropagation(); onPin() }}
          title={message.pinned ? t('message.unpinMessage') : t('message.pinMessage')}
          style={{
            ...actionBtnStyle,
            color: message.pinned ? 'var(--accent)' : 'var(--text-muted)',
          }}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <Pin
            size={13}
            style={message.pinned ? { fill: 'var(--accent)' } : {}}
          />
        </button>
      )}

      {/* Quote reply */}
      {!isPermission && !isPlan && message.content && (
        <button
          onClick={(e) => { e.stopPropagation(); onQuote() }}
          title={t('message.quoteReply')}
          style={actionBtnStyle}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <MessageSquareQuote size={13} />
        </button>
      )}

      {/* Translate */}
      {!isPermission && !isPlan && message.content && (
        <button
          onClick={(e) => { e.stopPropagation(); onTranslate() }}
          title={t('message.translateMessage')}
          style={actionBtnStyle}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <Languages size={13} />
        </button>
      )}

      {/* Share */}
      {!isPermission && !isPlan && message.content && (
        <button
          onClick={(e) => { e.stopPropagation(); onShare() }}
          title={t('message.shareMessage')}
          style={actionBtnStyle}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <Share2 size={13} />
        </button>
      )}

      {/* Annotate */}
      {!isPermission && !isPlan && onAnnotate && (
        <button
          onClick={(e) => { e.stopPropagation(); onAnnotate() }}
          title={hasAnnotation ? t('message.editAnnotation') : t('message.addAnnotation')}
          style={{
            ...actionBtnStyle,
            color: hasAnnotation ? 'var(--accent)' : 'var(--text-muted)',
          }}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <StickyNote size={13} style={hasAnnotation ? { fill: 'var(--accent)', opacity: 0.3 } : {}} />
        </button>
      )}

      {/* Read Aloud (assistant messages only) */}
      {isAssistant && onReadAloud && (
        <button
          onClick={(e) => { e.stopPropagation(); onReadAloud() }}
          title={isSpeaking ? t('message.stopReading') : t('message.readAloud')}
          style={{
            ...actionBtnStyle,
            color: isSpeaking ? 'var(--accent)' : 'var(--text-muted)',
          }}
          onMouseEnter={(e) => hoverIn(e, isSpeaking)}
          onMouseLeave={(e) => hoverOut(e, isSpeaking)}
        >
          {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
      )}

      {/* Rate (assistant messages only) */}
      {isAssistant && onRate && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onRate(message.rating === 'up' ? null : 'up') }}
            title={t('message.thumbsUp')}
            style={{
              ...actionBtnStyle,
              color: message.rating === 'up' ? 'var(--success)' : 'var(--text-muted)',
            }}
            onMouseEnter={(e) => hoverIn(e, message.rating === 'up')}
            onMouseLeave={(e) => hoverOut(e, message.rating === 'up')}
          >
            <ThumbsUp size={13} style={message.rating === 'up' ? { fill: 'var(--success)', opacity: 0.3 } : {}} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRate(message.rating === 'down' ? null : 'down') }}
            title={t('message.thumbsDown')}
            style={{
              ...actionBtnStyle,
              color: message.rating === 'down' ? 'var(--error)' : 'var(--text-muted)',
            }}
            onMouseEnter={(e) => hoverIn(e, message.rating === 'down')}
            onMouseLeave={(e) => hoverOut(e, message.rating === 'down')}
          >
            <ThumbsDown size={13} style={message.rating === 'down' ? { fill: 'var(--error)', opacity: 0.3 } : {}} />
          </button>
        </>
      )}

      {/* Save to Note (assistant messages only) */}
      {isAssistant && message.content && (
        <button
          onClick={(e) => { e.stopPropagation(); onSaveAsNote() }}
          title={t('message.saveToNote')}
          style={actionBtnStyle}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <NotebookPen size={13} />
        </button>
      )}

      {/* Remember This (assistant messages only) */}
      {isAssistant && message.content && (
        <button
          onClick={(e) => { e.stopPropagation(); onRememberThis() }}
          title={t('message.rememberThis')}
          style={actionBtnStyle}
          onMouseEnter={(e) => hoverIn(e)}
          onMouseLeave={(e) => hoverOut(e)}
        >
          <Brain size={13} />
        </button>
      )}
    </div>
  )
}
