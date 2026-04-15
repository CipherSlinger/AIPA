import React from 'react'
import { useT } from '../../i18n'
import { SessionListItem } from '../../types/app.types'
import { TAG_PRESETS, formatSessionDuration } from './sessionUtils'
import { formatDistanceToNow } from 'date-fns'

export interface PreviewMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

interface SessionTooltipProps {
  session: SessionListItem
  pos: { top: number; left: number }
  sessionTags: Record<string, string[]>
  tagNames: string[]
  previewMessages?: PreviewMessage[] | null
  previewLoading?: boolean
}

export default function SessionTooltip({ session, pos, sessionTags, tagNames, previewMessages, previewLoading }: SessionTooltipProps) {
  const t = useT()
  const getTagName = (idx: number) => tagNames[idx] || t(TAG_PRESETS[idx]?.defaultKey || 'tags.work')

  const hasPreview = previewMessages && previewMessages.length > 0

  return (
    <div
      className="popup-enter"
      style={{
        position: 'fixed',
        top: Math.min(pos.top, window.innerHeight - (hasPreview ? 400 : 200)),
        left: pos.left,
        zIndex: 9999,
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        maxWidth: 320,
        minWidth: 220,
        maxHeight: 400,
        pointerEvents: 'none' as const,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column' as const,
      }}
    >
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: hasPreview || previewLoading ? '1px solid var(--border)' : 'none' }}>
        {/* Title */}
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {session.title || session.lastPrompt || t('session.noContent')}
        </div>

        {/* Project + relative time */}
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginTop: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {session.project && <span style={{ opacity: 0.8 }}>{session.project}</span>}
          {session.project && <span style={{ opacity: 0.4 }}>|</span>}
          <span>{formatDistanceToNow(new Date(session.timestamp), { addSuffix: true })}</span>
          {session.messageCount != null && session.messageCount > 0 && (
            <>
              <span style={{ opacity: 0.4 }}>|</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{session.messageCount} msgs</span>
            </>
          )}
        </div>

        {/* Duration */}
        {(() => {
          const dur = formatSessionDuration(session.firstTimestamp, session.timestamp)
          if (!dur) return null
          return (
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 2,
            }}>
              {t('session.tooltipDuration')}: {dur}
            </div>
          )
        })()}

        {/* Tags */}
        {(() => {
          const tags = sessionTags[session.sessionId] || []
          if (tags.length === 0) return null
          return (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              marginTop: 6,
            }}>
              {tags.map(tagId => {
                const preset = TAG_PRESETS.find(p => p.id === tagId)
                if (!preset) return null
                const idx = TAG_PRESETS.indexOf(preset)
                return (
                  <span
                    key={tagId}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10,
                      color: preset.color,
                      background: 'var(--border)',
                      border: `1px solid ${preset.color}40`,
                      borderRadius: 10,
                      padding: '1px 6px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: preset.color, flexShrink: 0 }} />
                    {getTagName(idx)}
                  </span>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* Message Preview */}
      {previewLoading && !hasPreview && (
        <div style={{ padding: '12px 14px' }}>
          {[80, 60, 90, 50, 70].map((width, i) => (
            <div
              key={i}
              style={{
                height: 10,
                width: `${width}%`,
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 4,
                marginBottom: 8,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      )}

      {hasPreview && (
        <div style={{
          padding: '8px 12px',
          overflowY: 'auto',
          flex: 1,
        }}>
          {previewMessages.map((msg, i) => (
            <div key={i} style={{ marginBottom: i < previewMessages.length - 1 ? 6 : 0 }}>
              {/* Role + timestamp */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 2,
              }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: msg.role === 'user' ? '#818cf8' : 'var(--text-muted)',
                }}>
                  {msg.role === 'user' ? t('session.previewUser') : t('session.previewAI')}
                </span>
                {msg.timestamp && (
                  <span style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    fontVariantNumeric: 'tabular-nums',
                    fontFeatureSettings: '"tnum"',
                  }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              {/* Content */}
              <div style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
                wordBreak: 'break-word' as const,
              }}>
                {msg.content.slice(0, 200)}
              </div>
              {i < previewMessages.length - 1 && (
                <div style={{ margin: '6px 0', borderBottom: '1px solid rgba(128,128,128,0.1)' }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fallback: show last prompt if no preview messages */}
      {!hasPreview && !previewLoading && session.lastPrompt && (
        <div style={{
          padding: '8px 12px',
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
          wordBreak: 'break-word' as const,
        }}>
          {session.lastPrompt.slice(0, 200)}
          {session.lastPrompt.length > 200 ? '...' : ''}
        </div>
      )}
    </div>
  )
}
