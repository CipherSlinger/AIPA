import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { Note, NoteCategory } from '../../types/app.types'
import { MAX_NOTES, MAX_CONTENT_LENGTH, MAX_CATEGORIES, MAX_CATEGORY_NAME, CATEGORY_COLORS, generateId } from './notesConstants'

export function useNotesCRUD() {
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
  const [previewMode, setPreviewMode] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Category state
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0])
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persistNotes = useCallback((updated: Note[]) => {
    setPrefs({ notes: updated })
    window.electronAPI.prefsSet('notes', updated)
  }, [setPrefs])

  const persistCategories = useCallback((updated: NoteCategory[]) => {
    setPrefs({ noteCategories: updated })
    window.electronAPI.prefsSet('noteCategories', updated)
  }, [setPrefs])

  const saveNote = useCallback((noteId: string, newTitle: string, newContent: string) => {
    const currentNotes: Note[] = usePrefsStore.getState().prefs.notes || []
    const updated = currentNotes.map(n =>
      n.id === noteId
        ? { ...n, title: newTitle, content: newContent, updatedAt: Date.now() }
        : n
    )
    persistNotes(updated)
    setSaveStatus('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
  }, [persistNotes])

  const scheduleAutoSave = useCallback((noteId: string, newTitle: string, newContent: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    saveTimerRef.current = setTimeout(() => {
      saveNote(noteId, newTitle, newContent)
    }, 1000)
  }, [saveNote])

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const handleCreateNote = useCallback((initialTitle?: string, initialContent?: string) => {
    if (notes.length >= MAX_NOTES) return
    const now = Date.now()
    const noteTitle = initialTitle || ''
    const noteContent = initialContent || ''
    const newNote: Note = {
      id: generateId('note'),
      title: noteTitle,
      content: noteContent,
      createdAt: now,
      updatedAt: now,
      categoryId: activeCategoryFilter || undefined,
    }
    const updated = [newNote, ...notes]
    persistNotes(updated)
    setEditingNoteId(newNote.id)
    setTitle(noteTitle)
    setContent(noteContent)
  }, [notes, activeCategoryFilter, persistNotes])

  const handleOpenNote = useCallback((note: Note) => {
    setEditingNoteId(note.id)
    setTitle(note.title)
    setContent(note.content)
    setDeletingNoteId(null)
    setPreviewMode(false)
    setShowCategoryDropdown(false)
  }, [])

  const handleBack = useCallback(() => {
    if (editingNoteId) {
      saveNote(editingNoteId, title, content)
    }
    setEditingNoteId(null)
    setDeletingNoteId(null)
    setPreviewMode(false)
    setShowCategoryDropdown(false)
  }, [editingNoteId, title, content, saveNote])

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTitle(val)
    if (editingNoteId) scheduleAutoSave(editingNoteId, val, content)
  }, [editingNoteId, content, scheduleAutoSave])

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
  }, [editingNoteId, title, scheduleAutoSave])

  const handleDeleteNote = useCallback((noteId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deletingNoteId === noteId) {
      const updated = notes.filter(n => n.id !== noteId)
      persistNotes(updated)
      setDeletingNoteId(null)
      if (editingNoteId === noteId) {
        setEditingNoteId(null)
      }
    } else {
      setDeletingNoteId(noteId)
    }
  }, [deletingNoteId, notes, editingNoteId, persistNotes])

  // Clear delete confirmation when clicking elsewhere
  useEffect(() => {
    if (!deletingNoteId) return
    const timer = setTimeout(() => setDeletingNoteId(null), 3000)
    return () => clearTimeout(timer)
  }, [deletingNoteId])

  const handleSendToChat = useCallback((note: Note, e: React.MouseEvent) => {
    e.stopPropagation()
    const noteTitle = note.title || t('notes.untitled')
    const text = note.content
      ? `[Note: ${noteTitle}]\n${note.content}`
      : `[Note: ${noteTitle}]`
    setQuotedText(text)
    addToast('success', t('notes.sentToChat'), 2000)
  }, [t, setQuotedText, addToast])

  // ── Category management handlers ──
  const handleAddCategory = useCallback(() => {
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
  }, [newCategoryName, categories, newCategoryColor, persistCategories])

  const handleDeleteCategory = useCallback((catId: string) => {
    if (deletingCategoryId === catId) {
      const updatedCategories = categories.filter(c => c.id !== catId)
      persistCategories(updatedCategories)
      const updatedNotes = notes.map(n =>
        n.categoryId === catId ? { ...n, categoryId: undefined, updatedAt: Date.now() } : n
      )
      persistNotes(updatedNotes)
      setDeletingCategoryId(null)
      if (activeCategoryFilter === catId) setActiveCategoryFilter(null)
      addToast('success', t('notes.categoryDeleted'), 2000)
    } else {
      setDeletingCategoryId(catId)
    }
  }, [deletingCategoryId, categories, notes, activeCategoryFilter, persistCategories, persistNotes, addToast, t])

  // Clear category delete confirmation after timeout
  useEffect(() => {
    if (!deletingCategoryId) return
    const timer = setTimeout(() => setDeletingCategoryId(null), 3000)
    return () => clearTimeout(timer)
  }, [deletingCategoryId])

  const handleRenameCategoryStart = useCallback((cat: NoteCategory) => {
    setEditingCategoryId(cat.id)
    setEditingCategoryName(cat.name)
  }, [])

  const handleRenameCategorySave = useCallback(() => {
    if (!editingCategoryId) return
    const name = editingCategoryName.trim().slice(0, MAX_CATEGORY_NAME)
    if (!name) { setEditingCategoryId(null); return }
    const updated = categories.map(c =>
      c.id === editingCategoryId ? { ...c, name } : c
    )
    persistCategories(updated)
    setEditingCategoryId(null)
  }, [editingCategoryId, editingCategoryName, categories, persistCategories])

  const handleSetNoteCategory = useCallback((categoryId: string | undefined) => {
    if (!editingNoteId) return
    const currentNotes: Note[] = usePrefsStore.getState().prefs.notes || []
    const updated = currentNotes.map(n =>
      n.id === editingNoteId ? { ...n, categoryId, updatedAt: Date.now() } : n
    )
    persistNotes(updated)
    setShowCategoryDropdown(false)
  }, [editingNoteId, persistNotes])

  const handleTogglePin = useCallback((noteId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const currentNotes: Note[] = usePrefsStore.getState().prefs.notes || []
    const updated = currentNotes.map(n =>
      n.id === noteId ? { ...n, pinned: !n.pinned } : n
    )
    persistNotes(updated)
  }, [persistNotes])

  const handleDuplicateNote = useCallback((noteId: string) => {
    const currentNotes: Note[] = usePrefsStore.getState().prefs.notes || []
    if (currentNotes.length >= MAX_NOTES) {
      addToast('warning', t('notes.maxNotesReached'))
      return
    }
    const original = currentNotes.find(n => n.id === noteId)
    if (!original) return
    const now = Date.now()
    const duplicateTitle = `${original.title || t('notes.untitled')} (${t('notes.copy')})`
    const newNote: Note = {
      id: generateId('note'),
      title: duplicateTitle,
      content: original.content,
      createdAt: now,
      updatedAt: now,
      categoryId: original.categoryId,
    }
    const updated = [newNote, ...currentNotes]
    persistNotes(updated)
    setEditingNoteId(newNote.id)
    setTitle(duplicateTitle)
    setContent(newNote.content)
    addToast('success', t('notes.duplicated'))
  }, [persistNotes, addToast, t])

  const getCategoryById = useCallback((id?: string): NoteCategory | undefined => {
    if (!id) return undefined
    return categories.find(c => c.id === id)
  }, [categories])

  const editingNote = editingNoteId ? notes.find(n => n.id === editingNoteId) : null

  return {
    // Data
    notes,
    categories,
    editingNote,
    editingNoteId,
    deletingNoteId,
    title,
    content,
    previewMode,
    activeCategoryFilter,
    showCategoryManager,
    newCategoryName,
    newCategoryColor,
    editingCategoryId,
    editingCategoryName,
    deletingCategoryId,
    showCategoryDropdown,
    saveStatus,

    // Setters
    setTitle,
    setContent,
    setPreviewMode,
    setActiveCategoryFilter,
    setShowCategoryManager,
    setNewCategoryName,
    setNewCategoryColor,
    setEditingCategoryId,
    setEditingCategoryName,
    setShowCategoryDropdown,

    // Handlers
    handleCreateNote,
    handleOpenNote,
    handleBack,
    handleTitleChange,
    handleContentChange,
    handleDeleteNote,
    handleSendToChat,
    handleAddCategory,
    handleDeleteCategory,
    handleRenameCategoryStart,
    handleRenameCategorySave,
    handleSetNoteCategory,
    handleTogglePin,
    handleDuplicateNote,
    getCategoryById,
    saveNote,
  }
}
