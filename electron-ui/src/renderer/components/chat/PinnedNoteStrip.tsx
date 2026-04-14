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
      borderBottom: '1px solid rgba(99,102,241,0.20)',
      background: 'rgba(99,102,241,0.08)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      flexShrink: 0,
      animation: 'quickCaptureIn 0.15s ease',
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
        <Pin size={13} style={{ color: '#818cf8', flexShrink: 0, transform: 'rotate(45deg)' }} />
        <StickyNote size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
        <span style={{
          flex: 1,
          fontSize: 12,
          color: 'var(--text-secondary)',
          fontStyle: 'italic',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {categoryEmoji}{note.title}
        </span>
        {category && (
          <span style={{
            background: 'rgba(99,102,241,0.15)',
            color: '#a5b4fc',
            borderRadius: 10,
            padding: '1px 6px',
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            {category.name}
          </span>
        )}
        {expanded
          ? <ChevronUp size={12} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          : <ChevronDown size={12} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        }
        <button
          onClick={(e) => { e.stopPropagation(); onUnpin() }}
          title={t('notes.unpinFromChat')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-faint)',
            display: 'flex',
            alignItems: 'center',
            padding: '2px 4px',
            borderRadius: 6,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fca5a5'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.background = 'none' }}
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
          fontStyle: 'italic',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 200,
          overflowY: 'auto',
          borderTop: '1px solid rgba(99,102,241,0.10)',
        }}>
          {note.content}
        </div>
      )}
    </div>
  )
}
