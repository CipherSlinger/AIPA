import React, { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { useT } from '../../i18n'
import { useNotesCRUD } from './useNotesCRUD'
import { useNotesSearch } from './useNotesSearch'
import { useNotesIO } from './useNotesIO'
import NoteEditor from './NoteEditor'
import NoteList from './NoteList'
import NotesHeader from './NotesHeader'
import CategoryFilterBar from './CategoryFilterBar'
import CategoryManager from './CategoryManager'

export default function NotesPanel() {
  const t = useT()
  const crud = useNotesCRUD()
  const [searchQuery, setSearchQuery] = useState('')
  const [noteSortBy, setNoteSortBy] = useState<'modified' | 'created' | 'alpha'>(() => {
    try {
      const stored = localStorage.getItem('aipa:note-sort')
      if (stored === 'modified' || stored === 'created' || stored === 'alpha') return stored
    } catch {}
    return 'modified'
  })
  const [, setTick] = useState(0)

  const { filteredNotes, categoryCounts } = useNotesSearch(
    crud.notes,
    crud.categories,
    searchQuery,
    crud.activeCategoryFilter,
    noteSortBy,
  )

  const { handleExportAll, handleImportNotes } = useNotesIO(
    crud.notes,
    filteredNotes,
    crud.activeCategoryFilter,
  )

  // Refresh relative timestamps every 30s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  const handleSortChange = () => {
    setNoteSortBy(prev => {
      const next = prev === 'modified' ? 'created' : prev === 'created' ? 'alpha' : 'modified'
      try { localStorage.setItem('aipa:note-sort', next) } catch {}
      return next
    })
  }

  // ── Editor View ──
  if (crud.editingNoteId && crud.editingNote) {
    return (
      <NoteEditor
        note={crud.editingNote}
        title={crud.title}
        content={crud.content}
        previewMode={crud.previewMode}
        categories={crud.categories}
        showCategoryDropdown={crud.showCategoryDropdown}
        deletingNoteId={crud.deletingNoteId}
        onTitleChange={crud.handleTitleChange}
        onContentChange={crud.handleContentChange}
        onBack={crud.handleBack}
        onDelete={crud.handleDeleteNote}
        onSetCategory={crud.handleSetNoteCategory}
        onToggleCategoryDropdown={() => crud.setShowCategoryDropdown(!crud.showCategoryDropdown)}
        onSetPreviewMode={crud.setPreviewMode}
        onSave={crud.saveNote}
        onTogglePin={crud.handleTogglePin}
        onDuplicate={crud.handleDuplicateNote}
        getCategoryById={crud.getCategoryById}
        saveStatus={crud.saveStatus}
      />
    )
  }

  // ── List View ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with sort, export, import, new note */}
      <NotesHeader
        noteCount={crud.notes.length}
        noteSortBy={noteSortBy}
        onSortChange={handleSortChange}
        onExportAll={handleExportAll}
        onImportNotes={handleImportNotes}
        onCreateNote={() => crud.handleCreateNote()}
        onCreateFromTemplate={(title, content) => crud.handleCreateNote(title, content)}
      />

      {/* Search bar */}
      {crud.notes.length > 0 && (
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
      <CategoryFilterBar
        categories={crud.categories}
        totalNotes={crud.notes.length}
        activeCategoryFilter={crud.activeCategoryFilter}
        categoryCounts={categoryCounts}
        showCategoryManager={crud.showCategoryManager}
        hasNotes={crud.notes.length > 0}
        onFilterChange={crud.setActiveCategoryFilter}
        onToggleManager={() => crud.setShowCategoryManager(!crud.showCategoryManager)}
      />

      {/* Category management panel */}
      {crud.showCategoryManager && (
        <CategoryManager
          categories={crud.categories}
          categoryCounts={categoryCounts}
          newCategoryName={crud.newCategoryName}
          newCategoryColor={crud.newCategoryColor}
          editingCategoryId={crud.editingCategoryId}
          editingCategoryName={crud.editingCategoryName}
          deletingCategoryId={crud.deletingCategoryId}
          onNewCategoryNameChange={crud.setNewCategoryName}
          onNewCategoryColorChange={crud.setNewCategoryColor}
          onAdd={crud.handleAddCategory}
          onDelete={crud.handleDeleteCategory}
          onRenameStart={crud.handleRenameCategoryStart}
          onRenameSave={crud.handleRenameCategorySave}
          onEditingCategoryNameChange={crud.setEditingCategoryName}
          onEditingCategoryIdChange={crud.setEditingCategoryId}
          onClose={() => crud.setShowCategoryManager(false)}
        />
      )}

      {/* Note list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <NoteList
          notes={crud.notes}
          filteredNotes={filteredNotes}
          hasNotes={crud.notes.length > 0}
          deletingNoteId={crud.deletingNoteId}
          searchQuery={searchQuery}
          onOpen={crud.handleOpenNote}
          onDelete={crud.handleDeleteNote}
          onSendToChat={crud.handleSendToChat}
          onTogglePin={crud.handleTogglePin}
          getCategoryById={crud.getCategoryById}
        />
      </div>
    </div>
  )
}
