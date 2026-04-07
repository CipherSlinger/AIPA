import React from 'react'
import { Trash2, NotebookPen, MessageSquareShare, Search, Pin } from 'lucide-react'
import { useT } from '../../i18n'
import { Note, NoteCategory } from '../../types/app.types'
import { formatRelativeTime } from './notesConstants'
import { escapeRegExp, firstLineOf } from '../../utils/stringUtils'

/** Highlight matching text with accent background */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) return <>{text}</>
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi')
  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} style={{ background: 'rgba(0,122,204,0.25)', borderRadius: 2, padding: '0 1px' }}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

/** Extract a content snippet around the first match */
function getContentSnippet(content: string, query: string, maxLen = 80): string | null {
  if (!query.trim() || !content) return null
  const lower = content.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return null
  const start = Math.max(0, idx - 20)
  const end = Math.min(content.length, idx + query.length + maxLen - 20)
  let snippet = content.slice(start, end).replace(/\n/g, ' ')
  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet = snippet + '...'
  return snippet
}

interface NoteListProps {
  notes: Note[]
  filteredNotes: Note[]
  hasNotes: boolean
  deletingNoteId: string | null
  searchQuery?: string
  onOpen: (note: Note) => void
  onDelete: (noteId: string, e: React.MouseEvent) => void
  onSendToChat: (note: Note, e: React.MouseEvent) => void
  onTogglePin: (noteId: string, e: React.MouseEvent) => void
  getCategoryById: (id?: string) => NoteCategory | undefined
}

export default function NoteList({
  notes,
  filteredNotes,
  hasNotes,
  deletingNoteId,
  searchQuery = '',
  onOpen,
  onDelete,
  onSendToChat,
  onTogglePin,
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
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                {note.pinned && (
                  <Pin size={11} style={{ flexShrink: 0, color: 'var(--accent)', transform: 'rotate(45deg)' }} />
                )}
                <HighlightText
                  text={note.title || firstLineOf(note.content).slice(0, 30) || t('notes.untitled')}
                  query={searchQuery}
                />
              </div>
              {/* Content match snippet when searching */}
              {searchQuery.trim() && (() => {
                const snippet = getContentSnippet(note.content, searchQuery)
                if (!snippet) return null
                return (
                  <div style={{
                    fontSize: 11, color: 'var(--text-muted)', marginTop: 3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontStyle: 'italic', opacity: 0.8,
                  }}>
                    <HighlightText text={snippet} query={searchQuery} />
                  </div>
                )
              })()}
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
                <span style={{ opacity: 0.4 }}>|</span>
                <span>{note.content.trim() ? note.content.trim().split(/\s+/).length : 0} {t('notes.words')}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <button
                onClick={(e) => onTogglePin(note.id, e)}
                aria-label={note.pinned ? t('notes.unpin') : t('notes.pin')}
                title={note.pinned ? t('notes.unpin') : t('notes.pin')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: note.pinned ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: note.pinned ? 0.8 : 0.4,
                  transition: 'opacity 0.15s, color 0.15s',
                  flexShrink: 0,
                  transform: 'rotate(45deg)',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = note.pinned ? '0.8' : '0.4' }}
              >
                <Pin size={14} style={{ fill: note.pinned ? 'var(--accent)' : 'none' }} />
              </button>
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
