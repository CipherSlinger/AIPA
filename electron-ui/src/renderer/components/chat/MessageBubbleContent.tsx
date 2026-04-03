import React, { useState, useEffect, useRef, useMemo } from 'react'
import { StandardChatMessage } from '../../types/app.types'
import MessageContent from './MessageContent'
import ToolUseBlock from './ToolUseBlock'
import ToolBatchBlock from './ToolBatchBlock'
import { groupToolUses } from '../../utils/toolSummary'
import { ChevronDown, ChevronRight, ChevronUp, Check, CheckCheck, Clock, Timer, Type } from 'lucide-react'
import { useT } from '../../i18n'
import { getShowAbsoluteTime, formatAbsoluteTime, relativeTime, formatResponseDuration } from './messageUtils'

interface MessageBubbleContentProps {
  message: StandardChatMessage
  isUser: boolean
  isAssistant: boolean
  isPermission: boolean
  isCollapsed: boolean
  compact: boolean
  searchQuery?: string
  searchCaseSensitive?: boolean
  msgStatus: 'sending' | 'sent' | 'read' | null
  // Editing state (controlled by parent)
  isEditing: boolean
  editContent: string
  onEditContentChange: (v: string) => void
  onEditSubmit: () => void
  onEditCancel: () => void
  editTextareaRef: React.RefObject<HTMLTextAreaElement>
  // Raw markdown (controlled by parent)
  showRawMarkdown: boolean
  // Timestamp grouping (Iteration 409)
  showTimestamp?: boolean
  // Image lightbox
  onImageClick: (src: string, alt: string) => void
  // Callbacks
  onCollapse?: (id: string) => void
  onEdit?: (id: string, content: string) => void
  onTimestampClick: () => void
}

export default function MessageBubbleContent({
  message, isUser, isAssistant, isPermission, isCollapsed, compact,
  searchQuery, searchCaseSensitive, msgStatus,
  isEditing, editContent, onEditContentChange, onEditSubmit, onEditCancel, editTextareaRef,
  showRawMarkdown, showTimestamp = true, onImageClick,
  onCollapse, onEdit, onTimestampClick,
}: MessageBubbleContentProps) {
  const t = useT()
  const thinking = message.thinking
  const isMessageStreaming = message.isStreaming
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  // Auto-collapse long messages (> 2000 chars) — user can expand/collapse individually
  const LONG_MESSAGE_THRESHOLD = 2000
  const LONG_MESSAGE_PREVIEW = 500
  const contentLength = (message.content || '').length
  const isLongMessage = contentLength > LONG_MESSAGE_THRESHOLD && !isMessageStreaming
  const [longMessageExpanded, setLongMessageExpanded] = useState(false)

  // Auto-expand thinking block while streaming, auto-collapse when done
  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (isMessageStreaming && thinking && !prevStreamingRef.current) {
      setThinkingExpanded(true)
    } else if (!isMessageStreaming && prevStreamingRef.current && thinking) {
      setThinkingExpanded(false)
    }
    prevStreamingRef.current = !!isMessageStreaming
  }, [isMessageStreaming, thinking])

  return (
    <>
      {/* Collapse toggle row */}
      {onCollapse && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: isCollapsed ? 0 : 4 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onCollapse(message.id) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: isUser ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', padding: 0,
            }}
            title={isCollapsed ? t('message.expand') : t('message.collapse')}
          >
            {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
          </button>
          {isCollapsed && (
            <span style={{ fontSize: 11, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {(message.content || '').slice(0, 100).replace(/\n/g, ' ')}
            </span>
          )}
          {message.isStreaming && (
            <span style={{ color: 'var(--success)', fontSize: 11 }}>{t('message.processing')}</span>
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
                {isMessageStreaming && thinking ? t('message.thinking') + '...' : t('message.thinking')}
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
          {isUser && message.attachments?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {message.attachments!.map((att, i) => (
                <img
                  key={i}
                  src={att.dataUrl}
                  alt={att.name}
                  title={att.name}
                  style={{
                    maxWidth: 200, maxHeight: 150,
                    borderRadius: 6, border: 'none', objectFit: 'cover', cursor: 'pointer',
                  }}
                  onClick={() => onImageClick(att.dataUrl, att.name)}
                />
              ))}
            </div>
          ) : null}

          {/* Tool uses (inside AI bubble) -- with batch grouping */}
          {!isPermission && message.toolUses && message.toolUses.length > 0 && (() => {
            const groups = groupToolUses(message.toolUses, t)
            return (
              <div style={{ borderTop: '1px solid var(--bubble-ai-border)', marginTop: 8, paddingTop: 8 }}>
                {groups.map((group, idx) => (
                  group.type === 'batch' ? (
                    <ToolBatchBlock key={`batch-${idx}`} group={group} />
                  ) : (
                    <div key={group.tools[0].id} style={{ background: 'rgba(0, 0, 0, 0.15)', borderRadius: 6, marginBottom: 4 }}>
                      <ToolUseBlock tool={group.tools[0]} />
                    </div>
                  )
                ))}
              </div>
            )
          })()}

          {/* Text content */}
          {isEditing && isUser ? (
            <div style={{ width: '100%' }}>
              <textarea
                ref={editTextareaRef}
                value={editContent}
                onChange={(e) => onEditContentChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onEditSubmit()
                  }
                  if (e.key === 'Escape') onEditCancel()
                }}
                style={{
                  width: '100%', minHeight: 60, padding: '8px 10px',
                  background: 'rgba(0,0,0,0.15)', border: '1px solid var(--accent)',
                  borderRadius: 6, color: 'inherit', fontSize: 14,
                  lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={onEditCancel}
                  style={{
                    background: 'transparent', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '4px 12px',
                    color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                    transition: 'background 150ms ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {t('message.editCancel')}
                </button>
                <button
                  onClick={onEditSubmit}
                  disabled={!editContent.trim()}
                  style={{
                    background: 'var(--accent)', border: 'none',
                    borderRadius: 6, padding: '4px 12px',
                    color: '#fff', fontSize: 12, fontWeight: 500,
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
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  fontSize: 12, lineHeight: 1.6,
                  color: 'var(--bubble-ai-text)',
                  background: 'rgba(0,0,0,0.1)',
                  border: '1px solid var(--bubble-ai-border)',
                  borderRadius: 4, padding: '8px 12px', margin: 0,
                  fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                }}>
                  {message.content}
                </pre>
              ) : isLongMessage && !longMessageExpanded ? (
                /* Auto-collapsed long message: show truncated preview */
                <div style={{ position: 'relative' }}>
                  <div style={{ overflow: 'hidden', maxHeight: 200 }}>
                    <MessageContent
                      content={message.content.slice(0, LONG_MESSAGE_PREVIEW) + '...'}
                      isUser={isUser}
                      searchQuery={searchQuery}
                      searchCaseSensitive={searchCaseSensitive}
                    />
                  </div>
                  {/* Gradient fade overlay */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 40,
                    background: isUser
                      ? 'linear-gradient(transparent, var(--bubble-user-bg, #2563eb))'
                      : 'linear-gradient(transparent, var(--bubble-ai-bg, #2d2d2d))',
                    pointerEvents: 'none',
                  }} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setLongMessageExpanded(true) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      width: '100%',
                      padding: '6px 0',
                      background: 'none',
                      border: 'none',
                      borderTop: '1px solid var(--border)',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 500,
                      marginTop: 4,
                    }}
                  >
                    <ChevronDown size={12} />
                    {t('message.showFullMessage', { chars: String(contentLength) })}
                  </button>
                </div>
              ) : (
                <div>
                  <MessageContent content={message.content} isUser={isUser} searchQuery={searchQuery} searchCaseSensitive={searchCaseSensitive} />
                  {/* Show "Show less" button for expanded long messages */}
                  {isLongMessage && longMessageExpanded && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setLongMessageExpanded(false) }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        width: '100%',
                        padding: '6px 0',
                        background: 'none',
                        border: 'none',
                        borderTop: '1px solid var(--border)',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 500,
                        marginTop: 4,
                      }}
                    >
                      <ChevronUp size={12} />
                      {t('message.showLess')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Timestamp inside bubble (grouped: hidden for consecutive same-role messages within 2 min) */}
          {showTimestamp && message.timestamp && (
            <div
              style={{
                fontSize: compact ? 10 : 11,
                color: isUser ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)',
                display: 'flex', justifyContent: 'flex-end',
                alignItems: 'center', gap: 4,
                marginTop: 6, lineHeight: 1,
                cursor: 'pointer', userSelect: 'none',
              }}
              title={getShowAbsoluteTime()
                ? relativeTime(message.timestamp, t)
                : new Date(message.timestamp).toLocaleString()}
              onClick={onTimestampClick}
            >
              {getShowAbsoluteTime()
                ? formatAbsoluteTime(message.timestamp, t)
                : relativeTime(message.timestamp, t)}
              {!isUser && message.responseDuration != null && message.responseDuration > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, opacity: 0.7 }} title={t('message.responseDuration', { time: formatResponseDuration(message.responseDuration!) })}>
                  <Timer size={9} />
                  {formatResponseDuration(message.responseDuration!)}
                </span>
              )}
              {message.content && message.content.length > 0 && !message.isStreaming && (() => {
                const words = message.content.trim().split(/\s+/).filter(w => w.length > 0).length
                const chars = message.content.length
                const estTokens = Math.round(chars / 4)
                return (
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 2, opacity: 0.5 }}
                    title={t('message.messageStats', { words: String(words), chars: String(chars), tokens: String(estTokens) })}
                  >
                    <Type size={8} />
                    {words}
                    <span style={{ opacity: 0.6, fontSize: 9 }}>({chars}c)</span>
                  </span>
                )
              })()}
              {msgStatus === 'sending' && <Clock size={10} style={{ opacity: 0.8 }} />}
              {msgStatus === 'sent' && <Check size={12} style={{ opacity: 0.9 }} />}
              {msgStatus === 'read' && <CheckCheck size={12} style={{ color: 'var(--accent)', opacity: 1 }} />}
            </div>
          )}

          {/* Streaming indicator */}
          {message.isStreaming && (
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
              <span style={{ fontSize: 11, color: 'var(--success)', marginLeft: 4 }}>{t('message.processing')}</span>
            </div>
          )}
        </>
      )}
    </>
  )
}
