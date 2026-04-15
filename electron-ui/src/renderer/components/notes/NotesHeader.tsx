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
      padding: '12px 14px 8px',
      background: 'rgba(15,15,25,0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
          {t('notes.title')}
        </span>
        {noteCount > 0 && (
          <span style={{
            background: 'rgba(99,102,241,0.15)',
            color: '#818cf8',
            borderRadius: 10,
            padding: '1px 7px',
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {noteCount}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Sort button */}
        {noteCount > 0 && (
          <button
            onClick={onSortChange}
            title={`${t('notes.sort')}: ${noteSortBy === 'modified' ? t('notes.sortModified') : noteSortBy === 'created' ? t('notes.sortCreated') : t('notes.sortAlpha')}`}
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 10,
              padding: '4px 7px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-muted)' }}
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
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px 6px',
              fontSize: 12,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-muted)' }}
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
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-muted)',
            cursor: atLimit ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '4px 6px',
            fontSize: 12,
            opacity: atLimit ? 0.5 : 1,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { if (!atLimit) { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-muted)' }}
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
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: 'none',
                borderRadius: '7px 0 0 7px',
                color: 'rgba(255,255,255,0.95)',
                cursor: atLimit ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 600,
                opacity: atLimit ? 0.5 : 1,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { if (!atLimit) { e.currentTarget.style.filter = 'brightness(0.95)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)' } }}
              onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
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
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: 'none',
                borderLeft: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '0 7px 7px 0',
                color: 'rgba(255,255,255,0.95)',
                cursor: atLimit ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '5px 5px',
                opacity: atLimit ? 0.5 : 1,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { if (!atLimit) { e.currentTarget.style.filter = 'brightness(0.95)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = '' }}
            >
              <ChevronDown size={12} />
            </button>
          </div>
          {/* Template dropdown menu — glass popup */}
          {showTemplateMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: 'var(--popup-bg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              padding: '4px 0',
              zIndex: 50,
              minWidth: 160,
              animation: 'slideUp 0.15s ease',
            }}>
              <div style={{
                padding: '4px 12px 6px',
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                lineHeight: 1,
              }}>
                {t('notes.templates')}
              </div>
              <div style={{ height: 1, background: 'var(--bg-hover)', margin: '0 8px 4px' }} />
              {NOTE_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.labelKey}
                  onClick={() => handleCreateFromTemplate(tmpl)}
                  style={{
                    display: 'block',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    borderRadius: 8,
                    margin: '1px 4px',
                    width: 'calc(100% - 8px)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
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
