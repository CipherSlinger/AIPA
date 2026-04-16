import React, { useState, useRef, useEffect } from 'react'
import { StandardChatMessage } from '../../types/app.types'
import { Copy, Check, Bookmark, Code2, Pencil, MessageSquareQuote, NotebookPen, Volume2, VolumeX, Brain, Share2, Pin, Languages, StickyNote, ThumbsUp, ThumbsDown, Undo2, ChevronDown, FileText, Braces, GitBranch } from 'lucide-react'
import { useT } from '../../i18n'

// ---------- ActionButton ----------
// Handles hover/active states via React state so no imperative style mutations exist.

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean
  isCopied?: boolean
  isDestructive?: boolean
  skipHover?: boolean
  style?: React.CSSProperties
}

function ActionButton({
  isActive,
  isCopied,
  isDestructive,
  skipHover,
  style,
  children,
  ...rest
}: ActionButtonProps) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  let bg = 'transparent'
  let color = 'var(--text-muted)'

  if (isCopied) {
    bg = 'rgba(34,197,94,0.1)'
    color = '#4ade80'
  } else if (isActive) {
    // keep caller-provided color; just ensure bg reflects active
    bg = 'transparent'
  } else if (pressed) {
    bg = 'rgba(99,102,241,0.15)'
    color = '#818cf8'
  } else if (hovered && !skipHover) {
    bg = isDestructive ? 'rgba(239,68,68,0.12)' : 'var(--border)'
    color = isDestructive ? '#fca5a5' : 'var(--text-primary)'
  }

  return (
    <button
      {...rest}
      style={{
        background: bg,
        border: hovered && !skipHover && !isActive && !isCopied
          ? '1px solid var(--border)'
          : '1px solid transparent',
        borderRadius: 8,
        padding: '4px 6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 28,
        minHeight: 28,
        color,
        transition: 'all 0.15s ease',
        ...style,
      }}
      onMouseEnter={(e) => { setHovered(true); rest.onMouseEnter?.(e) }}
      onMouseLeave={(e) => { setHovered(false); setPressed(false); rest.onMouseLeave?.(e) }}
      onMouseDown={(e) => { setPressed(true); rest.onMouseDown?.(e) }}
      onMouseUp={(e) => { setPressed(false); rest.onMouseUp?.(e) }}
    >
      {children}
    </button>
  )
}

// ---------- Separator ----------

function Sep() {
  return (
    <div
      style={{
        background: 'var(--border)',
        width: 1,
        height: 14,
        margin: '0 2px',
        flexShrink: 0,
      }}
    />
  )
}

// ---------- Props ----------

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
  onCopyMarkdown?: () => void
  onCopyCodeBlocks?: () => void
  hasCodeBlocks?: boolean
  onFork?: () => void
}

// ---------- Component ----------

export default function MessageActionToolbar({
  isUser, isAssistant, isPermission, isPlan, message,
  copied, showRawMarkdown, globalIsStreaming,
  onToggleRawMarkdown, onStartEdit, onCopy, onBookmark, onQuote, onSaveAsNote, onRememberThis, onShare, onPin, onTranslate, onReadAloud, isSpeaking,
  hasOnEdit,
  onAnnotate, hasAnnotation,
  onRate,
  onRewind,
  isLastMessage,
  onCopyMarkdown,
  onCopyCodeBlocks,
  hasCodeBlocks,
  onFork,
}: MessageActionToolbarProps) {
  const t = useT()
  const [showCopyMenu, setShowCopyMenu] = useState(false)
  const copyMenuRef = useRef<HTMLDivElement>(null)

  // Close copy menu on click outside
  useEffect(() => {
    if (!showCopyMenu) return
    const handler = (e: MouseEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setShowCopyMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCopyMenu])

  // Whether any "left group" buttons are visible (edit / fork / rewind)
  const hasLeftGroup = (isUser && hasOnEdit && !globalIsStreaming) ||
    (isUser && !!onFork && !globalIsStreaming) ||
    (!!onRewind && !isLastMessage && !globalIsStreaming && !isPermission && !isPlan)

  // Whether right assistant-only group is visible (save/remember)
  const hasAssistantRightGroup = isAssistant && !!message.content

  return (
    <div
      role="toolbar"
      aria-label={t('a11y.messageActions')}
      className="popup-enter"
      style={{
        position: 'absolute',
        bottom: -14,
        ...(isUser ? { left: 0 } : { right: 0 }),
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '2px 4px',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)',
        borderRadius: 10,
        zIndex: 100,
        animation: 'slideUp 0.15s ease',
      }}
    >
      {/* ── Left group: edit / fork / rewind ── */}

      {/* Raw markdown toggle (assistant only) — sits before the left sep */}
      {isAssistant && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onToggleRawMarkdown() }}
          title={showRawMarkdown ? t('message.formattedView') : t('message.rawMarkdown')}
          isActive={showRawMarkdown}
          skipHover={showRawMarkdown}
          style={{
            background: showRawMarkdown ? '#6366f1' : undefined,
            color: showRawMarkdown ? 'rgba(255,255,255,0.95)' : undefined,
          }}
        >
          <Code2 size={13} />
        </ActionButton>
      )}

      {/* Edit (user messages only) */}
      {isUser && hasOnEdit && !globalIsStreaming && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onStartEdit() }}
          title={t('message.editMessage')}
        >
          <Pencil size={13} />
        </ActionButton>
      )}

      {/* Fork from here (user messages only) */}
      {isUser && onFork && !globalIsStreaming && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onFork() }}
          title={t('fork.forkFromHere')}
        >
          <GitBranch size={13} />
        </ActionButton>
      )}

      {/* Rewind to here */}
      {onRewind && !isLastMessage && !globalIsStreaming && !isPermission && !isPlan && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onRewind() }}
          title={t('rewind.button')}
        >
          <Undo2 size={13} />
        </ActionButton>
      )}

      {/* Separator after left group */}
      {hasLeftGroup && <Sep />}

      {/* ── Copy with dropdown ── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} ref={copyMenuRef}>
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onCopy() }}
          title={copied ? t('message.copied') : t('message.copy')}
          isCopied={copied}
          skipHover={copied}
          style={{
            gap: 3,
            fontSize: 11,
            borderRadius: (isAssistant && (onCopyMarkdown || onCopyCodeBlocks)) ? '5px 0 0 5px' : 5,
          }}
        >
          {copied ? (
            <>
              <Check size={13} />
              <span style={{ fontSize: 11, lineHeight: 1 }}>{t('message.copied')}</span>
            </>
          ) : (
            <Copy size={13} />
          )}
        </ActionButton>

        {/* Dropdown arrow for assistant messages with copy variants */}
        {isAssistant && (onCopyMarkdown || onCopyCodeBlocks) && (
          <ActionButton
            onClick={(e) => { e.stopPropagation(); setShowCopyMenu(!showCopyMenu) }}
            title={t('copy.moreOptions')}
            style={{
              padding: '4px 2px',
              borderRadius: '0 5px 5px 0',
              borderLeft: '1px solid var(--border)',
            }}
          >
            <ChevronDown size={10} />
          </ActionButton>
        )}

        {/* Copy dropdown menu */}
        {showCopyMenu && (
          <div
            className="popup-enter"
            style={{
              position: 'absolute',
              top: '100%',
              ...(isUser ? { left: 0 } : { right: 0 }),
              marginTop: 4,
              width: 180,
              background: 'var(--popup-bg)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
              padding: '4px 0',
              zIndex: 200,
              animation: 'slideUp 0.15s ease',
            }}
          >
            <DropdownItem
              icon={<FileText size={12} color="var(--text-muted)" />}
              label={t('copy.asText')}
              onClick={(e) => { e.stopPropagation(); onCopy(); setShowCopyMenu(false) }}
            />
            {onCopyMarkdown && (
              <DropdownItem
                icon={<Braces size={12} color="var(--text-muted)" />}
                label={t('copy.asMarkdown')}
                onClick={(e) => { e.stopPropagation(); onCopyMarkdown(); setShowCopyMenu(false) }}
              />
            )}
            {onCopyCodeBlocks && hasCodeBlocks && (
              <DropdownItem
                icon={<Code2 size={12} color="var(--text-muted)" />}
                label={t('copy.codeBlocksOnly')}
                onClick={(e) => { e.stopPropagation(); onCopyCodeBlocks(); setShowCopyMenu(false) }}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Middle group: bookmark / pin / quote / translate / share / annotate ── */}

      {!isPermission && !isPlan && <Sep />}

      {/* Bookmark */}
      {!isPermission && !isPlan && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onBookmark() }}
          title={message.bookmarked ? t('message.removeBookmark') : t('message.bookmark')}
          isActive={!!message.bookmarked}
          style={{
            color: message.bookmarked ? '#818cf8' : undefined,
          }}
        >
          <Bookmark
            size={13}
            style={message.bookmarked ? { fill: '#818cf8' } : {}}
          />
        </ActionButton>
      )}

      {/* Pin */}
      {!isPermission && !isPlan && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onPin() }}
          title={message.pinned ? t('message.unpinMessage') : t('message.pinMessage')}
          isActive={!!message.pinned}
          style={{
            color: message.pinned ? '#6366f1' : undefined,
          }}
        >
          <Pin
            size={13}
            style={message.pinned ? { fill: '#6366f1' } : {}}
          />
        </ActionButton>
      )}

      {/* Quote reply */}
      {!isPermission && !isPlan && message.content && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onQuote() }}
          title={t('message.quoteReply')}
        >
          <MessageSquareQuote size={13} />
        </ActionButton>
      )}

      {/* Translate */}
      {!isPermission && !isPlan && message.content && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onTranslate() }}
          title={t('message.translateMessage')}
        >
          <Languages size={13} />
        </ActionButton>
      )}

      {/* Share */}
      {!isPermission && !isPlan && message.content && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onShare() }}
          title={t('message.shareMessage')}
        >
          <Share2 size={13} />
        </ActionButton>
      )}

      {/* Annotate */}
      {!isPermission && !isPlan && onAnnotate && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onAnnotate() }}
          title={hasAnnotation ? t('message.editAnnotation') : t('message.addAnnotation')}
          isActive={!!hasAnnotation}
          style={{
            color: hasAnnotation ? '#6366f1' : undefined,
          }}
        >
          <StickyNote size={13} style={hasAnnotation ? { fill: '#6366f1', opacity: 0.3 } : {}} />
        </ActionButton>
      )}

      {/* ── Assistant-only right group ── */}

      {isAssistant && <Sep />}

      {/* Read Aloud (assistant messages only) */}
      {isAssistant && onReadAloud && (
        <ActionButton
          onClick={(e) => { e.stopPropagation(); onReadAloud() }}
          title={isSpeaking ? t('message.stopReading') : t('message.readAloud')}
          isActive={!!isSpeaking}
          skipHover={!!isSpeaking}
          style={{
            color: isSpeaking ? '#6366f1' : undefined,
          }}
        >
          {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </ActionButton>
      )}

      {/* Rate (assistant messages only) */}
      {isAssistant && onRate && (
        <>
          <ActionButton
            onClick={(e) => { e.stopPropagation(); onRate(message.rating === 'up' ? null : 'up') }}
            title={t('message.thumbsUp')}
            isActive={message.rating === 'up'}
            skipHover={message.rating === 'up'}
            style={{
              color: message.rating === 'up' ? '#4ade80' : undefined,
            }}
          >
            <ThumbsUp size={13} style={message.rating === 'up' ? { fill: '#4ade80', opacity: 0.3 } : {}} />
          </ActionButton>
          {/* ThumbsDown is destructive-flavored */}
          <ActionButton
            onClick={(e) => { e.stopPropagation(); onRate(message.rating === 'down' ? null : 'down') }}
            title={t('message.thumbsDown')}
            isActive={message.rating === 'down'}
            skipHover={message.rating === 'down'}
            isDestructive={message.rating !== 'down'}
            style={{
              color: message.rating === 'down' ? '#f87171' : undefined,
            }}
          >
            <ThumbsDown size={13} style={message.rating === 'down' ? { fill: '#f87171', opacity: 0.3 } : {}} />
          </ActionButton>
        </>
      )}

      {/* Save to Note / Remember This (assistant messages only) */}
      {hasAssistantRightGroup && (
        <>
          <ActionButton
            onClick={(e) => { e.stopPropagation(); onSaveAsNote() }}
            title={t('message.saveToNote')}
          >
            <NotebookPen size={13} />
          </ActionButton>
          <ActionButton
            onClick={(e) => { e.stopPropagation(); onRememberThis() }}
            title={t('message.rememberThis')}
          >
            <Brain size={13} />
          </ActionButton>
        </>
      )}
    </div>
  )
}

// ---------- DropdownItem ----------

function DropdownItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: React.MouseEventHandler<HTMLButtonElement>
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '7px 14px',
        background: hovered ? 'var(--border)' : 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-primary)',
        fontSize: 13,
        textAlign: 'left',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {icon}
      {label}
    </button>
  )
}
