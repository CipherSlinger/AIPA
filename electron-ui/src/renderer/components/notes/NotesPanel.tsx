import React, { useState, useEffect } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useT } from '../../i18n'
import { useNotesCRUD } from './useNotesCRUD'
import { useNotesSearch } from './useNotesSearch'
import { MAX_NOTES } from './notesConstants'
import NoteEditor from './NoteEditor'
import NoteList from './NoteList'
import CategoryFilterBar from './CategoryFilterBar'
import CategoryManager from './CategoryManager'

export default function NotesPanel() {
  const t = useT()
  const crud = useNotesCRUD()
  const [searchQuery, setSearchQuery] = useState('')
  const [, setTick] = useState(0)

  const { filteredNotes, categoryCounts } = useNotesSearch(
    crud.notes,
    crud.categories,
    searchQuery,
    crud.activeCategoryFilter,
  )

  // Refresh relative timestamps every 30s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

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
        getCategoryById={crud.getCategoryById}
      />
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
          onClick={crud.handleCreateNote}
          aria-label={t('notes.newNote')}
          disabled={crud.notes.length >= MAX_NOTES}
          style={{
            background: 'none',
            border: '1px solid var(--card-border)',
            borderRadius: 6,
            color: 'var(--accent)',
            cursor: crud.notes.length >= MAX_NOTES ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            fontSize: 12,
            opacity: crud.notes.length >= MAX_NOTES ? 0.5 : 1,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { if (crud.notes.length < MAX_NOTES) e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)' }}
        >
          <Plus size={14} />
          {t('notes.newNote')}
        </button>
      </div>

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
          onOpen={crud.handleOpenNote}
          onDelete={crud.handleDeleteNote}
          onSendToChat={crud.handleSendToChat}
          getCategoryById={crud.getCategoryById}
        />
      </div>
    </div>
  )
}
