import React, { useState, useCallback, useEffect, useRef } from 'react'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import MessageContent from './MessageContent'
import ToolUseBlock from './ToolUseBlock'
import MessageContextMenu from './MessageContextMenu'
import SelectionToolbar from './SelectionToolbar'
import ImageLightbox from '../shared/ImageLightbox'
import { User, Bot, Copy, ChevronDown, ChevronRight, Bookmark, AlertTriangle, Code2, Check, CheckCheck, Clock, MessageSquareQuote, Pencil, Timer } from 'lucide-react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { Note } from '../../types/app.types'

function formatResponseDuration(ms: number): string {
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remainSecs = secs % 60
  return remainSecs > 0 ? `${mins}m ${remainSecs}s` : `${mins}m`
}

function relativeTime(ts: number, t: (key: string, params?: Record<string, string>) => string): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 5) return t('message.justNow')
  if (diff < 60) return t('message.secsAgo', { count: String(diff) })
  const mins = Math.floor(diff / 60)
  if (mins < 60) return t('message.minsAgo', { count: String(mins) })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('message.hoursAgo', { count: String(hrs) })
  const days = Math.floor(hrs / 24)
  if (days === 1) return t('session.yesterday')
  return t('message.daysAgo', { count: String(days) })
}

interface Props {
  message: ChatMessage
  onRate?: (msgId: string, rating: 'up' | 'down' | null) => void
  onRewind?: (msgTimestamp: number) => void
  onBookmark?: (msgId: string) => void
  onCollapse?: (msgId: string) => void
  onEdit?: (msgId: string, newContent: string) => void
  searchQuery?: string
  showAvatar?: boolean
  /** Pre-computed: is this the last user message in the list? (passed from MessageList to avoid per-message Zustand scans) */
  isLastUserMsg?: boolean
  /** Pre-computed: does an assistant reply exist after this message? (passed from MessageList to avoid per-message Zustand scans) */
  hasAssistantReply?: boolean
}

export default React.memo(function Message({ message, onRate, onRewind, onBookmark, onCollapse, onEdit, searchQuery, showAvatar = true, isLastUserMsg = false, hasAssistantReply = false }: Props) {
  const t = useT()
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const isSystem = message.role === 'system' || (isAssistant && (message as StandardChatMessage).content?.startsWith('\u26a0\ufe0f'))
  const isPermission = message.role === 'permission'
  const isPlan = message.role === 'plan'
  const isCollapsed = !isPermission && !isPlan && (message as StandardChatMessage).collapsed
  const compact = usePrefsStore(s => s.prefs.compactMode)
  // Message status indicator: "sending" (clock), "sent" (check), or "read" (double check) for user messages
  const globalIsStreaming = useChatStore(s => s.isStreaming)
  const toggleBookmarkStore = useChatStore(s => s.toggleBookmark)
  const setQuotedText = useUiStore(s => s.setQuotedText)
  const msgStatus: 'sending' | 'sent' | 'read' | null = isUser
    ? (globalIsStreaming && isLastUserMsg ? 'sending' : hasAssistantReply ? 'read' : 'sent')
    : null
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [, setTick] = useState(0)
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null)

  // Editing state (user messages only)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const editTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  const thinking = message.role !== 'permission' ? (message as StandardChatMessage).thinking : undefined
  const isMessageStreaming = (message as StandardChatMessage).isStreaming

  // Auto-expand thinking block while streaming, auto-collapse when done
  const prevStreamingRef = React.useRef(false)
  useEffect(() => {
    if (isMessageStreaming && thinking && !prevStreamingRef.current) {
      // Started streaming with thinking content — auto-expand
      setThinkingExpanded(true)
    } else if (!isMessageStreaming && prevStreamingRef.current && thinking) {
      // Streaming just ended — auto-collapse thinking
      setThinkingExpanded(false)
    }
    prevStreamingRef.current = !!isMessageStreaming
  }, [isMessageStreaming, thinking])

  // Compute word and approx token count for assistant messages
  const wordInfo = isAssistant && (message as StandardChatMessage).content
    ? (() => {
        const text = (message as StandardChatMessage).content
        const words = text.split(/\s+/).filter(w => w.length > 0).length
        const tokens = Math.round(words / 0.75)
        return `${words} words (~${tokens} tokens)`
      })()
    : null

  // Live-update relative timestamp every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const handleCopy = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message])

  const handleQuote = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    setQuotedText(text)
  }, [message, setQuotedText])

  const handleBookmarkAction = useCallback(() => {
    if (onBookmark) {
      onBookmark(message.id)
    } else {
      toggleBookmarkStore(message.id)
    }
  }, [message.id, onBookmark, toggleBookmarkStore])

  const handleCopyMarkdown = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message])

  const addToast = useUiStore(s => s.addToast)
  const handleSaveAsNote = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text) return
    const MAX_NOTES = 100
    const currentNotes: Note[] = usePrefsStore.getState().prefs.notes || []
    if (currentNotes.length >= MAX_NOTES) {
      addToast({ type: 'error', message: t('message.notesLimitReached'), duration: 3000 })
      return
    }
    const now = Date.now()
    const title = text.slice(0, 50) + (text.length > 50 ? '...' : '')
    const newNote: Note = {
      id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      content: text,
      createdAt: now,
      updatedAt: now,
    }
    const updated = [newNote, ...currentNotes]
    usePrefsStore.getState().setPrefs({ notes: updated })
    window.electronAPI.prefsSet('notes', updated)
    addToast({ type: 'success', message: t('message.savedToNotes'), duration: 2000 })
  }, [message, addToast, t])

  const handleDoubleClick = useCallback(() => {
    const text = (message as StandardChatMessage).content
    if (!text || isPermission || isPlan) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message, isPermission, isPlan])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isPermission || isPlan) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [isPermission, isPlan])

  // --- System message ---
  if (isSystem) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '4px 20px',
        }}
      >
        <span
          style={{
            background: 'rgba(244, 71, 71, 0.08)',
            borderRadius: 4,
            padding: '4px 12px',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          {(message as StandardChatMessage).content}
        </span>
      </div>
    )
  }

  // --- Permission / Plan cards: centered, no bubble wrap ---
  if (isPermission || isPlan) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '8px 20px',
        }}
      >
        {/* Children will be rendered by MessageList via PermissionCard/PlanCard */}
      </div>
    )
  }

  // --- Avatar sizes ---
  const avatarSize = compact ? 28 : 36
  const iconSize = compact ? 14 : 18

  // --- Bubble layout (user or assistant) ---
  const bubblePadding = compact ? '8px 20px' : '8px 20px'

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
            width: avatarSize,
            height: avatarSize,
            borderRadius: '50%',
            background: isUser ? 'var(--avatar-user)' : 'var(--avatar-ai)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {isUser
            ? <User size={iconSize} color="#ffffff" />
            : <Bot size={iconSize} color="#ffffff" />
          }
        </div>
      ) : (
        // Spacer preserves alignment for consecutive same-role messages
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
          {/* Bookmark indicator (top-right outside corner) */}
          {!isPermission && !isPlan && (message as StandardChatMessage).bookmarked && (
            <div
              style={{
                position: 'absolute',
                top: -6,
                right: isUser ? undefined : -6,
                left: isUser ? -6 : undefined,
              }}
            >
              <Bookmark size={14} style={{ color: 'var(--warning)', fill: 'var(--warning)' }} />
            </div>
          )}

          {/* Collapse toggle row */}
          {onCollapse && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: isCollapsed ? 0 : 4 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onCollapse(message.id) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: isUser ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center',
                  padding: 0,
                }}
                title={isCollapsed ? 'Expand message' : 'Collapse message'}
              >
                {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              </button>
              {isCollapsed && (
                <span style={{ fontSize: 11, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {((message as StandardChatMessage).content || '').slice(0, 100).replace(/\n/g, ' ')}
                </span>
              )}
              {(message as StandardChatMessage).isStreaming && (
                <span style={{ color: 'var(--success)', fontSize: 11 }}>Generating...</span>
              )}
            </div>
          )}

          {!isCollapsed && (
            <>
              {/* Thinking block */}
              {thinking && (
                <div style={{ marginBottom: 8 }}>
                  <button
                    onClick={() => setThinkingExpanded(!thinkingExpanded)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: isUser ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)',
                      fontSize: 11, padding: 0, marginBottom: 4,
                    }}
                  >
                    {thinkingExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    {isMessageStreaming && thinking ? 'Thinking...' : 'Thinking'}
                  </button>
                  {thinkingExpanded && (
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid var(--bubble-ai-border)',
                      borderRadius: 4, padding: '8px 12px',
                      fontSize: 12, color: 'var(--text-muted)',
                      fontStyle: 'italic', lineHeight: 1.6,
                      whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto',
                    }}>
                      {thinking}
                    </div>
                  )}
                </div>
              )}

              {/* Image attachments (user messages) */}
              {isUser && (message as StandardChatMessage).attachments?.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {(message as StandardChatMessage).attachments!.map((att, i) => (
                    <img
                      key={i}
                      src={att.dataUrl}
                      alt={att.name}
                      title={att.name}
                      style={{
                        maxWidth: 200,
                        maxHeight: 150,
                        borderRadius: 6,
                        border: 'none',
                        objectFit: 'cover',
                        cursor: 'pointer',
                      }}
                      onClick={() => setLightboxImage({ src: att.dataUrl, alt: att.name })}
                    />
                  ))}
                </div>
              ) : null}

              {/* Tool uses (inside AI bubble) */}
              {!isPermission && (message as StandardChatMessage).toolUses && (message as StandardChatMessage).toolUses!.length > 0 && (
                <div style={{ borderTop: '1px solid var(--bubble-ai-border)', marginTop: 8, paddingTop: 8 }}>
                  {(message as StandardChatMessage).toolUses!.map((tool) => (
                    <div
                      key={tool.id}
                      style={{ background: 'rgba(0, 0, 0, 0.15)', borderRadius: 6, marginBottom: 4 }}
                    >
                      <ToolUseBlock tool={tool} />
                    </div>
                  ))}
                </div>
              )}

              {/* Text content */}
              {isEditing && isUser ? (
                <div style={{ width: '100%' }}>
                  <textarea
                    ref={editTextareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (editContent.trim() && onEdit) {
                          onEdit(message.id, editContent.trim())
                          setIsEditing(false)
                        }
                      }
                      if (e.key === 'Escape') {
                        setIsEditing(false)
                      }
                    }}
                    style={{
                      width: '100%',
                      minHeight: 60,
                      padding: '8px 10px',
                      background: 'rgba(0,0,0,0.15)',
                      border: '1px solid var(--accent)',
                      borderRadius: 6,
                      color: 'inherit',
                      fontSize: 14,
                      lineHeight: 1.6,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      outline: 'none',
                    }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setIsEditing(false)}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '4px 12px',
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        cursor: 'pointer',
                        transition: 'background 150ms ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {t('message.editCancel')}
                    </button>
                    <button
                      onClick={() => {
                        if (editContent.trim() && onEdit) {
                          onEdit(message.id, editContent.trim())
                          setIsEditing(false)
                        }
                      }}
                      disabled={!editContent.trim()}
                      style={{
                        background: 'var(--accent)',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 12px',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: editContent.trim() ? 'pointer' : 'not-allowed',
                        opacity: editContent.trim() ? 1 : 0.5,
                        transition: 'opacity 150ms ease',
                      }}
                    >
                      {t('message.editSave')}
                    </button>
                  </div>
                </div>
              ) : message.content && (
                <div>
                  {isAssistant && showRawMarkdown ? (
                    <pre style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: 'var(--bubble-ai-text)',
                      background: 'rgba(0,0,0,0.1)',
                      border: '1px solid var(--bubble-ai-border)',
                      borderRadius: 4,
                      padding: '8px 12px',
                      margin: 0,
                      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                    }}>
                      {message.content}
                    </pre>
                  ) : (
                    <MessageContent content={message.content} isUser={isUser} searchQuery={searchQuery} />
                  )}
                </div>
              )}

              {/* Timestamp inside bubble */}
              {(message as StandardChatMessage).timestamp && (
                <div
                  style={{
                    fontSize: compact ? 10 : 11,
                    color: isUser ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 6,
                    lineHeight: 1,
                  }}
                  title={new Date((message as StandardChatMessage).timestamp).toLocaleString()}
                >
                  {relativeTime((message as StandardChatMessage).timestamp, t)}
                  {!isUser && (message as StandardChatMessage).responseDuration != null && (message as StandardChatMessage).responseDuration! > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, opacity: 0.7 }} title={t('message.responseDuration', { time: formatResponseDuration((message as StandardChatMessage).responseDuration!) })}>
                      <Timer size={9} />
                      {formatResponseDuration((message as StandardChatMessage).responseDuration!)}
                    </span>
                  )}
                  {msgStatus === 'sending' && (
                    <Clock size={10} style={{ opacity: 0.8 }} />
                  )}
                  {msgStatus === 'sent' && (
                    <Check size={12} style={{ opacity: 0.9 }} />
                  )}
                  {msgStatus === 'read' && (
                    <CheckCheck size={12} style={{ color: 'var(--accent)', opacity: 1 }} />
                  )}
                </div>
              )}

              {/* Streaming indicator */}
              {(message as StandardChatMessage).isStreaming && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--success)',
                        animation: 'pulse 1.4s ease-in-out infinite',
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                  <span style={{ fontSize: 11, color: 'var(--success)', marginLeft: 4 }}>Generating...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Floating action toolbar — top-right corner of bubble, shown on hover */}
        {hovered && !isCollapsed && (
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
                onClick={(e) => { e.stopPropagation(); setShowRawMarkdown(!showRawMarkdown) }}
                title={showRawMarkdown ? 'Show rendered' : 'Show raw markdown'}
                style={{
                  background: showRawMarkdown ? 'var(--accent)' : 'transparent',
                  border: 'none',
                  borderRadius: 5,
                  padding: '3px 5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: showRawMarkdown ? '#fff' : 'var(--text-muted)',
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
                onMouseEnter={(e) => { if (!showRawMarkdown) (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                onMouseLeave={(e) => { if (!showRawMarkdown) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Code2 size={13} />
              </button>
            )}

            {/* Edit (user messages only) */}
            {isUser && onEdit && !globalIsStreaming && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditContent((message as StandardChatMessage).content || '')
                  setIsEditing(true)
                  setTimeout(() => editTextareaRef.current?.focus(), 50)
                }}
                title={t('message.editMessage')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 5,
                  padding: '3px 5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-muted)',
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Pencil size={13} />
              </button>
            )}

            {/* Copy */}
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy() }}
              title={copied ? 'Copied!' : 'Copy text'}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 5,
                padding: '3px 5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                color: copied ? 'var(--success)' : 'var(--text-muted)',
                fontSize: 11,
                transition: 'background 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => { if (!copied) (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              {copied ? (
                <>
                  <Check size={13} />
                  <span style={{ fontSize: 11, lineHeight: 1 }}>Copied!</span>
                </>
              ) : (
                <Copy size={13} />
              )}
            </button>

            {/* Bookmark */}
            {!isPermission && !isPlan && (
              <button
                onClick={(e) => { e.stopPropagation(); handleBookmarkAction() }}
                title={(message as StandardChatMessage).bookmarked ? 'Remove bookmark' : 'Bookmark'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 5,
                  padding: '3px 5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: (message as StandardChatMessage).bookmarked ? 'var(--warning)' : 'var(--text-muted)',
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Bookmark
                  size={13}
                  style={(message as StandardChatMessage).bookmarked ? { fill: 'var(--warning)' } : {}}
                />
              </button>
            )}

            {/* Quote reply */}
            {!isPermission && !isPlan && (message as StandardChatMessage).content && (
              <button
                onClick={(e) => { e.stopPropagation(); handleQuote() }}
                title={t('message.quoteReply')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 5,
                  padding: '3px 5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-muted)',
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <MessageSquareQuote size={13} />
              </button>
            )}
          </div>
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
          onSaveAsNote={isAssistant && (message as StandardChatMessage).content ? handleSaveAsNote : undefined}
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
  if (prevProps.showAvatar !== nextProps.showAvatar) return false
  return true
})
