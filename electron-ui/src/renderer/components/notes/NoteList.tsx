import React from 'react'
import { Trash2, NotebookPen, MessageSquareShare, Search } from 'lucide-react'
import { useT } from '../../i18n'
import { Note, NoteCategory } from '../../types/app.types'
import { formatRelativeTime } from './notesConstants'

interface NoteListProps {
  notes: Note[]
  filteredNotes: Note[]
  hasNotes: boolean
  deletingNoteId: string | null
  onOpen: (note: Note) => void
  onDelete: (noteId: string, e: React.MouseEvent) => void
  onSendToChat: (note: Note, e: React.MouseEvent) => void
  getCategoryById: (id?: string) => NoteCategory | undefined
}

export default function NoteList({
  notes,
  filteredNotes,
  hasNotes,
  deletingNoteId,
  onOpen,
  onDelete,
  onSendToChat,
  getCategoryById,
}: NoteListProps) {
  const t = useT()

  if (!hasNotes) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: 'var(--text-muted)',
      }}>
        <NotebookPen size={32} strokeWidth={1} style={{ opacity: 0.3 }} />
        <span style={{ fontSize: 13 }}>{t('notes.emptyState')}</span>
      </div>
    )
  }

  if (filteredNotes.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: 'var(--text-muted)',
      }}>
        <Search size={32} strokeWidth={1} style={{ opacity: 0.3 }} />
        <span style={{ fontSize: 13 }}>{t('notes.noResults')}</span>
      </div>
    )
  }

  return (
    <>
      {filteredNotes.map(note => {
        const noteCat = getCategoryById(note.categoryId)
        return (
          <div
            key={note.id}
            onClick={() => onOpen(note)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--action-btn-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                color: 'var(--text-primary)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {note.title || note.content.slice(0, 30) || t('notes.untitled')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                {noteCat && (
                  <>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: noteCat.color, flexShrink: 0 }} />
                    <span style={{ maxWidth: '12ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {noteCat.name}
                    </span>
                    <span style={{ opacity: 0.4 }}>|</span>
                  </>
                )}
                {formatRelativeTime(note.updatedAt, t)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <button
                onClick={(e) => onSendToChat(note, e)}
                aria-label={t('notes.sendToChat')}
                title={t('notes.sendToChat')}
                disabled={!note.title && !note.content}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: !note.title && !note.content ? 'default' : 'pointer',
                  padding: 4,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: !note.title && !note.content ? 0.3 : 0.4,
                  transition: 'opacity 0.15s, color 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { if (note.title || note.content) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent)' } }}
                onMouseLeave={e => { e.currentTarget.style.opacity = !note.title && !note.content ? '0.3' : '0.4'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <MessageSquareShare size={14} />
              </button>
              <button
                onClick={(e) => onDelete(note.id, e)}
                aria-label={deletingNoteId === note.id ? t('notes.deleteConfirm') : t('notes.delete')}
                title={deletingNoteId === note.id ? t('notes.deleteConfirm') : undefined}
                style={{
                  background: 'none',
                  border: 'none',
                  color: deletingNoteId === note.id ? '#e06c75' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: deletingNoteId === note.id ? 1 : 0.4,
                  transition: 'opacity 0.15s, color 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={e => { if (deletingNoteId !== note.id) e.currentTarget.style.opacity = '0.4' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}
