import React, { useState } from 'react'
import { StandardChatMessage } from '../../types/app.types'
import { Copy, Check, Bookmark, Code2, Pencil, MessageSquareQuote, NotebookPen, Volume2, VolumeX, Brain, Share2, Pin, SmilePlus } from 'lucide-react'
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
  onReaction: (emoji: string) => void
  onReadAloud?: () => void
  isSpeaking?: boolean
  hasOnEdit: boolean
}

export default function MessageActionToolbar({
  isUser, isAssistant, isPermission, isPlan, message,
  copied, showRawMarkdown, globalIsStreaming,
  onToggleRawMarkdown, onStartEdit, onCopy, onBookmark, onQuote, onSaveAsNote, onRememberThis, onShare, onPin, onReaction, onReadAloud, isSpeaking,
  hasOnEdit,
}: MessageActionToolbarProps) {
  const t = useT()
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const REACTION_EMOJIS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F525}', '\u{1F602}', '\u{1F389}', '\u{1F440}', '\u{1F914}', '\u{1F4AF}']

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

      {/* Reaction */}
      {!isPermission && !isPlan && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowReactionPicker(!showReactionPicker) }}
            title={t('message.addReaction')}
            style={{
              ...actionBtnStyle,
              color: showReactionPicker ? 'var(--accent)' : 'var(--text-muted)',
            }}
            onMouseEnter={(e) => hoverIn(e, showReactionPicker)}
            onMouseLeave={(e) => hoverOut(e, showReactionPicker)}
          >
            <SmilePlus size={13} />
          </button>
          {showReactionPicker && (
            <div
              className="popup-enter"
              style={{
                position: 'absolute',
                top: '100%',
                ...(isUser ? { right: 0 } : { left: 0 }),
                marginTop: 4,
                display: 'flex',
                gap: 2,
                padding: '4px 6px',
                background: 'var(--popup-bg)',
                border: '1px solid var(--popup-border)',
                boxShadow: 'var(--popup-shadow)',
                borderRadius: 8,
                zIndex: 30,
              }}
            >
              {REACTION_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation()
                    onReaction(emoji)
                    setShowReactionPicker(false)
                  }}
                  style={{
                    background: (message.reactions || []).includes(emoji) ? 'var(--accent-muted, rgba(100,108,255,0.15))' : 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    padding: '2px 4px',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                    transition: 'transform 0.1s ease',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.3)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
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
