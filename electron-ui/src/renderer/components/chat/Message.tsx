// Message — decomposed (Iteration 451: extracted useReadAloud, ReactionChips, AnnotationEditor)
// Iteration 453: copy flash feedback on bubble
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { ChatMessage, StandardChatMessage, Persona } from '../../types/app.types'
import MessageContextMenu from './MessageContextMenu'
import MessageActionToolbar from './MessageActionToolbar'
import MessageBubbleContent from './MessageBubbleContent'
import HistoryAskRow from './HistoryAskRow'
import SelectionToolbar from './SelectionToolbar'
import ImageLightbox from '../shared/ImageLightbox'
import ReactionChips from './ReactionChips'
import AnnotationEditor from './AnnotationEditor'
import { User, Bot, Bookmark, Pin, Webhook, RotateCcw } from 'lucide-react'
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
  /** Codex: branch the engine thread before this user message. */
  onBranch?: () => void
  /** Localized reason the branch action is visible but disabled (streaming). */
  branchBlockedReason?: string
  /**
   * Resend the prompt behind this turn-error row. Only provided for a row
   * that is the transcript's tail and whose prompt can be replayed.
   */
  onRetryTurn?: (errorMessageId: string) => void
  /** A turn is still running; the send path would refuse, so show it disabled. */
  retryDisabled?: boolean
  searchQuery?: string
  searchCaseSensitive?: boolean
  showAvatar?: boolean
  showTimestamp?: boolean
  isLastUserMsg?: boolean
  isLastMessage?: boolean
  hasAssistantReply?: boolean
}

export default React.memo(function Message({ message, onRate, onRewind, onBookmark, onCollapse, onEdit, onFork, onBranch, branchBlockedReason, onRetryTurn, retryDisabled = false, searchQuery, searchCaseSensitive, showAvatar = true, showTimestamp = true, isLastUserMsg = false, isLastMessage = false, hasAssistantReply = false }: Props) {
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
  // Guidance did not start a turn, so the "sending / read" status of a prompt
  // would describe the wrong thing. Its own guidance line states its fate.
  const msgStatus: 'sending' | 'sent' | 'read' | null = isUser && !(message as StandardChatMessage).guidance
    ? (globalIsStreaming && isLastUserMsg ? 'sending' : hasAssistantReply ? 'read' : 'sent')
    : null

  const [hovered, setHovered] = useState(false)
  // Keyboard counterpart of `hovered`: the action toolbar used to exist only
  // while the pointer was over the row, so a keyboard user could never reach
  // Copy/Bookmark/Edit. Focus anywhere inside the row keeps it mounted; the
  // relatedTarget check keeps it from flickering as focus moves between the
  // row's own controls.
  const [focusedWithin, setFocusedWithin] = useState(false)
  const handleRowFocus = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusedWithin(true)
  }, [])
  const handleRowBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusedWithin(false)
  }, [])
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
    handleCopyMarkdown, handleCopyRichText, handleSaveAsNote, handleRememberThis, handlePin, handleDoubleClick, handleTranslate, handleCopyCodeBlocks,
  } = useMessageActions({ message, isPermission, isPlan })

  // Copy flash effect: briefly highlight bubble border after copy (Iteration 453)
  const [copyFlash, setCopyFlash] = useState(false)
  const prevCopiedRef = useRef(false)
  const copyFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
        if (copyFlashTimerRef.current) clearTimeout(copyFlashTimerRef.current)
        copyFlashTimerRef.current = setTimeout(() => setCopyFlash(false), 350)
      }
    }
    window.addEventListener('aipa:messageCopiedByKeyboard', handler)
    return () => {
      window.removeEventListener('aipa:messageCopiedByKeyboard', handler)
      if (copyFlashTimerRef.current) clearTimeout(copyFlashTimerRef.current)
    }
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

  // PERF: stable identities so the React.memo'd MessageBubbleContent can bail out
  const handleEditCancel = useCallback(() => setIsEditing(false), [])
  const handleImageClick = useCallback((src: string, alt: string) => setLightboxImage({ src, alt }), [])

  const handleEditSubmit = useCallback(() => {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent.trim())
      setIsEditing(false)
    }
  }, [editContent, onEdit, message.id])

  // --- System message ---
  if (isSystem) {
    const content = (message as StandardChatMessage).content || ''
    // An answer retrieved from past conversations. It is not model output, not
    // part of this conversation's context, and not saved with the transcript;
    // the row states all three rather than borrowing the assistant bubble.
    const historyAsk = (message as StandardChatMessage).historyAsk
    if (historyAsk) {
      return <HistoryAskRow messageId={message.id} notice={historyAsk} />
    }
    // Hook notice. A blocked turn ends with no assistant answer at all, so this
    // row is the only place the user learns that a hook — not the model —
    // stopped it. The hook's own event name, source file and feedback text are
    // shown verbatim; the surrounding sentences only explain the provenance.
    const hookNotice = (message as StandardChatMessage).hookNotice
    if (hookNotice) {
      const blocked = hookNotice.kind === 'blocked'
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 20px' }}>
          <div style={{
            maxWidth: 640,
            width: '100%',
            background: blocked ? 'rgba(251,191,36,0.07)' : 'var(--glass-shimmer)',
            border: `1px solid ${blocked ? 'rgba(251,191,36,0.28)' : 'var(--glass-border)'}`,
            borderRadius: 10,
            padding: '10px 14px',
            boxShadow: 'var(--code-shadow)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Webhook
                size={13}
                color={blocked ? 'var(--warning-text)' : 'var(--text-muted)'}
                style={{ flexShrink: 0 }}
              />
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: blocked ? 'var(--warning-text)' : 'var(--text-secondary)',
              }}>
                {t(blocked ? 'chat.hook.blockedTitle' : 'chat.hook.failedTitle')}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase',
                background: 'rgba(251,191,36,0.12)',
                color: 'var(--warning-text)',
                border: '1px solid rgba(251,191,36,0.25)',
                borderRadius: 4, padding: '1px 5px',
              }}>
                {t('chat.hook.badge')}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.55 }}>
              {t(blocked ? 'chat.hook.blockedBody' : 'chat.hook.failedBody')}
            </div>
            <div style={{
              marginTop: 5, fontSize: 10, color: 'var(--text-faint)',
              fontFamily: 'monospace', wordBreak: 'break-all',
            }}>
              {hookNotice.sourceName
                ? t('chat.hook.hookLine', {
                    event: hookNotice.eventName,
                    source: hookNotice.sourceName,
                  })
                : hookNotice.eventName}
            </div>
            {hookNotice.text && (
              <pre style={{
                margin: '6px 0 0', padding: '7px 9px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)', borderRadius: 6,
                fontSize: 11, color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontFamily: 'monospace', lineHeight: 1.5,
              }}>
                {hookNotice.text}
              </pre>
            )}
            {hookNotice.truncated && (
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
                {t('chat.hook.truncated')}
              </div>
            )}
          </div>
        </div>
      )
    }
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
            color: 'var(--text-muted)',
            maxWidth: 480,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            boxShadow: 'var(--code-shadow)',
          }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>🌙</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, color: 'var(--violet-text)', lineHeight: 1.3 }}>
                {t('awaySummary.title')}
              </div>
              <div style={{ lineHeight: 1.5 }}>{summaryText}</div>
            </div>
          </div>
        </div>
      )
    }
    // A turn-level engine failure offers to resend the prompt that produced
    // it, right where the user is already reading the error. The original user
    // row stays untouched; the retry is a new turn whose answer lands below.
    // The offer is deliberately a native button: Tab reaches it and
    // Enter/Space activate it, with the app-wide `:focus-visible` ring.
    const offerRetry = (message as StandardChatMessage).turnError === true
      && isLastMessage
      && !!onRetryTurn
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: offerRetry ? 6 : 0, padding: '4px 20px',
      }}>
        <span style={{
          background: 'rgba(244, 71, 71, 0.08)', borderRadius: 6,
          padding: '4px 12px', fontSize: 12, color: 'var(--text-muted)',
        }}>
          {content}
        </span>
        {offerRetry && (
          <button
            type="button"
            data-turn-error-retry=""
            onClick={() => onRetryTurn?.(message.id)}
            disabled={retryDisabled}
            title={retryDisabled
              ? t('chat.turnError.retryBlocked')
              : t('chat.turnError.retryHint')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 12px',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--accent-text)',
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.4,
              cursor: retryDisabled ? 'not-allowed' : 'pointer',
              opacity: retryDisabled ? 0.55 : 1,
              // The app-wide reduced-motion rule collapses this to 0.001ms.
              transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (retryDisabled) return
              e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)'
              e.currentTarget.style.color = 'var(--accent-text-strong)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--accent-text)'
            }}
          >
            <RotateCcw size={12} aria-hidden="true" />
            <span>{t('chat.turnError.retry')}</span>
          </button>
        )}
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
      onFocus={handleRowFocus}
      onBlur={handleRowBlur}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      className="chat-message-row"
      data-user={isUser ? 'true' : 'false'}
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingTop: compact ? 6 : 8,
        paddingBottom: compact ? 6 : 8,
        maxWidth: '100%',
        position: 'relative',
        background: hovered ? 'var(--glass-shimmer)' : undefined,
      }}
      aria-label={isUser ? `You said: ${((message as StandardChatMessage).content || '').slice(0, 100)}` : `Claude said: ${((message as StandardChatMessage).content || '').slice(0, 100)}`}
    >
      {/* Avatar or spacer */}
      {showAvatar ? (
        <div
          className="chat-message-avatar"
          style={{
            width: avatarSize, height: avatarSize,
            borderRadius: '50%',
            background: isUser ? 'var(--accent-bg)' : (isAssistant && activePersona ? `${activePersona.color}30` : 'var(--bg-input)'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2,
          }}
        >
          {isUser
            ? <User size={iconSize} color="var(--accent-text)" />
            : isAssistant && activePersona
            ? <span style={{ fontSize: avatarSize * 0.55, lineHeight: 1 }}>{activePersona.emoji}</span>
            : <Bot size={iconSize} color="var(--text-secondary)" />
          }
        </div>
      ) : (
        <div className="chat-message-avatar" style={{ width: avatarSize, flexShrink: 0 }} />
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
              color: 'var(--text-faint)',
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
            // Tinted through tokens so the light theme gets its blue and the
            // dark theme its indigo instead of a dark-only literal.
            background: isUser ? 'var(--accent-bg)' : 'transparent',
            borderRadius: isUser ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
            // Assistant text starts flush with the column edge (the 1px
            // transparent border below is the only offset); user bubbles keep
            // their own inset so the bubble shape reads correctly.
            padding: compact ? (isUser ? '8px 12px' : '8px 0') : (isUser ? '10px 14px' : '10px 0'),
            color: 'var(--text-primary)',
            lineHeight: isUser ? 1.5 : 1.6,
            // A transparent 1px border stays present on assistant rows so the
            // copy-flash border does not shift the text by a pixel.
            border: copyFlash
              ? '1px solid rgba(34,197,94,0.4)'
              : isUser ? '1px solid var(--accent-border)' : '1px solid transparent',
            wordBreak: 'break-word',
            position: 'relative',
            // Resting lift now follows the theme (the light theme gets the
            // soft 0.10 shadow instead of the dark 0.30 halo); hover steps up
            // to the same elevation the sidebar's raised rows use.
            boxShadow: isUser
              ? (hovered ? 'var(--glass-shadow)' : 'var(--code-shadow)')
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
              <Bookmark size={14} style={{ color: 'var(--accent-muted)', fill: 'var(--accent-muted)' }} />
            </div>
          )}

          {/* Pin indicator */}
          {!isPermission && !isPlan && (message as StandardChatMessage).pinned && (
            <div style={{
              position: 'absolute', top: -6,
              right: isUser ? (((message as StandardChatMessage).bookmarked) ? undefined : -6) : undefined,
              left: isUser ? undefined : (((message as StandardChatMessage).bookmarked) ? 6 : -6),
            }}>
              <Pin size={12} style={{ color: 'var(--text-faint)', fill: 'var(--text-faint)', transform: 'rotate(-45deg)' }} />
            </div>
          )}

          <MessageBubbleContent
            message={message as StandardChatMessage}
            isUser={isUser}
            isAssistant={isAssistant}
            isPermission={isPermission}
            isCollapsed={!!isCollapsed}
            searchQuery={searchQuery}
            searchCaseSensitive={searchCaseSensitive}
            msgStatus={msgStatus}
            isEditing={isEditing}
            editContent={editContent}
            onEditContentChange={setEditContent}
            onEditSubmit={handleEditSubmit}
            onEditCancel={handleEditCancel}
            editTextareaRef={editTextareaRef as React.RefObject<HTMLTextAreaElement>}
            showRawMarkdown={showRawMarkdown}
            showTimestamp={showTimestamp}
            onImageClick={handleImageClick}
            onCollapse={onCollapse}
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

        {/* Floating action toolbar — pointer hover or keyboard focus inside
            the row, so the actions are reachable without a mouse. */}
        {(hovered || focusedWithin) && !isCollapsed && (
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
            onPin={handlePin}
            onTranslate={handleTranslate}
            onSaveAsNote={handleSaveAsNote}
            onRememberThis={handleRememberThis}
            onReadAloud={isAssistant ? handleReadAloud : undefined}
            isSpeaking={isSpeaking}
            hasOnEdit={
              // Guidance was already delivered (or not) into a turn; editing
              // the local row afterwards would not reach that turn.
              !!onEdit && !(message as StandardChatMessage).guidance
            }
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
            onBranch={!isPermission && !isPlan ? onBranch : undefined}
            branchBlockedReason={!isPermission && !isPlan ? branchBlockedReason : undefined}
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
  // A guidance row's state changes in place (sending -> sent/failed); the
  // label is the whole point of the row, so it must not be memoized away.
  if (pm.guidance?.state !== nm.guidance?.state) return false
  if (pm.guidance?.error !== nm.guidance?.error) return false
  // Retry is offered while the failure is the tail; clearing that marker or
  // streaming the next turn changes only these props.
  if (pm.turnError !== nm.turnError) return false
  if (prevProps.retryDisabled !== nextProps.retryDisabled) return false
  if (!!prevProps.onRetryTurn !== !!nextProps.onRetryTurn) return false
  if (JSON.stringify(pm.reactions) !== JSON.stringify(nm.reactions)) return false
  if ((pm.toolUses?.length ?? 0) !== (nm.toolUses?.length ?? 0)) return false
  if (prevProps.searchQuery !== nextProps.searchQuery) return false
  if (prevProps.searchCaseSensitive !== nextProps.searchCaseSensitive) return false
  if (prevProps.showAvatar !== nextProps.showAvatar) return false
  if (prevProps.showTimestamp !== nextProps.showTimestamp) return false
  // These flags change when neighbouring messages are added/removed — the
  // message object itself stays identical, so they must be compared here.
  if (prevProps.isLastMessage !== nextProps.isLastMessage) return false
  if (prevProps.isLastUserMsg !== nextProps.isLastUserMsg) return false
  if (prevProps.hasAssistantReply !== nextProps.hasAssistantReply) return false
  // The branch action appears/disappears as the turn id arrives and as the
  // turn starts/ends; the toolbar must re-render with that state.
  if (!!prevProps.onBranch !== !!nextProps.onBranch) return false
  if (prevProps.branchBlockedReason !== nextProps.branchBlockedReason) return false
  return true
})
