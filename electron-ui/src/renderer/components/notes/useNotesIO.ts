import { useCallback } from 'react'
import { useT } from '../../i18n'
import { useUiStore, usePrefsStore } from '../../store'
import { Note } from '../../types/app.types'
import { MAX_NOTES, MAX_CONTENT_LENGTH } from './notesConstants'

/**
 * Hook for notes import/export functionality.
 * Extracted from NotesPanel to isolate file I/O logic.
 */
export function useNotesIO(
  notes: Note[],
  filteredNotes: Note[],
  activeCategoryFilter: string | null,
) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)

  // Bulk export notes as individual .md files to a selected folder
  const handleExportAll = useCallback(async () => {
    const notesToExport = filteredNotes
    if (notesToExport.length === 0) {
      addToast('warning', t('notes.exportNoNotes'))
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
        addToast('success', t('notes.exportAllSuccess', { count: String(exported) }))
      } else {
        addToast('error', t('notes.exportFailed', { error: 'No files were written' }))
      }
    } catch (err) {
      addToast('error', t('notes.exportFailed', { error: String(err) }))
    }
  }, [filteredNotes, addToast, t])

  // Import notes from .md/.txt files
  const handleImportNotes = useCallback(async () => {
    const available = MAX_NOTES - notes.length
    if (available <= 0) {
      addToast('warning', t('notes.maxNotesReached'))
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
      const newNotes: Note[] = []
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
          categoryId: activeCategoryFilter || undefined,
        })
      }
      if (newNotes.length > 0) {
        const updated = [...newNotes, ...notes]
        const setPrefs = usePrefsStore.getState().setPrefs
        setPrefs({ notes: updated })
        window.electronAPI.prefsSet('notes', updated)
        addToast('success', t('notes.importSuccess', { count: String(newNotes.length) }))
      } else {
        addToast('error', t('notes.importFailed', { error: 'No files could be read' }))
      }
    } catch (err) {
      addToast('error', t('notes.importFailed', { error: String(err) }))
    }
  }, [notes, activeCategoryFilter, addToast, t])

  return { handleExportAll, handleImportNotes }
}
