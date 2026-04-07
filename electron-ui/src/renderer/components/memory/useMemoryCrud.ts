import { useState, useCallback, useMemo } from 'react'
import { usePrefsStore, useUiStore } from '../../store'
import { MemoryItem, MemoryCategory, MemoryType } from '../../types/app.types'
import { MAX_MEMORIES, MAX_CONTENT_LENGTH, CATEGORIES, fuzzyScore, suggestCategory, suggestMemoryType } from './memoryConstants'

export function useMemoryCrud() {
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const addToast = useUiStore(s => s.addToast)

  // Defensive: ensure memories is always a valid array (Iteration 309 -- crash fix)
  const rawMemories: MemoryItem[] = prefs.memories || []
  const memories = Array.isArray(rawMemories) ? rawMemories.filter(
    (m): m is MemoryItem => m != null && typeof m === 'object' && typeof m.id === 'string' && typeof m.content === 'string'
  ) : []

  // UI state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<MemoryCategory | 'all'>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editCategory, setEditCategory] = useState<MemoryCategory>('fact')
  const [editMemoryType, setEditMemoryType] = useState<MemoryType | undefined>(undefined)
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<MemoryCategory>('fact')
  const [newMemoryType, setNewMemoryType] = useState<MemoryType | undefined>(undefined)
  const [autoSuggested, setAutoSuggested] = useState(false)

  const saveMemories = useCallback((updated: MemoryItem[]) => {
    setPrefs({ memories: updated })
    window.electronAPI.prefsSet('memories', updated)
  }, [setPrefs])

  const handleNewContentChange = useCallback((content: string) => {
    setNewContent(content)
    // Auto-suggest category only if user hasn't manually picked one yet
    if (content.trim().length > 10 && !autoSuggested) {
      const suggested = suggestCategory(content)
      setNewCategory(suggested)
      // Also auto-suggest memoryType (Iteration 480)
      const suggestedType = suggestMemoryType(content)
      setNewMemoryType(suggestedType)
    }
  }, [autoSuggested])

  const addMemory = useCallback((t: (key: string) => string) => {
    if (!newContent.trim()) return
    if (memories.length >= MAX_MEMORIES) {
      addToast('error', t('memory.limitReached'))
      return
    }
    const item: MemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: newContent.trim().slice(0, MAX_CONTENT_LENGTH),
      category: newCategory,
      memoryType: newMemoryType,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    saveMemories([item, ...memories])
    setNewContent('')
    setNewMemoryType(undefined)
    setShowAddForm(false)
    setAutoSuggested(false)
    addToast('success', t('memory.added'))
  }, [newContent, newCategory, newMemoryType, memories, saveMemories, addToast])

  const deleteMemory = useCallback((id: string, t: (key: string) => string) => {
    saveMemories(memories.filter(m => m.id !== id))
    addToast('info', t('memory.deleted'))
  }, [memories, saveMemories, addToast])

  const togglePin = useCallback((id: string) => {
    saveMemories(memories.map(m =>
      m.id === id ? { ...m, pinned: !m.pinned, updatedAt: Date.now() } : m
    ))
  }, [memories, saveMemories])

  const startEdit = useCallback((mem: MemoryItem) => {
    setEditingId(mem.id)
    setEditContent(mem.content)
    setEditCategory(mem.category)
    setEditMemoryType(mem.memoryType)
  }, [])

  const saveEdit = useCallback((t: (key: string) => string) => {
    if (!editContent.trim() || !editingId) return
    saveMemories(memories.map(m =>
      m.id === editingId
        ? { ...m, content: editContent.trim().slice(0, MAX_CONTENT_LENGTH), category: editCategory, memoryType: editMemoryType, updatedAt: Date.now() }
        : m
    ))
    setEditingId(null)
    addToast('success', t('memory.updated'))
  }, [editingId, editContent, editCategory, editMemoryType, memories, saveMemories, addToast])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  const clearAllMemories = useCallback((t: (key: string) => string) => {
    if (memories.length === 0) return
    saveMemories([])
    addToast('info', t('memory.clearedAll'))
  }, [memories, saveMemories, addToast])

  // Filtered + sorted memories with fuzzy search and relevance ranking
  const filteredMemories = useMemo(() => {
    let result = [...memories]
    // Filter by category
    if (filterCategory !== 'all') {
      result = result.filter(m => m.category === filterCategory)
    }
    // Filter and score by search
    if (searchQuery.trim()) {
      const scored = result.map(m => ({
        memory: m,
        score: fuzzyScore(m.content, searchQuery),
      })).filter(s => s.score > 0)
      // Sort by score descending, then by pinned, then by updatedAt
      scored.sort((a, b) => {
        if (a.memory.pinned && !b.memory.pinned) return -1
        if (!a.memory.pinned && b.memory.pinned) return 1
        if (a.score !== b.score) return b.score - a.score
        return b.memory.updatedAt - a.memory.updatedAt
      })
      return scored.map(s => s.memory)
    }
    // Sort: pinned first, then by updatedAt desc
    result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.updatedAt - a.updatedAt
    })
    return result
  }, [memories, filterCategory, searchQuery])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: memories.length }
    for (const cat of CATEGORIES) {
      counts[cat] = memories.filter(m => m.category === cat).length
    }
    return counts
  }, [memories])

  return {
    // Data
    memories,
    filteredMemories,
    categoryCounts,
    // Search/filter
    searchQuery, setSearchQuery,
    filterCategory, setFilterCategory,
    // Add form
    showAddForm, setShowAddForm,
    newContent, newCategory, setNewCategory,
    newMemoryType, setNewMemoryType,
    autoSuggested, setAutoSuggested,
    handleNewContentChange, addMemory,
    // Edit
    editingId, editContent, setEditContent,
    editCategory, setEditCategory,
    editMemoryType, setEditMemoryType,
    startEdit, saveEdit, cancelEdit,
    // Actions
    deleteMemory, togglePin, clearAllMemories,
  }
}
