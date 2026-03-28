import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, ArrowLeft, Trash2, NotebookPen } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import { Note } from '../../types/app.types'

const MAX_NOTES = 100
const MAX_CONTENT_LENGTH = 10000

function formatRelativeTime(ts: number, t: (key: string, params?: Record<string, string>) => string): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return t('notes.justNow')
  const mins = Math.floor(diff / 60)
  if (mins < 60) return t('notes.minsAgo', { count: String(mins) })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('notes.hoursAgo', { count: String(hrs) })
  const days = Math.floor(hrs / 24)
  if (days === 1) return t('notes.yesterday')
  return t('notes.daysAgo', { count: String(days) })
}

function generateId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function NotesPanel() {
  const t = useT()
  const { prefs, setPrefs } = usePrefsStore()
  const notes: Note[] = prefs.notes || []
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, setTick] = useState(0)

  // Refresh relative timestamps every 30s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  const persistNotes = useCallback((updated: Note[]) => {
    setPrefs({ notes: updated })
    window.electronAPI.prefsSet('notes', updated)
  }, [setPrefs])

  const handleCreateNote = () => {
    if (notes.length >= MAX_NOTES) return
    const now = Date.now()
    const newNote: Note = {
      id: generateId(),
      title: '',
      content: '',
      createdAt: now,
      updatedAt: now,
    }
    const updated = [newNote, ...notes]
    persistNotes(updated)
    setEditingNoteId(newNote.id)
    setTitle('')
    setContent('')
  }

  const handleOpenNote = (note: Note) => {
    setEditingNoteId(note.id)
    setTitle(note.title)
    setContent(note.content)
    setDeletingNoteId(null)
  }

  const handleBack = () => {
    // Save before going back
    if (editingNoteId) {
      saveNote(editingNoteId, title, content)
    }
    setEditingNoteId(null)
    setDeletingNoteId(null)
  }

  const saveNote = useCallback((noteId: string, newTitle: string, newContent: string) => {
    const currentNotes: Note[] = usePrefsStore.getState().prefs.notes || []
    const updated = currentNotes.map(n =>
      n.id === noteId
        ? { ...n, title: newTitle, content: newContent, updatedAt: Date.now() }
        : n
    )
    persistNotes(updated)
  }, [persistNotes])

  const scheduleAutoSave = useCallback((noteId: string, newTitle: string, newContent: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveNote(noteId, newTitle, newContent)
    }, 1000)
  }, [saveNote])

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTitle(val)
    if (editingNoteId) scheduleAutoSave(editingNoteId, val, content)
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.slice(0, MAX_CONTENT_LENGTH)
    setContent(val)
    if (editingNoteId) scheduleAutoSave(editingNoteId, title, val)
  }

  const handleDeleteNote = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deletingNoteId === noteId) {
      // Second click -- confirm delete
      const updated = notes.filter(n => n.id !== noteId)
      persistNotes(updated)
      setDeletingNoteId(null)
      if (editingNoteId === noteId) {
        setEditingNoteId(null)
      }
    } else {
      setDeletingNoteId(noteId)
    }
  }

  // Clear delete confirmation when clicking elsewhere
  useEffect(() => {
    if (!deletingNoteId) return
    const timer = setTimeout(() => setDeletingNoteId(null), 3000)
    return () => clearTimeout(timer)
  }, [deletingNoteId])

  const editingNote = editingNoteId ? notes.find(n => n.id === editingNoteId) : null

  // ── Editor View ──
  if (editingNoteId && editingNote) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
        {/* Editor header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <button
            onClick={handleBack}
            aria-label={t('notes.back')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              padding: '4px 8px',
              borderRadius: 4,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <ArrowLeft size={14} />
            {t('notes.back')}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {content.length} {t('notes.characters')}
          </span>
        </div>

        {/* Title input */}
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder={t('notes.untitled')}
          style={{
            width: '100%',
            padding: '10px 14px',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 15,
            fontWeight: 600,
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />

        {/* Content textarea */}
        <textarea
          value={content}
          onChange={handleContentChange}
          placeholder={t('notes.startTyping')}
          maxLength={MAX_CONTENT_LENGTH}
          style={{
            flex: 1,
            width: '100%',
            padding: '10px 14px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 13,
            lineHeight: 1.6,
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />

        {/* Timestamps footer */}
        <div style={{
          padding: '6px 14px',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span>{t('notes.created')}: {new Date(editingNote.createdAt).toLocaleDateString()}</span>
          <span>{t('notes.modified')}: {new Date(editingNote.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    )
  }

  // ── List View ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('notes.title')}
        </span>
        <button
          onClick={handleCreateNote}
          aria-label={t('notes.newNote')}
          disabled={notes.length >= MAX_NOTES}
          style={{
            background: 'none',
            border: '1px solid var(--card-border)',
            borderRadius: 6,
            color: 'var(--accent)',
            cursor: notes.length >= MAX_NOTES ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            fontSize: 12,
            opacity: notes.length >= MAX_NOTES ? 0.5 : 1,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { if (notes.length < MAX_NOTES) e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)' }}
        >
          <Plus size={14} />
          {t('notes.newNote')}
        </button>
      </div>

      {/* Note list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {notes.length === 0 ? (
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
        ) : (
          notes.map(note => (
            <div
              key={note.id}
              onClick={() => handleOpenNote(note)}
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
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {formatRelativeTime(note.updatedAt, t)}
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteNote(note.id, e)}
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
          ))
        )}
      </div>
    </div>
  )
}
