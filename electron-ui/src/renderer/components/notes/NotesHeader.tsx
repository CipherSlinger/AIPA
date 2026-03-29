import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, FolderDown, FolderUp, ArrowUpDown, ChevronDown } from 'lucide-react'
import { useT } from '../../i18n'
import { MAX_NOTES } from './notesConstants'

interface NoteTemplate {
  labelKey: string
  titleKey: string
  contentKey: string
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    labelKey: 'notes.templateMeeting',
    titleKey: 'notes.templateMeeting',
    contentKey: 'notes.templateMeetingContent',
  },
  {
    labelKey: 'notes.templateTodo',
    titleKey: 'notes.templateTodo',
    contentKey: 'notes.templateTodoContent',
  },
  {
    labelKey: 'notes.templateJournal',
    titleKey: 'notes.templateJournal',
    contentKey: 'notes.templateJournalContent',
  },
  {
    labelKey: 'notes.templateIdea',
    titleKey: 'notes.templateIdea',
    contentKey: 'notes.templateIdeaContent',
  },
]

interface NotesHeaderProps {
  noteCount: number
  noteSortBy: 'modified' | 'created' | 'alpha'
  onSortChange: () => void
  onExportAll: () => void
  onImportNotes: () => void
  onCreateNote: () => void
  onCreateFromTemplate: (title: string, content: string) => void
}

export default function NotesHeader({
  noteCount,
  noteSortBy,
  onSortChange,
  onExportAll,
  onImportNotes,
  onCreateNote,
  onCreateFromTemplate,
}: NotesHeaderProps) {
  const t = useT()
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const templateMenuRef = useRef<HTMLDivElement>(null)

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
    const title = t(template.titleKey)
    const dateStr = new Date().toLocaleDateString()
    const content = t(template.contentKey, { date: dateStr })
    onCreateFromTemplate(title, content)
    setShowTemplateMenu(false)
  }, [onCreateFromTemplate, t])

  const atLimit = noteCount >= MAX_NOTES

  return (
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
        {noteCount > 0 && (
          <button
            onClick={onSortChange}
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
        {noteCount > 0 && (
          <button
            onClick={onExportAll}
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
          onClick={onImportNotes}
          aria-label={t('notes.importNotes')}
          title={t('notes.importNotes')}
          disabled={atLimit}
          style={{
            background: 'none',
            border: '1px solid var(--card-border)',
            borderRadius: 6,
            color: 'var(--text-muted)',
            cursor: atLimit ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            fontSize: 12,
            opacity: atLimit ? 0.5 : 1,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { if (!atLimit) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' } }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <FolderUp size={14} />
        </button>
        {/* New Note button with template dropdown */}
        <div style={{ position: 'relative' }} ref={templateMenuRef}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={onCreateNote}
              aria-label={t('notes.newNote')}
              disabled={atLimit}
              style={{
                background: 'none',
                border: '1px solid var(--card-border)',
                borderRight: 'none',
                borderRadius: '6px 0 0 6px',
                color: 'var(--accent)',
                cursor: atLimit ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px 4px 10px',
                fontSize: 12,
                opacity: atLimit ? 0.5 : 1,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { if (!atLimit) e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)' }}
            >
              <Plus size={14} />
              {t('notes.newNote')}
            </button>
            <button
              onClick={() => setShowTemplateMenu(!showTemplateMenu)}
              disabled={atLimit}
              aria-label={t('notes.fromTemplate')}
              title={t('notes.fromTemplate')}
              style={{
                background: 'none',
                border: '1px solid var(--card-border)',
                borderRadius: '0 6px 6px 0',
                color: 'var(--accent)',
                cursor: atLimit ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px 4px',
                opacity: atLimit ? 0.5 : 1,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { if (!atLimit) e.currentTarget.style.borderColor = 'var(--accent)' }}
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
  )
}
