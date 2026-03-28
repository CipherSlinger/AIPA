import { useMemo } from 'react'
import { Note, NoteCategory } from '../../types/app.types'

export function useNotesSearch(
  notes: Note[],
  categories: NoteCategory[],
  searchQuery: string,
  activeCategoryFilter: string | null,
) {
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
    // Sort: pinned notes first, then by updatedAt descending
    result = [...result].sort((a, b) => {
      const aPinned = a.pinned ? 1 : 0
      const bPinned = b.pinned ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return b.updatedAt - a.updatedAt
    })
    return result
  }, [notes, searchQuery, activeCategoryFilter])

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

  return { filteredNotes, categoryCounts }
}
