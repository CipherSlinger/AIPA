import React from 'react'
import { ArrowLeft, Trash2, Download, Pin, Loader2, Copy, Check, MessageSquare } from 'lucide-react'
import { useT } from '../../i18n'
import { Note } from '../../types/app.types'
import { MAX_CONTENT_LENGTH } from './notesConstants'

interface NoteEditorHeaderProps {
  note: Note
  content: string
  title: string
  previewMode: boolean
  saveStatus: 'idle' | 'saving' | 'saved'
  onBack: () => void
  onSetPreviewMode: (preview: boolean) => void
  onSave: (noteId: string, title: string, content: string) => void
  onExport: () => void
  onDuplicate?: (noteId: string) => void
  onTogglePin: (noteId: string, e?: React.MouseEvent) => void
}

export default function NoteEditorHeader({
  note,
  content,
  title,
  previewMode,
  saveStatus,
  onBack,
  onSetPreviewMode,
  onSave,
  onExport,
  onDuplicate,
  onTogglePin,
}: NoteEditorHeaderProps) {
  const t = useT()

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <button
        onClick={onBack}
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
          onClick={() => { if (previewMode) { onSetPreviewMode(false) } }}
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
              onSave(note.id, title, content)
              onSetPreviewMode(true)
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

      {/* Export button */}
      <button
        onClick={onExport}
        aria-label={t('notes.exportNote')}
        title={t('notes.exportNote')}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: 4,
          borderRadius: 4,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        <Download size={14} />
      </button>

      {/* Duplicate button */}
      {onDuplicate && (
        <button
          onClick={() => onDuplicate(note.id)}
          aria-label={t('notes.duplicate')}
          title={t('notes.duplicate')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: 4,
            borderRadius: 4,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          <Copy size={14} />
        </button>
      )}

      {/* Pin toggle */}
      <button
        onClick={(e) => onTogglePin(note.id, e)}
        aria-label={note.pinned ? t('notes.unpin') : t('notes.pin')}
        title={note.pinned ? t('notes.unpin') : t('notes.pin')}
        style={{
          background: 'none',
          border: 'none',
          color: note.pinned ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: 4,
          borderRadius: 4,
          transition: 'color 0.15s',
          transform: 'rotate(45deg)',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.color = note.pinned ? 'var(--accent)' : 'var(--text-muted)'}
      >
        <Pin size={14} style={{ fill: note.pinned ? 'var(--accent)' : 'none' }} />
      </button>

      {/* Pin to Chat (Iteration 439) */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('aipa:pinNoteToChat', { detail: note.id }))}
        aria-label={t('notes.pinToChat')}
        title={t('notes.pinToChat')}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: 4,
          borderRadius: 4,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        <MessageSquare size={14} />
      </button>

      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>{content.length} / {MAX_CONTENT_LENGTH.toLocaleString()} {t('notes.characters')}</span>
        <span>{content.trim() ? content.trim().split(/\s+/).length : 0} {t('notes.words')}</span>
        {content.trim() && (() => {
          const wordCount = content.trim().split(/\s+/).length
          const mins = Math.max(1, Math.ceil(wordCount / 200))
          return <span>{t('notes.readingTime', { min: String(mins) })}</span>
        })()}
        {saveStatus === 'saving' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--warning)' }}>
            <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
            {t('notes.saving')}
          </span>
        )}
        {saveStatus === 'saved' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--success)' }}>
            <Check size={10} />
            {t('notes.saved')}
          </span>
        )}
      </span>
    </div>
  )
}
