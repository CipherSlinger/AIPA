import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Search, X, FolderDown, FolderUp, ArrowUpDown, ChevronDown } from 'lucide-react'
import { useT } from '../../i18n'
import { useUiStore, usePrefsStore } from '../../store'
import { useNotesCRUD } from './useNotesCRUD'
import { useNotesSearch } from './useNotesSearch'
import { MAX_NOTES, MAX_CONTENT_LENGTH } from './notesConstants'
import NoteEditor from './NoteEditor'
import NoteList from './NoteList'
import CategoryFilterBar from './CategoryFilterBar'
import CategoryManager from './CategoryManager'

interface NoteTemplate {
  labelKey: string
  title: string
  content: string
}

const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    labelKey: 'notes.templateMeeting',
    title: 'Meeting Notes',
    content: `# Meeting Notes

**Date:** ${new Date().toLocaleDateString()}
**Attendees:**
-

## Agenda
1.

## Discussion


## Action Items
- [ ]
- [ ]

## Next Steps

`,
  },
  {
    labelKey: 'notes.templateTodo',
    title: 'To-Do List',
    content: `# To-Do List

## High Priority
- [ ]
- [ ]

## Medium Priority
- [ ]
- [ ]

## Low Priority
- [ ]

## Completed
- [x]
`,
  },
  {
    labelKey: 'notes.templateJournal',
    title: 'Journal Entry',
    content: `# Journal — ${new Date().toLocaleDateString()}

## What I accomplished today


## What I learned


## What I want to do tomorrow


## Notes & Thoughts

`,
  },
  {
    labelKey: 'notes.templateIdea',
    title: 'Idea',
    content: `# Idea:

## Problem


## Proposed Solution


## Benefits


## Risks / Concerns


## Next Steps
- [ ]
`,
  },
]

export default function NotesPanel() {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
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
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const templateMenuRef = React.useRef<HTMLDivElement>(null)

  const { filteredNotes, categoryCounts } = useNotesSearch(
    crud.notes,
    crud.categories,
    searchQuery,
    crud.activeCategoryFilter,
    noteSortBy,
  )

  // Refresh relative timestamps every 30s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  // Close template menu on click outside
  useEffect(() => {
    if (!showTemplateMenu) return
    const handler = (e: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target as Node)) {
        setShowTemplateMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTemplateMenu])

  const handleCreateFromTemplate = useCallback((template: NoteTemplate) => {
    crud.handleCreateNote(template.title, template.content)
    setShowTemplateMenu(false)
  }, [crud])

  // Bulk export notes as individual .md files to a selected folder
  const handleExportAll = useCallback(async () => {
    const notesToExport = filteredNotes
    if (notesToExport.length === 0) {
      addToast(t('notes.exportNoNotes'), 'warning')
      return
    }
    try {
      const api = (window as unknown as { electronAPI: { fsShowOpenDialog: () => Promise<string | null>; fsWriteFile: (filePath: string, content: string) => Promise<{ success?: boolean; error?: string }> } }).electronAPI
      const dirPath = await api.fsShowOpenDialog()
      if (!dirPath) return // user cancelled

      let exported = 0
      const usedNames = new Set<string>()
      for (const note of notesToExport) {
        let baseName = (note.title || t('notes.untitled')).replace(/[<>:"/\\|?*]/g, '_').slice(0, 50)
        // Deduplicate filenames
        let fileName = baseName
        let counter = 1
        while (usedNames.has(fileName.toLowerCase())) {
          fileName = `${baseName} (${counter})`
          counter++
        }
        usedNames.add(fileName.toLowerCase())
        const filePath = `${dirPath}/${fileName}.md`
        const result = await api.fsWriteFile(filePath, note.content)
        if (!result?.error) exported++
      }
      if (exported > 0) {
        addToast(t('notes.exportAllSuccess', { count: String(exported) }), 'success')
      } else {
        addToast(t('notes.exportFailed', { error: 'No files were written' }), 'error')
      }
    } catch (err) {
      addToast(t('notes.exportFailed', { error: String(err) }), 'error')
    }
  }, [filteredNotes, addToast, t])

  // Import notes from .md/.txt files
  const handleImportNotes = useCallback(async () => {
    const available = MAX_NOTES - crud.notes.length
    if (available <= 0) {
      addToast(t('notes.maxNotesReached'), 'warning')
      return
    }
    try {
      const api = (window as unknown as { electronAPI: { fsShowOpenFileDialog: (filters?: { name: string; extensions: string[] }[], multiSelections?: boolean) => Promise<string[] | null>; fsReadFile: (filePath: string) => Promise<{ content?: string; error?: string }> } }).electronAPI
      const filePaths = await api.fsShowOpenFileDialog(
        [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        true,
      )
      if (!filePaths || filePaths.length === 0) return // user cancelled

      const toImport = filePaths.slice(0, available)
      const newNotes = []
      for (const fp of toImport) {
        const result = await api.fsReadFile(fp)
        if (result?.error || !result?.content) continue
        // Extract title from filename (without extension)
        const fileName = fp.split(/[/\\]/).pop() || t('notes.untitled')
        const titleFromFile = fileName.replace(/\.(md|txt|markdown)$/i, '')
        // Auto-extract title from first heading if present
        const headingMatch = result.content.match(/^#{1,3}\s+(.+)/m)
        const noteTitle = headingMatch ? headingMatch[1].trim() : titleFromFile

        const now = Date.now() + newNotes.length // offset to ensure unique timestamps
        newNotes.push({
          id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
          title: noteTitle.slice(0, 100),
          content: result.content.slice(0, MAX_CONTENT_LENGTH),
          createdAt: now,
          updatedAt: now,
          categoryId: crud.activeCategoryFilter || undefined,
        })
      }
      if (newNotes.length > 0) {
        const updated = [...newNotes, ...crud.notes]
        const setPrefs = usePrefsStore.getState().setPrefs
        setPrefs({ notes: updated })
        window.electronAPI.prefsSet('notes', updated)
        addToast(t('notes.importSuccess', { count: String(newNotes.length) }), 'success')
      } else {
        addToast(t('notes.importFailed', { error: 'No files could be read' }), 'error')
      }
    } catch (err) {
      addToast(t('notes.importFailed', { error: String(err) }), 'error')
    }
  }, [crud.notes, crud.activeCategoryFilter, addToast, t])

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
        getCategoryById={crud.getCategoryById}
        saveStatus={crud.saveStatus}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Sort button */}
          {crud.notes.length > 0 && (
            <button
              onClick={() => setNoteSortBy(prev => {
                const next = prev === 'modified' ? 'created' : prev === 'created' ? 'alpha' : 'modified'
                try { localStorage.setItem('aipa:note-sort', next) } catch {}
                return next
              })}
              title={`${t('notes.sort')}: ${noteSortBy === 'modified' ? t('notes.sortModified') : noteSortBy === 'created' ? t('notes.sortCreated') : t('notes.sortAlpha')}`}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                fontSize: 10,
                padding: '4px',
              }}
            >
              <ArrowUpDown size={11} />
              <span>{noteSortBy === 'modified' ? t('notes.sortMod') : noteSortBy === 'created' ? t('notes.sortNew') : 'A-Z'}</span>
            </button>
          )}
          {/* Export All button */}
          {crud.notes.length > 0 && (
            <button
              onClick={handleExportAll}
              aria-label={t('notes.exportAll')}
              title={t('notes.exportAll')}
              style={{
                background: 'none',
                border: '1px solid var(--card-border)',
                borderRadius: 6,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px 8px',
                fontSize: 12,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <FolderDown size={14} />
            </button>
          )}
          {/* Import button */}
          <button
            onClick={handleImportNotes}
            aria-label={t('notes.importNotes')}
            title={t('notes.importNotes')}
            disabled={crud.notes.length >= MAX_NOTES}
            style={{
              background: 'none',
              border: '1px solid var(--card-border)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              cursor: crud.notes.length >= MAX_NOTES ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px 8px',
              fontSize: 12,
              opacity: crud.notes.length >= MAX_NOTES ? 0.5 : 1,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (crud.notes.length < MAX_NOTES) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <FolderUp size={14} />
          </button>
          {/* New Note button with template dropdown */}
          <div style={{ position: 'relative' }} ref={templateMenuRef}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => crud.handleCreateNote()}
                aria-label={t('notes.newNote')}
                disabled={crud.notes.length >= MAX_NOTES}
                style={{
                  background: 'none',
                  border: '1px solid var(--card-border)',
                  borderRight: 'none',
                  borderRadius: '6px 0 0 6px',
                  color: 'var(--accent)',
                  cursor: crud.notes.length >= MAX_NOTES ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px 4px 10px',
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
              <button
                onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                disabled={crud.notes.length >= MAX_NOTES}
                aria-label={t('notes.fromTemplate')}
                title={t('notes.fromTemplate')}
                style={{
                  background: 'none',
                  border: '1px solid var(--card-border)',
                  borderRadius: '0 6px 6px 0',
                  color: 'var(--accent)',
                  cursor: crud.notes.length >= MAX_NOTES ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 4px',
                  opacity: crud.notes.length >= MAX_NOTES ? 0.5 : 1,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { if (crud.notes.length < MAX_NOTES) e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)' }}
              >
                <ChevronDown size={12} />
              </button>
            </div>
            {/* Template dropdown menu */}
            {showTemplateMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: 'var(--popup-bg)',
                border: '1px solid var(--popup-border)',
                borderRadius: 8,
                boxShadow: 'var(--popup-shadow)',
                padding: '4px 0',
                zIndex: 50,
                minWidth: 160,
                animation: 'popup-in 0.12s ease',
              }}>
                <div style={{ padding: '4px 12px 6px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('notes.templates')}
                </div>
                {NOTE_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.labelKey}
                    onClick={() => handleCreateFromTemplate(tmpl)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--popup-item-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {t(tmpl.labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
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
          onTogglePin={crud.handleTogglePin}
          getCategoryById={crud.getCategoryById}
        />
      </div>
    </div>
  )
}
