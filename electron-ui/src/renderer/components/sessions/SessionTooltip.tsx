import React from 'react'
import { useT } from '../../i18n'
import { SessionListItem } from '../../types/app.types'
import { TAG_PRESETS, formatSessionDuration } from './sessionUtils'

interface SessionTooltipProps {
  session: SessionListItem
  pos: { top: number; left: number }
  sessionTags: Record<string, string[]>
  tagNames: string[]
}

export default function SessionTooltip({ session, pos, sessionTags, tagNames }: SessionTooltipProps) {
  const t = useT()
  const getTagName = (idx: number) => tagNames[idx] || t(TAG_PRESETS[idx]?.defaultKey || 'tags.work')

  return (
    <div
      style={{
        position: 'fixed',
        top: Math.min(pos.top, window.innerHeight - 200),
        left: pos.left,
        zIndex: 9999,
        background: 'var(--popup-bg)',
        border: '1px solid var(--popup-border)',
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: 'var(--popup-shadow)',
        maxWidth: 320,
        minWidth: 200,
        animation: 'popup-in 0.15s ease',
        pointerEvents: 'none' as const,
      }}
    >
      {/* Title */}
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: 6,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {session.title || session.lastPrompt || t('session.noContent')}
      </div>

      {/* Project path */}
      {session.project && (
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <span style={{ opacity: 0.7 }}>{t('session.tooltipProject')}:</span>
          <span>{session.project}</span>
        </div>
      )}

      {/* Last activity */}
      <div style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        marginBottom: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <span style={{ opacity: 0.7 }}>{t('session.tooltipLastActive')}:</span>
        <span>{new Date(session.timestamp).toLocaleString()}</span>
      </div>

      {/* Duration */}
      {(() => {
        const dur = formatSessionDuration(session.firstTimestamp, session.timestamp)
        if (!dur) return null
        return (
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <span style={{ opacity: 0.7 }}>{t('session.tooltipDuration')}:</span>
            <span>{dur}</span>
          </div>
        )
      })()}

      {/* Message count */}
      {session.messageCount != null && session.messageCount > 0 && (
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <span style={{ opacity: 0.7 }}>{t('session.tooltipMessages')}:</span>
          <span>{session.messageCount}</span>
        </div>
      )}

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
            marginBottom: 4,
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
                    background: `${preset.color}1a`,
                    border: `1px solid ${preset.color}40`,
                    borderRadius: 8,
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

      {/* Last prompt preview */}
      {session.lastPrompt && (
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          borderTop: '1px solid var(--border)',
          paddingTop: 6,
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
