import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { ChatMessage, StandardChatMessage, Persona } from '../../types/app.types'
import MessageContextMenu from './MessageContextMenu'
import MessageActionToolbar from './MessageActionToolbar'
import MessageBubbleContent from './MessageBubbleContent'
import SelectionToolbar from './SelectionToolbar'
import ImageLightbox from '../shared/ImageLightbox'
import { User, Bot, Bookmark, Pin, StickyNote, X } from 'lucide-react'
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
  // STABILITY (Iteration 308): Use activePersonaId + separate personas selector
  // to avoid creating a new object reference on every store change. The old
  // `personas.find()` inside a selector returned a new reference every render,
  // potentially contributing to unnecessary re-render cascades during streaming.
  const activePersonaId = usePrefsStore(s => s.prefs.activePersonaId)
  const personas = usePrefsStore(s => s.prefs.personas)
  const activePersona: Persona | undefined = useMemo(
    () => activePersonaId ? (personas || []).find(p => p.id === activePersonaId) : undefined,
    [activePersonaId, personas]
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

  // TTS state
  const [isSpeaking, setIsSpeaking] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Editing state (user messages only)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const editTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  // Annotation state
  const [showAnnotationEditor, setShowAnnotationEditor] = useState(false)
  const [annotationDraft, setAnnotationDraft] = useState('')
  const annotationRef = useRef<HTMLTextAreaElement>(null)

  // Extracted actions hook
  const {
    copied, handleCopy, handleQuote, handleBookmarkAction,
    handleCopyMarkdown, handleCopyRichText, handleSaveAsNote, handleRememberThis, handleShare, handlePin, handleDoubleClick, handleTranslate, handleCopyCodeBlocks,
  } = useMessageActions({ message, isPermission, isPlan })

  const setAnnotation = useChatStore(s => s.setAnnotation)

  const handleAnnotateToggle = useCallback(() => {
    if (showAnnotationEditor) {
      // Save and close
      setAnnotation(message.id, annotationDraft.trim())
      setShowAnnotationEditor(false)
    } else {
      // Open editor with current value
      setAnnotationDraft((message as StandardChatMessage).annotation || '')
      setShowAnnotationEditor(true)
      setTimeout(() => annotationRef.current?.focus(), 50)
    }
  }, [showAnnotationEditor, annotationDraft, message.id, message, setAnnotation])

  const handleAnnotationKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      setAnnotation(message.id, annotationDraft.trim())
      setShowAnnotationEditor(false)
    } else if (e.key === 'Escape') {
      setShowAnnotationEditor(false)
    }
  }, [annotationDraft, message.id, setAnnotation])

  const handleRemoveAnnotation = useCallback(() => {
    setAnnotation(message.id, '')
    setShowAnnotationEditor(false)
  }, [message.id, setAnnotation])

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

  // TTS: Read aloud handler
  const handleReadAloud = useCallback(() => {
    if (!('speechSynthesis' in window)) return

    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      utteranceRef.current = null
      return
    }

    const content = (message as StandardChatMessage).content
    if (!content) return

    // Strip markdown formatting for cleaner speech
    const plainText = content
      .replace(/```[\s\S]*?```/g, ' code block omitted ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, 'image: $1')
      .replace(/^[-*]\s/gm, '')
      .replace(/^\d+\.\s/gm, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim()

    if (!plainText) return

    const utterance = new SpeechSynthesisUtterance(plainText)
    utterance.rate = 1.0
    utterance.pitch = 1.0

    utterance.onend = () => {
      setIsSpeaking(false)
      utteranceRef.current = null
    }
    utterance.onerror = () => {
      setIsSpeaking(false)
      utteranceRef.current = null
    }

    utteranceRef.current = utterance
    setIsSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }, [message, isSpeaking])

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      if (utteranceRef.current) {
        window.speechSynthesis.cancel()
      }
    }
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

          {/* Pin indicator */}
          {!isPermission && !isPlan && (message as StandardChatMessage).pinned && (
            <div style={{
              position: 'absolute', top: -6,
              right: isUser ? (((message as StandardChatMessage).bookmarked) ? undefined : -6) : undefined,
              left: isUser ? undefined : (((message as StandardChatMessage).bookmarked) ? 6 : -6),
            }}>
              <Pin size={12} style={{ color: 'var(--accent)', fill: 'var(--accent)', transform: 'rotate(-45deg)' }} />
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

        {/* Annotation display / editor */}
        {!isPermission && !isPlan && ((message as StandardChatMessage).annotation || showAnnotationEditor) && (
          <div style={{
            marginTop: 4,
            ...(isUser ? { alignSelf: 'flex-end' } : {}),
          }}>
            {showAnnotationEditor ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: 'var(--popup-bg)',
                border: '1px solid var(--popup-border)',
                borderRadius: 6,
                padding: 6,
              }}>
                <textarea
                  ref={annotationRef}
                  value={annotationDraft}
                  onChange={(e) => setAnnotationDraft(e.target.value)}
                  onKeyDown={handleAnnotationKeyDown}
                  placeholder={t('message.annotationPlaceholder')}
                  maxLength={500}
                  style={{
                    width: '100%',
                    minWidth: 200,
                    minHeight: 40,
                    maxHeight: 100,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text)',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    padding: 4,
                  }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 'auto' }}>
                    {annotationDraft.length}/500
                  </span>
                  {(message as StandardChatMessage).annotation && (
                    <button
                      onClick={handleRemoveAnnotation}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--error, #e55)', fontSize: 11, padding: '2px 6px',
                        borderRadius: 3,
                      }}
                      title={t('message.removeAnnotation')}
                    >
                      {t('message.removeAnnotation')}
                    </button>
                  )}
                  <button
                    onClick={() => setShowAnnotationEditor(false)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 11, padding: '2px 6px',
                      borderRadius: 3,
                    }}
                  >
                    {t('message.editCancel')}
                  </button>
                  <button
                    onClick={() => { setAnnotation(message.id, annotationDraft.trim()); setShowAnnotationEditor(false) }}
                    style={{
                      background: 'var(--accent)', border: 'none', cursor: 'pointer',
                      color: '#fff', fontSize: 11, padding: '2px 8px',
                      borderRadius: 3,
                    }}
                  >
                    {t('message.editSave').replace(' & Send', '')}
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => handleAnnotateToggle()}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 4,
                  padding: '3px 8px',
                  background: 'rgba(255, 193, 7, 0.08)',
                  border: '1px solid rgba(255, 193, 7, 0.2)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  maxWidth: '100%',
                  transition: 'background 0.12s ease',
                }}
                title={t('message.editAnnotation')}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255, 193, 7, 0.15)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255, 193, 7, 0.08)' }}
              >
                <StickyNote size={11} style={{ color: 'var(--warning, #ffc107)', marginTop: 2, flexShrink: 0 }} />
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}>
                  {(message as StandardChatMessage).annotation}
                </span>
              </div>
            )}
          </div>
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
  if (pm.pinned !== nm.pinned) return false
  if (pm.collapsed !== nm.collapsed) return false
  if (pm.annotation !== nm.annotation) return false
  if (pm.thinking !== nm.thinking) return false
  if ((pm.toolUses?.length ?? 0) !== (nm.toolUses?.length ?? 0)) return false
  if (prevProps.searchQuery !== nextProps.searchQuery) return false
  if (prevProps.searchCaseSensitive !== nextProps.searchCaseSensitive) return false
  if (prevProps.showAvatar !== nextProps.showAvatar) return false
  return true
})
