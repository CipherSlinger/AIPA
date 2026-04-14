import React from 'react'
import { Check } from 'lucide-react'
import { useT } from '../../i18n'
import { TAG_PRESETS } from './sessionUtils'

interface TagPickerProps {
  sessionId: string
  pos: { top: number; left: number }
  sessionTags: Record<string, string[]>
  tagNames: string[]
  onToggle: (sessionId: string, tagId: string) => void
}

export default function TagPicker({ sessionId, pos, sessionTags, tagNames, onToggle }: TagPickerProps) {
  const t = useT()
  const getTagName = (idx: number) => tagNames[idx] || t(TAG_PRESETS[idx]?.defaultKey || 'tags.work')

  return (
    <div
      role="menu"
      className="popup-enter"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: Math.min(pos.top, window.innerHeight - 200),
        left: pos.left,
        zIndex: 10000,
        background: 'var(--glass-bg-high)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--glass-border)',
        borderRadius: 12,
        padding: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        width: 168,
      }}
    >
      {TAG_PRESETS.map((tag, idx) => {
        const assigned = (sessionTags[sessionId] || []).includes(tag.id)
        return (
          <button
            key={tag.id}
            role="menuitem"
            aria-checked={assigned}
            onClick={() => onToggle(sessionId, tag.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 10px',
              background: assigned
                ? 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(139,92,246,0.18))'
                : 'none',
              border: assigned
                ? '1px solid rgba(99,102,241,0.38)'
                : '1px solid transparent',
              borderRadius: 20,
              cursor: 'pointer',
              color: assigned ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 12,
              textAlign: 'left' as const,
              transition: 'all 0.15s ease',
              marginBottom: 2,
            }}
            onMouseEnter={(e) => {
              if (!assigned) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.borderColor = 'var(--glass-border-md)'
              }
            }}
            onMouseLeave={(e) => {
              if (!assigned) {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}
          >
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{getTagName(idx)}</span>
            {assigned && <Check size={12} style={{ color: '#a5b4fc', flexShrink: 0 }} />}
          </button>
        )
      })}
    </div>
  )
}
