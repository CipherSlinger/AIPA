import React, { useState, useCallback, useEffect, useRef } from 'react'
import { ChatMessage, StandardChatMessage, Persona } from '../../types/app.types'
import MessageContextMenu from './MessageContextMenu'
import MessageActionToolbar from './MessageActionToolbar'
import MessageBubbleContent from './MessageBubbleContent'
import SelectionToolbar from './SelectionToolbar'
import ImageLightbox from '../shared/ImageLightbox'
import { User, Bot, Bookmark } from 'lucide-react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { useMessageActions } from '../../hooks/useMessageActions'
import { toggleShowAbsoluteTime } from './messageUtils'

interface Props {
  message: ChatMessage
  onRate?: (msgId: string, rating: 'positive' | 'negative') => void
  onRewind?: (ts: number) => void
  onBookmark?: (msgId: string) => void
  onCollapse?: (msgId: string) => void
  onEdit?: (msgId: string, newContent: string) => void
  searchQuery?: string
  searchCaseSensitive?: boolean
  showAvatar?: boolean
  isLastUserMsg?: boolean
  hasAssistantReply?: boolean
}

export default React.memo(function Message({ message, onRate, onRewind, onBookmark, onCollapse, onEdit, searchQuery, searchCaseSensitive, showAvatar = true, isLastUserMsg = false, hasAssistantReply = false }: Props) {
  const t = useT()
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const isSystem = message.role === 'system' || (isAssistant && (message as StandardChatMessage).content?.startsWith('\u26a0\ufe0f'))
  const isPermission = message.role === 'permission'
  const isPlan = message.role === 'plan'
  const isCollapsed = !isPermission && !isPlan && (message as StandardChatMessage).collapsed
  const compact = usePrefsStore(s => s.prefs.compactMode)
  const activePersona: Persona | undefined = usePrefsStore(s => {
    const personas = s.prefs.personas || []
    const activeId = s.prefs.activePersonaId
    return activeId ? personas.find(p => p.id === activeId) : undefined
  })
  const globalIsStreaming = useChatStore(s => s.isStreaming)
  const msgStatus: 'sending' | 'sent' | 'read' | null = isUser
    ? (globalIsStreaming && isLastUserMsg ? 'sending' : hasAssistantReply ? 'read' : 'sent')
    : null

  const [hovered, setHovered] = useState(false)
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [, setTick] = useState(0)
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null)

  // Editing state (user messages only)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const editTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  // Extracted actions hook
  const {
    copied, handleCopy, handleQuote, handleBookmarkAction,
    handleCopyMarkdown, handleCopyRichText, handleSaveAsNote, handleDoubleClick,
  } = useMessageActions({ message, isPermission, isPlan })

  // Word info tooltip (both user and assistant messages)
  const wordInfo = (message as StandardChatMessage).content
    ? (() => {
        const text = (message as StandardChatMessage).content
        const words = text.split(/\s+/).filter(w => w.length > 0).length
        const tokens = Math.round(words / 0.75)
        return `${words} words (~${tokens} tokens)`
      })()
    : null

  // Listen for timestamp mode toggle (re-render all messages)
  useEffect(() => {
    const handler = () => setTick(n => n + 1)
    window.addEventListener('aipa:timestampToggle', handler)
    return () => window.removeEventListener('aipa:timestampToggle', handler)
  }, [])

  // Live-update relative timestamp every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const handleTimestampClick = useCallback(() => {
    toggleShowAbsoluteTime()
    window.dispatchEvent(new CustomEvent('aipa:timestampToggle'))
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isPermission || isPlan) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [isPermission, isPlan])

  const handleStartEdit = useCallback(() => {
    setEditContent((message as StandardChatMessage).content || '')
    setIsEditing(true)
    setTimeout(() => editTextareaRef.current?.focus(), 50)
  }, [message])

  const handleEditSubmit = useCallback(() => {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent.trim())
      setIsEditing(false)
    }
  }, [editContent, onEdit, message.id])

  // --- System message ---
  if (isSystem) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 20px' }}>
        <span style={{
          background: 'rgba(244, 71, 71, 0.08)', borderRadius: 4,
          padding: '4px 12px', fontSize: 12, color: 'var(--text-muted)',
        }}>
          {(message as StandardChatMessage).content}
        </span>
      </div>
    )
  }

  // --- Permission / Plan cards ---
  if (isPermission || isPlan) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 20px' }}>
        {/* Children will be rendered by MessageList via PermissionCard/PlanCard */}
      </div>
    )
  }

  // --- Avatar sizes ---
  const avatarSize = compact ? 28 : 36
  const iconSize = compact ? 14 : 18

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: compact ? `6px 20px` : `8px 20px`,
        maxWidth: '100%',
        position: 'relative',
      }}
      aria-label={isUser ? `You said: ${((message as StandardChatMessage).content || '').slice(0, 100)}` : `Claude said: ${((message as StandardChatMessage).content || '').slice(0, 100)}`}
    >
      {/* Avatar or spacer */}
      {showAvatar ? (
        <div
          style={{
            width: avatarSize, height: avatarSize,
            borderRadius: '50%',
            background: isUser ? 'var(--avatar-user)' : (isAssistant && activePersona ? `${activePersona.color}30` : 'var(--avatar-ai)'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2,
          }}
        >
          {isUser
            ? <User size={iconSize} color="#ffffff" />
            : isAssistant && activePersona
            ? <span style={{ fontSize: avatarSize * 0.55, lineHeight: 1 }}>{activePersona.emoji}</span>
            : <Bot size={iconSize} color="#ffffff" />
          }
        </div>
      ) : (
        <div style={{ width: avatarSize, flexShrink: 0 }} />
      )}

      {/* Bubble wrapper + hover actions */}
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 'min(85%, 720px)', minWidth: 60, position: 'relative' }}>
        {/* Bubble */}
        <div
          ref={bubbleRef}
          style={{
            background: isUser ? 'var(--bubble-user)' : 'var(--bubble-ai)',
            borderRadius: isUser ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
            padding: compact ? '8px 12px' : '10px 14px',
            color: isUser ? 'var(--bubble-user-text)' : 'var(--bubble-ai-text)',
            border: isUser ? '1px solid var(--bubble-user-border)' : '1px solid var(--bubble-ai-border)',
            wordBreak: 'break-word',
            position: 'relative',
            boxShadow: hovered ? '0 2px 6px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.12)',
            transition: 'box-shadow 0.15s ease',
          }}
          title={wordInfo || undefined}
        >
          {/* Bookmark indicator */}
          {!isPermission && !isPlan && (message as StandardChatMessage).bookmarked && (
            <div style={{
              position: 'absolute', top: -6,
              right: isUser ? undefined : -6,
              left: isUser ? -6 : undefined,
            }}>
              <Bookmark size={14} style={{ color: 'var(--warning)', fill: 'var(--warning)' }} />
            </div>
          )}

          <MessageBubbleContent
            message={message as StandardChatMessage}
            isUser={isUser}
            isAssistant={isAssistant}
            isPermission={isPermission}
            isCollapsed={!!isCollapsed}
            compact={!!compact}
            searchQuery={searchQuery}
            searchCaseSensitive={searchCaseSensitive}
            msgStatus={msgStatus}
            isEditing={isEditing}
            editContent={editContent}
            onEditContentChange={setEditContent}
            onEditSubmit={handleEditSubmit}
            onEditCancel={() => setIsEditing(false)}
            editTextareaRef={editTextareaRef as React.RefObject<HTMLTextAreaElement>}
            showRawMarkdown={showRawMarkdown}
            onImageClick={(src, alt) => setLightboxImage({ src, alt })}
            onCollapse={onCollapse}
            onEdit={onEdit}
            onTimestampClick={handleTimestampClick}
          />
        </div>

        {/* Floating action toolbar */}
        {hovered && !isCollapsed && (
          <MessageActionToolbar
            isUser={isUser}
            isAssistant={isAssistant}
            isPermission={isPermission}
            isPlan={isPlan}
            message={message as StandardChatMessage}
            copied={copied}
            showRawMarkdown={showRawMarkdown}
            globalIsStreaming={globalIsStreaming}
            onToggleRawMarkdown={() => setShowRawMarkdown(!showRawMarkdown)}
            onStartEdit={handleStartEdit}
            onCopy={handleCopy}
            onBookmark={() => handleBookmarkAction(onBookmark)}
            onQuote={handleQuote}
            onSaveAsNote={handleSaveAsNote}
            hasOnEdit={!!onEdit}
          />
        )}
      </div>

      {/* Text selection toolbar */}
      {!isPermission && !isPlan && !isCollapsed && !isEditing && (
        <SelectionToolbar containerRef={bubbleRef as React.RefObject<HTMLElement>} isUser={isUser} />
      )}

      {/* Context menu */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          message={message}
          onCopy={handleCopy}
          onCopyMarkdown={isAssistant ? handleCopyMarkdown : undefined}
          onCopyRichText={isAssistant ? handleCopyRichText : undefined}
          onSaveAsNote={isAssistant && (message as StandardChatMessage).content ? handleSaveAsNote : undefined}
          onQuoteReply={!isPermission && !isPlan && (message as StandardChatMessage).content ? handleQuote : undefined}
          onEditMessage={isUser && onEdit && !globalIsStreaming ? handleStartEdit : undefined}
          onRate={onRate ? (rating) => onRate(message.id, rating) : undefined}
          onBookmark={onBookmark ? () => onBookmark(message.id) : undefined}
          onCollapse={onCollapse ? () => onCollapse(message.id) : undefined}
          onRewind={onRewind && (message as StandardChatMessage).timestamp
            ? () => onRewind((message as StandardChatMessage).timestamp)
            : undefined
          }
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Image lightbox */}
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.src}
          alt={lightboxImage.alt}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  const pm = prevProps.message as StandardChatMessage
  const nm = nextProps.message as StandardChatMessage
  if (prevProps.message.id !== nextProps.message.id) return false
  if (prevProps.message.role !== nextProps.message.role) return false
  if (pm.content !== nm.content) return false
  if (pm.isStreaming !== nm.isStreaming) return false
  if (pm.rating !== nm.rating) return false
  if (pm.bookmarked !== nm.bookmarked) return false
  if (pm.collapsed !== nm.collapsed) return false
  if (pm.thinking !== nm.thinking) return false
  if ((pm.toolUses?.length ?? 0) !== (nm.toolUses?.length ?? 0)) return false
  if (prevProps.searchQuery !== nextProps.searchQuery) return false
  if (prevProps.searchCaseSensitive !== nextProps.searchCaseSensitive) return false
  if (prevProps.showAvatar !== nextProps.showAvatar) return false
  return true
})
