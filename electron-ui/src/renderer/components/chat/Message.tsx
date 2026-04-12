// Message — decomposed (Iteration 451: extracted useReadAloud, ReactionChips, AnnotationEditor)
// Iteration 453: copy flash feedback on bubble
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { ChatMessage, StandardChatMessage, Persona } from '../../types/app.types'
import MessageContextMenu from './MessageContextMenu'
import MessageActionToolbar from './MessageActionToolbar'
import MessageBubbleContent from './MessageBubbleContent'
import SelectionToolbar from './SelectionToolbar'
import ImageLightbox from '../shared/ImageLightbox'
import ReactionChips from './ReactionChips'
import AnnotationEditor from './AnnotationEditor'
import { User, Bot, Bookmark, Pin } from 'lucide-react'
import { usePrefsStore, useChatStore } from '../../store'
import { useT } from '../../i18n'
import { useMessageActions } from '../../hooks/useMessageActions'
import { useReadAloud } from './useReadAloud'
import { toggleShowAbsoluteTime } from './messageUtils'
import { formatBriefTimestamp } from '../../utils/formatBriefTimestamp'

interface Props {
  message: ChatMessage
  onRate?: (msgId: string, rating: 'up' | 'down' | null) => void
  onRewind?: (ts: number) => void
  onBookmark?: (msgId: string) => void
  onCollapse?: (msgId: string) => void
  onEdit?: (msgId: string, newContent: string) => void
  onFork?: () => void
  searchQuery?: string
  searchCaseSensitive?: boolean
  showAvatar?: boolean
  showTimestamp?: boolean
  isLastUserMsg?: boolean
  isLastMessage?: boolean
  hasAssistantReply?: boolean
}

export default React.memo(function Message({ message, onRate, onRewind, onBookmark, onCollapse, onEdit, onFork, searchQuery, searchCaseSensitive, showAvatar = true, showTimestamp = true, isLastUserMsg = false, isLastMessage = false, hasAssistantReply = false }: Props) {
  const t = useT()
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const isSystem = message.role === 'system' || (isAssistant && (message as StandardChatMessage).content?.startsWith('\u26a0\ufe0f'))
  const isPermission = message.role === 'permission'
  const isPlan = message.role === 'plan'
  const isCollapsed = !isPermission && !isPlan && (message as StandardChatMessage).collapsed
  const compact = usePrefsStore(s => s.prefs.compactMode)
  // STABILITY (Iteration 308, updated Iteration 407 for per-session persona):
  // Use sessionPersonaId (per-session) falling back to activePersonaId (default).
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const defaultPersonaId = usePrefsStore(s => s.prefs.activePersonaId)
  const effectivePersonaId = sessionPersonaId || defaultPersonaId
  const personas = usePrefsStore(s => s.prefs.personas)
  const activePersona: Persona | undefined = useMemo(
    () => effectivePersonaId ? (personas || []).find(p => p.id === effectivePersonaId) : undefined,
    [effectivePersonaId, personas]
  )
  const globalIsStreaming = useChatStore(s => s.isStreaming)
  const msgStatus: 'sending' | 'sent' | 'read' | null = isUser
    ? (globalIsStreaming && isLastUserMsg ? 'sending' : hasAssistantReply ? 'read' : 'sent')
    : null

  const [hovered, setHovered] = useState(false)
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [, setTick] = useState(0)
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null)

  // TTS (extracted hook, Iteration 451)
  const { isSpeaking, handleReadAloud } = useReadAloud(message)

  // Editing state (user messages only)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const editTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  // Annotation editor open state (managed here, rendering delegated to AnnotationEditor)
  const [showAnnotationEditor, setShowAnnotationEditor] = useState(false)
  const handleAnnotateToggle = useCallback(() => {
    setShowAnnotationEditor(prev => !prev)
  }, [])

  // Extracted actions hook
  const {
    copied, handleCopy, handleQuote, handleBookmarkAction,
    handleCopyMarkdown, handleCopyRichText, handleSaveAsNote, handleRememberThis, handleShare, handlePin, handleDoubleClick, handleTranslate, handleCopyCodeBlocks,
  } = useMessageActions({ message, isPermission, isPlan })

  // Copy flash effect: briefly highlight bubble border after copy (Iteration 453)
  const [copyFlash, setCopyFlash] = useState(false)
  const prevCopiedRef = useRef(false)
  useEffect(() => {
    if (copied && !prevCopiedRef.current) {
      setCopyFlash(true)
      const timer = setTimeout(() => setCopyFlash(false), 350)
      return () => clearTimeout(timer)
    }
    prevCopiedRef.current = copied
  }, [copied])

  // Listen for keyboard copy event (Ctrl+C on focused message, Iteration 453)
  useEffect(() => {
    const handler = (e: Event) => {
      const msgId = (e as CustomEvent).detail as string
      if (msgId === message.id) {
        setCopyFlash(true)
        setTimeout(() => setCopyFlash(false), 350)
      }
    }
    window.addEventListener('aipa:messageCopiedByKeyboard', handler)
    return () => window.removeEventListener('aipa:messageCopiedByKeyboard', handler)
  }, [message.id])

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
    const content = (message as StandardChatMessage).content || ''
    // Away summary card (Iteration 481) — special collapsible card with moon icon
    if (content.startsWith('[AWAY_SUMMARY]')) {
      const summaryText = content.replace('[AWAY_SUMMARY]', '').trim()
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 20px' }}>
          <div style={{
            background: 'rgba(139, 92, 246, 0.06)',
            border: '1px solid rgba(139, 92, 246, 0.15)',
            borderRadius: 10,
            padding: '8px 14px',
            fontSize: 11,
            color: 'rgba(255,255,255,0.45)',
            maxWidth: 480,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>🌙</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, color: '#a78bfa', lineHeight: 1.3 }}>
                {t('awaySummary.title')}
              </div>
              <div style={{ lineHeight: 1.5 }}>{summaryText}</div>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 20px' }}>
        <span style={{
          background: 'rgba(244, 71, 71, 0.08)', borderRadius: 6,
          padding: '4px 12px', fontSize: 12, color: 'rgba(255,255,255,0.45)',
        }}>
          {content}
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

  // Hover timestamp (Iteration 461, 499): formatBriefTimestamp from sourcemap — same-day HH:mm, week "Sunday 4:15 PM", older "Sun, Feb 20, 4:30 PM"
  const msgTimestamp = (message as StandardChatMessage).timestamp
  const hoverTimestampLabel = msgTimestamp ? formatBriefTimestamp(msgTimestamp) : null

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
        background: hovered ? 'rgba(255,255,255,0.01)' : undefined,
      }}
      aria-label={isUser ? `You said: ${((message as StandardChatMessage).content || '').slice(0, 100)}` : `Claude said: ${((message as StandardChatMessage).content || '').slice(0, 100)}`}
    >
      {/* Avatar or spacer */}
      {showAvatar ? (
        <div
          style={{
            width: avatarSize, height: avatarSize,
            borderRadius: '50%',
            background: isUser ? 'rgba(99,102,241,0.25)' : (isAssistant && activePersona ? `${activePersona.color}30` : 'rgba(255,255,255,0.08)'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2,
          }}
        >
          {isUser
            ? <User size={iconSize} color="#818cf8" />
            : isAssistant && activePersona
            ? <span style={{ fontSize: avatarSize * 0.55, lineHeight: 1 }}>{activePersona.emoji}</span>
            : <Bot size={iconSize} color="rgba(255,255,255,0.60)" />
          }
        </div>
      ) : (
        <div style={{ width: avatarSize, flexShrink: 0 }} />
      )}

      {/* Bubble wrapper + hover actions */}
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 'min(85%, 720px)', minWidth: 60, position: 'relative' }}>
        {/* Hover timestamp (Iteration 461) — visible on hover, fade in/out */}
        {hoverTimestampLabel && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              [isUser ? 'right' : 'left']: 'calc(100% + 8px)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.38)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.15s ease',
              userSelect: 'none',
              fontVariantNumeric: 'tabular-nums',
            }}
            aria-hidden="true"
          >
            {hoverTimestampLabel}
          </div>
        )}
        {/* Bubble */}
        <div
          ref={bubbleRef}
          style={{
            background: isUser ? 'rgba(99,102,241,0.12)' : 'transparent',
            borderRadius: isUser ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
            padding: compact ? '8px 12px' : '10px 14px',
            color: 'rgba(255,255,255,0.82)',
            lineHeight: isUser ? 1.5 : 1.6,
            border: copyFlash
              ? '1px solid rgba(34,197,94,0.4)'
              : isUser ? '1px solid rgba(99,102,241,0.20)' : '1px solid transparent',
            wordBreak: 'break-word',
            position: 'relative',
            boxShadow: isUser
              ? (hovered ? '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.3)')
              : 'none',
            transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
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
              <Bookmark size={14} style={{ color: '#818cf8', fill: '#818cf8' }} />
            </div>
          )}

          {/* Pin indicator */}
          {!isPermission && !isPlan && (message as StandardChatMessage).pinned && (
            <div style={{
              position: 'absolute', top: -6,
              right: isUser ? (((message as StandardChatMessage).bookmarked) ? undefined : -6) : undefined,
              left: isUser ? undefined : (((message as StandardChatMessage).bookmarked) ? 6 : -6),
            }}>
              <Pin size={12} style={{ color: 'rgba(255,255,255,0.38)', fill: 'rgba(255,255,255,0.38)', transform: 'rotate(-45deg)' }} />
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
            showTimestamp={showTimestamp}
            onImageClick={(src, alt) => setLightboxImage({ src, alt })}
            onCollapse={onCollapse}
            onEdit={onEdit}
            onTimestampClick={handleTimestampClick}
          />
        </div>

        {/* Annotation display / editor (extracted component, Iteration 451) */}
        {!isPermission && !isPlan && (
          <AnnotationEditor
            messageId={message.id}
            currentAnnotation={(message as StandardChatMessage).annotation}
            isUser={isUser}
            editorOpen={showAnnotationEditor}
            onEditorOpenChange={setShowAnnotationEditor}
          />
        )}

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
            onShare={handleShare}
            onPin={handlePin}
            onTranslate={handleTranslate}
            onSaveAsNote={handleSaveAsNote}
            onRememberThis={handleRememberThis}
            onReadAloud={isAssistant ? handleReadAloud : undefined}
            isSpeaking={isSpeaking}
            hasOnEdit={!!onEdit}
            onAnnotate={handleAnnotateToggle}
            hasAnnotation={!!(message as StandardChatMessage).annotation}
            onRate={onRate ? (rating) => onRate(message.id, rating) : undefined}
            onRewind={isAssistant && onRewind && (message as StandardChatMessage).timestamp
              ? () => onRewind((message as StandardChatMessage).timestamp)
              : undefined
            }
            isLastMessage={isLastMessage}
            onCopyMarkdown={isAssistant ? handleCopyMarkdown : undefined}
            onCopyCodeBlocks={isAssistant && (message as StandardChatMessage).content?.includes('```') ? handleCopyCodeBlocks : undefined}
            hasCodeBlocks={!!(message as StandardChatMessage).content?.includes('```')}
            onFork={!isPermission && !isPlan && onFork ? onFork : undefined}
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
          onCopyCodeBlocks={isAssistant && (message as StandardChatMessage).content?.includes('```') ? handleCopyCodeBlocks : undefined}
          onSaveAsNote={isAssistant && (message as StandardChatMessage).content ? handleSaveAsNote : undefined}
          onRememberThis={isAssistant && (message as StandardChatMessage).content ? handleRememberThis : undefined}
          onQuoteReply={!isPermission && !isPlan && (message as StandardChatMessage).content ? handleQuote : undefined}
          onEditMessage={isUser && onEdit && !globalIsStreaming ? handleStartEdit : undefined}
          onRate={onRate ? (rating) => onRate(message.id, rating) : undefined}
          onBookmark={onBookmark ? () => onBookmark(message.id) : undefined}
          onPin={handlePin}
          onAnnotate={handleAnnotateToggle}
          hasAnnotation={!!(message as StandardChatMessage).annotation}
          onCollapse={onCollapse ? () => onCollapse(message.id) : undefined}
          onRewind={isAssistant && onRewind && (message as StandardChatMessage).timestamp
            ? () => onRewind((message as StandardChatMessage).timestamp)
            : undefined
          }
          onFork={onFork}
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
  if (pm.pinned !== nm.pinned) return false
  if (pm.collapsed !== nm.collapsed) return false
  if (pm.annotation !== nm.annotation) return false
  if (pm.thinking !== nm.thinking) return false
  if (JSON.stringify(pm.reactions) !== JSON.stringify(nm.reactions)) return false
  if ((pm.toolUses?.length ?? 0) !== (nm.toolUses?.length ?? 0)) return false
  if (prevProps.searchQuery !== nextProps.searchQuery) return false
  if (prevProps.searchCaseSensitive !== nextProps.searchCaseSensitive) return false
  if (prevProps.showAvatar !== nextProps.showAvatar) return false
  if (prevProps.showTimestamp !== nextProps.showTimestamp) return false
  return true
})
