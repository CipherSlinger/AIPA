// NotePopup — @note: reference popup for inserting note content into chat (Iteration 439)
import React from 'react'
import { StickyNote, Plus } from 'lucide-react'
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
  onAddNote?: () => void
}

export default function NotePopup({ query, notes, categories, selectedIndex, onSelect, onDismiss, onHover, onAddNote }: Props) {
  const t = useT()

  return (
    <div
      className="popup-enter"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 4,
        background: 'rgba(15,15,25,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        boxShadow: '0 16px 48px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        zIndex: 1000,
        maxHeight: 300,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Section header — micro-label */}
      <div style={{
        padding: '6px 12px 4px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase' as const,
        color: 'rgba(255,255,255,0.38)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <StickyNote size={10} />
        {t('notes.title')}
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {notes.length === 0 ? (
          /* Empty state */
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 16px',
            gap: 6,
          }}>
            <StickyNote size={20} style={{ color: 'rgba(255,255,255,0.20)' }} />
            <span style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.45)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              {t('notes.empty') || 'No notes yet'}
            </span>
          </div>
        ) : (
          notes.map((note, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <button
                key={note.id}
                onClick={() => onSelect(note)}
                onMouseEnter={() => onHover(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '7px 12px',
                  background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                  border: 'none',
                  borderLeft: isSelected ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  borderRadius: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseOver={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }
                }}
              >
                {/* Note title */}
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isSelected ? '#818cf8' : 'rgba(255,255,255,0.82)',
                  flexShrink: 0,
                  maxWidth: 140,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s ease',
                }}>
                  {getCategoryEmoji(note.categoryId, categories)}{note.title}
                </span>
                {/* Content preview */}
                <span style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.45)',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical' as const,
                  lineHeight: 1.6,
                  flex: 1,
                  minWidth: 0,
                }}>
                  {note.content.length > 50 ? note.content.slice(0, 50) + '…' : note.content}
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* Footer: add note button + keyboard hints */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        {onAddNote ? (
          <button
            onClick={onAddNote}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(129,140,248,0.15) 100%)',
              border: '1px solid rgba(99,102,241,0.30)',
              borderRadius: 6,
              padding: '2px 8px',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              color: '#a5b4fc',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.35) 0%, rgba(129,140,248,0.25) 100%)'
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.50)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(129,140,248,0.15) 100%)'
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)'
            }}
          >
            <Plus size={10} />
            {t('notes.add') || 'New note'}
          </button>
        ) : <span />}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>
          ↑↓&nbsp;navigate · Enter&nbsp;select · Esc&nbsp;dismiss
        </span>
      </div>
    </div>
  )
}

function getCategoryEmoji(categoryId: string | undefined, categories: NoteCategory[]): string {
  if (!categoryId) return ''
  const cat = categories.find(c => c.id === categoryId)
  return cat ? cat.emoji + ' ' : ''
}
