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
          <span key={i} style={{ background: 'rgba(99,102,241,0.22)', borderRadius: 2, padding: '0 1px' }}>{part}</span>
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
        fontSize: 12,
        color: 'rgba(255,255,255,0.38)',
        textAlign: 'center',
        padding: '32px 16px',
      }}>
        <NotebookPen size={32} strokeWidth={1} style={{ opacity: 0.3 }} />
        <span>{t('notes.emptyState')}</span>
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
        fontSize: 12,
        color: 'rgba(255,255,255,0.38)',
        textAlign: 'center',
        padding: '32px 16px',
      }}>
        <Search size={32} strokeWidth={1} style={{ opacity: 0.3 }} />
        <span>{t('notes.noResults')}</span>
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
              padding: '8px 10px',
              cursor: 'pointer',
              borderRadius: 8,
              marginBottom: 2,
              border: '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'transparent'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.82)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                {note.pinned && (
                  <Pin size={11} style={{ flexShrink: 0, color: '#fbbf24', transform: 'rotate(45deg)' }} />
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
                    fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontStyle: 'italic',
                  }}>
                    <HighlightText text={snippet} query={searchQuery} />
                  </div>
                )
              })()}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                {noteCat && (
                  <>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: noteCat.color, flexShrink: 0 }} />
                    <span style={{ maxWidth: '12ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.60)', background: 'rgba(255,255,255,0.07)', borderRadius: 20, padding: '1px 7px' }}>
                      {noteCat.name}
                    </span>
                  </>
                )}
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{formatRelativeTime(note.updatedAt, t)}</span>
                <span style={{ opacity: 0.4, fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>|</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{note.content.trim() ? note.content.trim().split(/\s+/).length : 0} {t('notes.words')}</span>
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
                  color: note.pinned ? '#fbbf24' : 'rgba(255,255,255,0.38)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: note.pinned ? 1 : 0.5,
                  transition: 'opacity 0.15s, color 0.15s',
                  flexShrink: 0,
                  transform: 'rotate(45deg)',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = note.pinned ? '0.9' : '0.4' }}
              >
                <Pin size={14} style={{ fill: note.pinned ? '#fbbf24' : 'none' }} />
              </button>
              <button
                onClick={(e) => onSendToChat(note, e)}
                aria-label={t('notes.sendToChat')}
                title={t('notes.sendToChat')}
                disabled={!note.title && !note.content}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.38)',
                  cursor: !note.title && !note.content ? 'not-allowed' : 'pointer',
                  padding: 4,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: !note.title && !note.content ? 0.3 : 0.4,
                  transition: 'opacity 0.15s, color 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { if (note.title || note.content) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#818cf8' } }}
                onMouseLeave={e => { e.currentTarget.style.opacity = !note.title && !note.content ? '0.3' : '0.4'; e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }}
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
                  color: deletingNoteId === note.id ? '#fca5a5' : 'rgba(255,255,255,0.38)',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: deletingNoteId === note.id ? 1 : 0.4,
                  transition: 'opacity 0.15s, color 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#fca5a5' }}
                onMouseLeave={e => { if (deletingNoteId !== note.id) { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'rgba(255,255,255,0.38)' } }}
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
