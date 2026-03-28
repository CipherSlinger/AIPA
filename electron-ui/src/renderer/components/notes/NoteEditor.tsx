import React, { useRef, useEffect } from 'react'
import { ArrowLeft, Trash2, ChevronDown, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { useT } from '../../i18n'
import { Note, NoteCategory } from '../../types/app.types'
import { MAX_CONTENT_LENGTH } from './notesConstants'

interface NoteEditorProps {
  note: Note
  title: string
  content: string
  previewMode: boolean
  categories: NoteCategory[]
  showCategoryDropdown: boolean
  deletingNoteId: string | null
  onTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onContentChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onBack: () => void
  onDelete: (noteId: string, e: React.MouseEvent) => void
  onSetCategory: (categoryId: string | undefined) => void
  onToggleCategoryDropdown: () => void
  onSetPreviewMode: (preview: boolean) => void
  onSave: (noteId: string, title: string, content: string) => void
  getCategoryById: (id?: string) => NoteCategory | undefined
}

export default function NoteEditor({
  note,
  title,
  content,
  previewMode,
  categories,
  showCategoryDropdown,
  deletingNoteId,
  onTitleChange,
  onContentChange,
  onBack,
  onDelete,
  onSetCategory,
  onToggleCategoryDropdown,
  onSetPreviewMode,
  onSave,
  getCategoryById,
}: NoteEditorProps) {
  const t = useT()
  const categoryDropdownRef = useRef<HTMLDivElement>(null)
  const noteCategory = getCategoryById(note.categoryId)

  // Close category dropdown when clicking outside
  useEffect(() => {
    if (!showCategoryDropdown) return
    const handler = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        onToggleCategoryDropdown()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCategoryDropdown, onToggleCategoryDropdown])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      {/* Editor header */}
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

        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {content.length} {t('notes.characters')}
        </span>
      </div>

      {/* Category selector row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        position: 'relative',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
          {t('notes.categoryLabel')}:
        </span>
        <div ref={categoryDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={onToggleCategoryDropdown}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 11,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            {noteCategory && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: noteCategory.color, flexShrink: 0 }} />
            )}
            <span>{noteCategory ? noteCategory.name : t('notes.uncategorized')}</span>
            <ChevronDown size={10} style={{ opacity: 0.5 }} />
          </button>

          {/* Category dropdown menu */}
          {showCategoryDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              minWidth: 160,
              background: 'var(--popup-bg)',
              border: '1px solid var(--popup-border)',
              borderRadius: 8,
              boxShadow: 'var(--popup-shadow)',
              zIndex: 100,
              animation: 'popup-in 0.15s ease',
              padding: '4px 0',
            }}>
              {/* Uncategorized option */}
              <button
                role="option"
                aria-selected={!note.categoryId}
                onClick={() => onSetCategory(undefined)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 10px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--action-btn-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ width: 14, textAlign: 'center' }}>
                  {!note.categoryId && <Check size={12} />}
                </span>
                {t('notes.uncategorized')}
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  role="option"
                  aria-selected={note.categoryId === cat.id}
                  onClick={() => onSetCategory(cat.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 10px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--action-btn-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ width: 14, textAlign: 'center' }}>
                    {note.categoryId === cat.id && <Check size={12} />}
                  </span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Title input */}
      <input
        type="text"
        value={title}
        onChange={onTitleChange}
        placeholder={t('notes.untitled')}
        style={{
          width: '100%',
          padding: '10px 14px',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-primary)',
          fontSize: 15,
          fontWeight: 600,
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />

      {/* Content: textarea (edit) or Markdown preview */}
      {previewMode ? (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 14px',
            boxSizing: 'border-box',
          }}
        >
          {content.trim() ? (
            <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7 }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}>
              {t('notes.nothingToPreview')}
            </div>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={onContentChange}
          placeholder={t('notes.startTyping')}
          maxLength={MAX_CONTENT_LENGTH}
          style={{
            flex: 1,
            width: '100%',
            padding: '10px 14px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 13,
            lineHeight: 1.6,
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Timestamps footer */}
      <div style={{
        padding: '6px 14px',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span>{t('notes.created')}: {new Date(note.createdAt).toLocaleDateString()}</span>
        <span>{t('notes.modified')}: {new Date(note.updatedAt).toLocaleDateString()}</span>
      </div>
    </div>
  )
}
