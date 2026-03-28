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
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: Math.min(pos.top, window.innerHeight - 200),
        left: pos.left,
        zIndex: 10000,
        background: 'var(--popup-bg)',
        border: '1px solid var(--popup-border)',
        borderRadius: 8,
        padding: 4,
        boxShadow: 'var(--popup-shadow)',
        width: 160,
        animation: 'popup-in 0.15s ease',
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
              padding: '6px 8px',
              background: 'none',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              color: 'var(--text-primary)',
              fontSize: 12,
              textAlign: 'left' as const,
              transition: 'background 0.1s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--popup-item-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{getTagName(idx)}</span>
            {assigned && <Check size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
          </button>
        )
      })}
    </div>
  )
}
