import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Plus, ArrowLeft, Trash2, NotebookPen, MessageSquareShare, Search, X, Settings, Check, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { Note, NoteCategory } from '../../types/app.types'

const MAX_NOTES = 100
const MAX_CONTENT_LENGTH = 10000
const MAX_CATEGORIES = 10
const MAX_CATEGORY_NAME = 20

const CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#6b7280', // gray
]

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

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function NotesPanel() {
  const t = useT()
  const { prefs, setPrefs } = usePrefsStore()
  const setQuotedText = useUiStore(s => s.setQuotedText)
  const addToast = useUiStore(s => s.addToast)
  const notes: Note[] = prefs.notes || []
  const categories: NoteCategory[] = prefs.noteCategories || []
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [previewMode, setPreviewMode] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, setTick] = useState(0)

  // Category state
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0])
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)

  // Refresh relative timestamps every 30s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  // Close category dropdown when clicking outside
  useEffect(() => {
    if (!showCategoryDropdown) return
    const handler = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setShowCategoryDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCategoryDropdown])

  // Filter notes by search query and category
  const filteredNotes = useMemo(() => {
    let result = notes
    // Category filter
    if (activeCategoryFilter !== null) {
      result = result.filter(n => (n.categoryId || '') === activeCategoryFilter)
    }
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.content || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [notes, searchQuery, activeCategoryFilter])

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { '': 0 }
    categories.forEach(c => { counts[c.id] = 0 })
    notes.forEach(n => {
      const catId = n.categoryId || ''
      if (catId in counts) counts[catId]++
      else counts['']++ // category was deleted, count as uncategorized
    })
    return counts
  }, [notes, categories])

  const persistNotes = useCallback((updated: Note[]) => {
    setPrefs({ notes: updated })
    window.electronAPI.prefsSet('notes', updated)
  }, [setPrefs])

  const persistCategories = useCallback((updated: NoteCategory[]) => {
    setPrefs({ noteCategories: updated })
    window.electronAPI.prefsSet('noteCategories', updated)
  }, [setPrefs])

  const handleCreateNote = () => {
    if (notes.length >= MAX_NOTES) return
    const now = Date.now()
    const newNote: Note = {
      id: generateId('note'),
      title: '',
      content: '',
      createdAt: now,
      updatedAt: now,
      // If a category filter is active, assign the new note to that category
      categoryId: activeCategoryFilter || undefined,
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
    setPreviewMode(false)
    setShowCategoryDropdown(false)
  }

  const handleBack = () => {
    // Save before going back
    if (editingNoteId) {
      saveNote(editingNoteId, title, content)
    }
    setEditingNoteId(null)
    setDeletingNoteId(null)
    setPreviewMode(false)
    setShowCategoryDropdown(false)
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
    // Auto-generate title from first Markdown heading if title is empty
    if (!title) {
      const firstLine = val.split('\n')[0] || ''
      const headingMatch = firstLine.match(/^#{1,3}\s+(.+)/)
      if (headingMatch) {
        setTitle(headingMatch[1].trim())
        if (editingNoteId) scheduleAutoSave(editingNoteId, headingMatch[1].trim(), val)
        return
      }
    }
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

  const handleSendToChat = (note: Note, e: React.MouseEvent) => {
    e.stopPropagation()
    const noteTitle = note.title || t('notes.untitled')
    const text = note.content
      ? `[Note: ${noteTitle}]\n${note.content}`
      : `[Note: ${noteTitle}]`
    setQuotedText(text)
    addToast('success', t('notes.sentToChat'), 2000)
  }

  // ── Category management handlers ──
  const handleAddCategory = () => {
    const name = newCategoryName.trim()
    if (!name || categories.length >= MAX_CATEGORIES) return
    const newCat: NoteCategory = {
      id: generateId('notecat'),
      name: name.slice(0, MAX_CATEGORY_NAME),
      color: newCategoryColor,
      createdAt: Date.now(),
    }
    persistCategories([...categories, newCat])
    setNewCategoryName('')
    setNewCategoryColor(CATEGORY_COLORS[(categories.length + 1) % CATEGORY_COLORS.length])
  }

  const handleDeleteCategory = (catId: string) => {
    if (deletingCategoryId === catId) {
      // Second click -- confirm
      const updatedCategories = categories.filter(c => c.id !== catId)
      persistCategories(updatedCategories)
      // Move notes in this category to uncategorized
      const updatedNotes = notes.map(n =>
        n.categoryId === catId ? { ...n, categoryId: undefined, updatedAt: Date.now() } : n
      )
      persistNotes(updatedNotes)
      setDeletingCategoryId(null)
      // Clear filter if we were filtering by the deleted category
      if (activeCategoryFilter === catId) setActiveCategoryFilter(null)
      addToast('success', t('notes.categoryDeleted'), 2000)
    } else {
      setDeletingCategoryId(catId)
    }
  }

  // Clear category delete confirmation after timeout
  useEffect(() => {
    if (!deletingCategoryId) return
    const timer = setTimeout(() => setDeletingCategoryId(null), 3000)
    return () => clearTimeout(timer)
  }, [deletingCategoryId])

  const handleRenameCategoryStart = (cat: NoteCategory) => {
    setEditingCategoryId(cat.id)
    setEditingCategoryName(cat.name)
  }

  const handleRenameCategorySave = () => {
    if (!editingCategoryId) return
    const name = editingCategoryName.trim().slice(0, MAX_CATEGORY_NAME)
    if (!name) { setEditingCategoryId(null); return }
    const updated = categories.map(c =>
      c.id === editingCategoryId ? { ...c, name } : c
    )
    persistCategories(updated)
    setEditingCategoryId(null)
  }

  const handleSetNoteCategory = (categoryId: string | undefined) => {
    if (!editingNoteId) return
    const currentNotes: Note[] = usePrefsStore.getState().prefs.notes || []
    const updated = currentNotes.map(n =>
      n.id === editingNoteId ? { ...n, categoryId, updatedAt: Date.now() } : n
    )
    persistNotes(updated)
    setShowCategoryDropdown(false)
  }

  const getCategoryById = (id?: string): NoteCategory | undefined => {
    if (!id) return undefined
    return categories.find(c => c.id === id)
  }

  const editingNote = editingNoteId ? notes.find(n => n.id === editingNoteId) : null

  // ── Editor View ──
  if (editingNoteId && editingNote) {
    const noteCategory = getCategoryById(editingNote.categoryId)
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

          {/* Edit / Preview toggle */}
          <div style={{
            display: 'flex',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--card-bg)',
            overflow: 'hidden',
          }}>
            <button
              onClick={() => { if (previewMode) { setPreviewMode(false) } }}
              style={{
                background: !previewMode ? 'var(--accent)' : 'transparent',
                color: !previewMode ? 'white' : 'var(--text-muted)',
                border: 'none',
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (previewMode) e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { if (previewMode) e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              {t('notes.edit')}
            </button>
            <button
              onClick={() => {
                if (!previewMode) {
                  // Save before switching to preview
                  if (editingNoteId) saveNote(editingNoteId, title, content)
                  setPreviewMode(true)
                }
              }}
              style={{
                background: previewMode ? 'var(--accent)' : 'transparent',
                color: previewMode ? 'white' : 'var(--text-muted)',
                border: 'none',
                borderLeft: '1px solid var(--border)',
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (!previewMode) e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { if (!previewMode) e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              {t('notes.preview')}
            </button>
          </div>

          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {content.length} {t('notes.characters')}
          </span>
        </div>

        {/* Category selector row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          position: 'relative',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
            {t('notes.categoryLabel')}:
          </span>
          <div ref={categoryDropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              {noteCategory && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: noteCategory.color, flexShrink: 0 }} />
              )}
              <span>{noteCategory ? noteCategory.name : t('notes.uncategorized')}</span>
              <ChevronDown size={10} style={{ opacity: 0.5 }} />
            </button>

            {/* Category dropdown menu */}
            {showCategoryDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                minWidth: 160,
                background: 'var(--popup-bg)',
                border: '1px solid var(--popup-border)',
                borderRadius: 8,
                boxShadow: 'var(--popup-shadow)',
                zIndex: 100,
                animation: 'popup-in 0.15s ease',
                padding: '4px 0',
              }}>
                {/* Uncategorized option */}
                <button
                  role="option"
                  aria-selected={!editingNote.categoryId}
                  onClick={() => handleSetNoteCategory(undefined)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 10px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--action-btn-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ width: 14, textAlign: 'center' }}>
                    {!editingNote.categoryId && <Check size={12} />}
                  </span>
                  {t('notes.uncategorized')}
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    role="option"
                    aria-selected={editingNote.categoryId === cat.id}
                    onClick={() => handleSetNoteCategory(cat.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '6px 10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: 11,
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--action-btn-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ width: 14, textAlign: 'center' }}>
                      {editingNote.categoryId === cat.id && <Check size={12} />}
                    </span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>
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

        {/* Content: textarea (edit) or Markdown preview */}
        {previewMode ? (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '10px 14px',
              boxSizing: 'border-box',
            }}
          >
            {content.trim() ? (
              <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7 }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}>
                {t('notes.nothingToPreview')}
              </div>
            )}
          </div>
        ) : (
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
        )}

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

      {/* Search bar */}
      {notes.length > 0 && (
        <div style={{ padding: '8px 14px 0', flexShrink: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 32,
            padding: '0 8px',
            background: 'var(--sidebar-bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}>
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('notes.searchPlaceholder')}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <X size={12} />
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0 0' }}>
              {filteredNotes.length > 0
                ? t('notes.searchResults', { count: String(filteredNotes.length) })
                : t('notes.noResults')
              }
            </div>
          )}
        </div>
      )}

      {/* Category filter bar */}
      {categories.length > 0 && notes.length > 0 && (
        <div
          role="radiogroup"
          aria-label={t('notes.categoryLabel')}
          style={{
            display: 'flex',
            gap: 6,
            padding: '6px 10px',
            overflowX: 'auto',
            flexShrink: 0,
            scrollbarWidth: 'none',
            alignItems: 'center',
          }}
        >
          {/* "All" pill */}
          <button
            role="radio"
            aria-checked={activeCategoryFilter === null}
            onClick={() => setActiveCategoryFilter(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              borderRadius: 10,
              padding: '0 8px',
              background: activeCategoryFilter === null ? 'var(--accent)20' : 'transparent',
              border: `1px solid ${activeCategoryFilter === null ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer',
              fontSize: 10,
              color: activeCategoryFilter === null ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: activeCategoryFilter === null ? 600 : 400,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
            }}
          >
            {t('notes.allNotes')}
            <span style={{ opacity: 0.6, fontSize: 9 }}>({notes.length})</span>
          </button>

          {/* Category pills */}
          {categories.map(cat => {
            const count = categoryCounts[cat.id] || 0
            const isActive = activeCategoryFilter === cat.id
            return (
              <button
                key={cat.id}
                role="radio"
                aria-checked={isActive}
                onClick={() => setActiveCategoryFilter(isActive ? null : cat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 20,
                  borderRadius: 10,
                  padding: '0 8px',
                  background: isActive ? `${cat.color}30` : `${cat.color}1a`,
                  border: `1px solid ${isActive ? `${cat.color}80` : `${cat.color}40`}`,
                  cursor: 'pointer',
                  fontSize: 10,
                  color: isActive ? cat.color : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                }}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                {cat.name}
                <span style={{ opacity: 0.6, fontSize: 9 }}>({count})</span>
              </button>
            )
          })}

          {/* Manage button */}
          <button
            onClick={() => setShowCategoryManager(!showCategoryManager)}
            title={t('notes.manageCategories')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              height: 20,
              borderRadius: 10,
              padding: '0 6px',
              background: 'none',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              fontSize: 10,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Settings size={10} />
          </button>
        </div>
      )}

      {/* Show manage button even when no categories exist (to create the first one) */}
      {categories.length === 0 && notes.length > 0 && (
        <div style={{ padding: '4px 10px', flexShrink: 0 }}>
          <button
            onClick={() => setShowCategoryManager(!showCategoryManager)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              borderRadius: 10,
              padding: '0 8px',
              background: 'none',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              fontSize: 10,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Plus size={10} />
            {t('notes.manageCategories')}
          </button>
        </div>
      )}

      {/* Category management panel */}
      {showCategoryManager && (
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--card-bg)',
          flexShrink: 0,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('notes.manageCategories')}
            </span>
            <button
              onClick={() => setShowCategoryManager(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 4,
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              {t('notes.closeManage')}
            </button>
          </div>

          {/* Add new category */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input
              type="text"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value.slice(0, MAX_CATEGORY_NAME))}
              placeholder={t('notes.newCategoryName')}
              maxLength={MAX_CATEGORY_NAME}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCategory() }}
              style={{
                flex: 1,
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 4,
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 11,
                padding: '4px 8px',
                fontFamily: 'inherit',
              }}
            />
            {/* Color picker circles */}
            <div style={{ display: 'flex', gap: 3 }}>
              {CATEGORY_COLORS.map(color => (
                <button
                  key={color}
                  role="radio"
                  aria-checked={newCategoryColor === color}
                  aria-label={color}
                  onClick={() => setNewCategoryColor(color)}
                  style={{
                    width: newCategoryColor === color ? 16 : 14,
                    height: newCategoryColor === color ? 16 : 14,
                    borderRadius: '50%',
                    background: color,
                    border: newCategoryColor === color ? `2px solid ${color}80` : '1px solid transparent',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'transform 0.1s, border 0.1s',
                    transform: newCategoryColor === color ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim() || categories.length >= MAX_CATEGORIES}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: !newCategoryName.trim() || categories.length >= MAX_CATEGORIES ? 'var(--text-muted)' : 'var(--accent)',
                cursor: !newCategoryName.trim() || categories.length >= MAX_CATEGORIES ? 'not-allowed' : 'pointer',
                fontSize: 11,
                padding: '4px 8px',
                opacity: !newCategoryName.trim() || categories.length >= MAX_CATEGORIES ? 0.5 : 1,
              }}
            >
              {t('notes.addCategory')}
            </button>
          </div>

          {/* Max categories notice */}
          {categories.length >= MAX_CATEGORIES && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
              {t('notes.maxCategories')}
            </div>
          )}

          {/* Existing categories */}
          {categories.map(cat => (
            <div
              key={cat.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              {editingCategoryId === cat.id ? (
                <input
                  type="text"
                  value={editingCategoryName}
                  onChange={e => setEditingCategoryName(e.target.value.slice(0, MAX_CATEGORY_NAME))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameCategorySave()
                    if (e.key === 'Escape') setEditingCategoryId(null)
                  }}
                  onBlur={handleRenameCategorySave}
                  autoFocus
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: '1px solid var(--accent)',
                    borderRadius: 4,
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    padding: '2px 6px',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <span
                  onClick={() => handleRenameCategoryStart(cat)}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                  title="Click to rename"
                >
                  {cat.name}
                </span>
              )}
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                ({categoryCounts[cat.id] || 0})
              </span>
              <button
                onClick={() => handleDeleteCategory(cat.id)}
                aria-label={deletingCategoryId === cat.id ? t('notes.deleteConfirm') : t('notes.delete')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: deletingCategoryId === cat.id ? '#e06c75' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: deletingCategoryId === cat.id ? 1 : 0.4,
                  transition: 'opacity 0.15s, color 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => { if (deletingCategoryId !== cat.id) e.currentTarget.style.opacity = '0.4' }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

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
        ) : filteredNotes.length === 0 ? (
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
        ) : (
          filteredNotes.map(note => {
            const noteCat = getCategoryById(note.categoryId)
            return (
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
                    onClick={(e) => handleSendToChat(note, e)}
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
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
