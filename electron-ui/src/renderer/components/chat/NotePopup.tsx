// NotePopup — @note: reference popup for inserting note content into chat (Iteration 438)
import React from 'react'
import { StickyNote } from 'lucide-react'
import { Note, NoteCategory } from '../../types/app.types'
import { useT } from '../../i18n'

interface Props {
  query: string
  notes: Note[]
  categories: NoteCategory[]
  selectedIndex: number
  onSelect: (note: Note) => void
  onDismiss: () => void
  onHover: (index: number) => void
}

export default function NotePopup({ query, notes, categories, selectedIndex, onSelect, onDismiss, onHover }: Props) {
  const t = useT()

  if (notes.length === 0) return null

  const getCategoryEmoji = (categoryId?: string) => {
    if (!categoryId) return ''
    const cat = categories.find(c => c.id === categoryId)
    return cat ? cat.emoji + ' ' : ''
  }

  return (
    <div
      className="popup-enter"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 4,
        background: 'var(--popup-bg)',
        border: '1px solid var(--popup-border)',
        borderRadius: 8,
        boxShadow: 'var(--popup-shadow)',
        zIndex: 1000,
        maxHeight: 280,
        overflowY: 'auto',
        padding: '4px 0',
      }}
    >
      <div style={{
        padding: '4px 10px 4px',
        fontSize: 10,
        color: 'var(--text-muted)',
        fontWeight: 600,
        letterSpacing: 0.3,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <StickyNote size={10} />
        {t('notes.title')}
      </div>
      {notes.map((note, idx) => (
        <button
          key={note.id}
          onClick={() => onSelect(note)}
          onMouseEnter={() => onHover(idx)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '6px 10px',
            background: idx === selectedIndex ? 'var(--popup-item-hover)' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
            borderRadius: 0,
          }}
        >
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--accent)',
            flexShrink: 0,
            maxWidth: 140,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {getCategoryEmoji(note.categoryId)}{note.title}
          </span>
          <span style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.4,
            opacity: 0.7,
          }}>
            {note.content.length > 40 ? note.content.slice(0, 40) + '...' : note.content}
          </span>
        </button>
      ))}
    </div>
  )
}
