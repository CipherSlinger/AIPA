// PinnedNoteStrip — expandable strip below ChatHeader showing a pinned note (Iteration 439)
import React, { useState } from 'react'
import { StickyNote, X, ChevronDown, ChevronUp, Pin } from 'lucide-react'
import { Note, NoteCategory } from '../../types/app.types'
import { useT } from '../../i18n'

interface Props {
  note: Note
  categories: NoteCategory[]
  onUnpin: () => void
}

export default function PinnedNoteStrip({ note, categories, onUnpin }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  const category = note.categoryId ? categories.find(c => c.id === note.categoryId) : undefined
  const categoryEmoji = category ? category.emoji + ' ' : ''

  return (
    <div style={{
      borderBottom: '1px solid rgba(0, 122, 204, 0.15)',
      background: 'rgba(0, 122, 204, 0.04)',
      flexShrink: 0,
      animation: 'quickCaptureIn 0.2s ease',
    }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          cursor: 'pointer',
          minHeight: 28,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Pin size={11} style={{ color: 'var(--accent)', flexShrink: 0, transform: 'rotate(45deg)' }} />
        <StickyNote size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{
          flex: 1,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {categoryEmoji}{note.title}
        </span>
        {expanded
          ? <ChevronUp size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          : <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        }
        <button
          onClick={(e) => { e.stopPropagation(); onUnpin() }}
          title={t('notes.unpinFromChat')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            padding: 2,
            opacity: 0.5,
            transition: 'opacity 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{
          padding: '4px 12px 8px 30px',
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 200,
          overflowY: 'auto',
          borderTop: '1px solid rgba(0, 122, 204, 0.08)',
        }}>
          {note.content}
        </div>
      )}
    </div>
  )
}
