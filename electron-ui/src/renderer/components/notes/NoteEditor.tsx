import React, { useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Trash2, ChevronDown, Check, Download, Pin, Loader2, Copy, Bold, Italic, Heading, List, ListOrdered, Code, Link } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'
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
  onTogglePin: (noteId: string, e?: React.MouseEvent) => void
  onDuplicate?: (noteId: string) => void
  getCategoryById: (id?: string) => NoteCategory | undefined
  saveStatus?: 'idle' | 'saving' | 'saved'
}

// Markdown formatting toolbar actions
interface FormatAction {
  icon: React.ElementType
  labelKey: string
  prefix: string
  suffix: string
  blockMode?: boolean // true = applies to whole lines (heading, list)
}

const FORMAT_ACTIONS: FormatAction[] = [
  { icon: Bold, labelKey: 'notes.formatBold', prefix: '**', suffix: '**' },
  { icon: Italic, labelKey: 'notes.formatItalic', prefix: '_', suffix: '_' },
  { icon: Heading, labelKey: 'notes.formatHeading', prefix: '## ', suffix: '', blockMode: true },
  { icon: List, labelKey: 'notes.formatBulletList', prefix: '- ', suffix: '', blockMode: true },
  { icon: ListOrdered, labelKey: 'notes.formatNumberedList', prefix: '1. ', suffix: '', blockMode: true },
  { icon: Code, labelKey: 'notes.formatCode', prefix: '`', suffix: '`' },
  { icon: Link, labelKey: 'notes.formatLink', prefix: '[', suffix: '](url)' },
]

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
  onTogglePin,
  onDuplicate,
  getCategoryById,
  saveStatus = 'idle',
}: NoteEditorProps) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const noteCategory = getCategoryById(note.categoryId)

  // Apply markdown formatting to selected text in the textarea
  const applyFormat = useCallback((action: FormatAction) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = content.slice(start, end)

    let newContent: string
    let newCursorPos: number

    if (action.blockMode) {
      // Block mode: prepend prefix to each selected line, or to the current line
      if (selected) {
        const formatted = selected.split('\n').map(line => `${action.prefix}${line}`).join('\n')
        newContent = content.slice(0, start) + formatted + content.slice(end)
        newCursorPos = start + formatted.length
      } else {
        // No selection: insert prefix at cursor on a new line if not at line start
        const beforeCursor = content.slice(0, start)
        const atLineStart = start === 0 || beforeCursor.endsWith('\n')
        const insert = atLineStart ? action.prefix : `\n${action.prefix}`
        newContent = content.slice(0, start) + insert + content.slice(end)
        newCursorPos = start + insert.length
      }
    } else {
      // Inline mode: wrap selection with prefix/suffix
      if (selected) {
        newContent = content.slice(0, start) + action.prefix + selected + action.suffix + content.slice(end)
        newCursorPos = start + action.prefix.length + selected.length + action.suffix.length
      } else {
        newContent = content.slice(0, start) + action.prefix + action.suffix + content.slice(end)
        newCursorPos = start + action.prefix.length // cursor between prefix and suffix
      }
    }

    // Create a synthetic change event to go through onContentChange
    const syntheticEvent = {
      target: { value: newContent.slice(0, MAX_CONTENT_LENGTH) },
    } as React.ChangeEvent<HTMLTextAreaElement>
    onContentChange(syntheticEvent)

    // Restore focus and cursor position after React re-render
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(newCursorPos, newCursorPos)
    })
  }, [content, onContentChange])

  // Character limit progress
  const charRatio = content.length / MAX_CONTENT_LENGTH
  const charWarning = charRatio >= 0.9
  const charCritical = charRatio >= 0.95

  // Export single note as .md file
  const handleExportNote = useCallback(async () => {
    try {
      const api = (window as unknown as { electronAPI: { fsShowSaveDialog: (defaultName: string, filters: { name: string; extensions: string[] }[]) => Promise<string | null>; fsWriteFile: (filePath: string, content: string) => Promise<{ success?: boolean; error?: string }> } }).electronAPI
      const sanitizedTitle = (title || t('notes.untitled')).replace(/[<>:"/\\|?*]/g, '_').slice(0, 50)
      const filePath = await api.fsShowSaveDialog(`${sanitizedTitle}.md`, [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ])
      if (!filePath) return // user cancelled
      const result = await api.fsWriteFile(filePath, content)
      if (result?.error) {
        addToast('error', t('notes.exportFailed', { error: result.error }))
      } else {
        addToast('success', t('notes.exportSuccess'))
      }
    } catch (err) {
      addToast('error', t('notes.exportFailed', { error: String(err) }))
    }
  }, [title, content, addToast, t])

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

        {/* Export button */}
        <button
          onClick={handleExportNote}
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
        <>
          {/* Markdown formatting toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '4px 10px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            {FORMAT_ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.labelKey}
                  onClick={() => applyFormat(action)}
                  title={t(action.labelKey)}
                  aria-label={t(action.labelKey)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    transition: 'background 0.1s, color 0.1s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--action-btn-bg)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none'
                    e.currentTarget.style.color = 'var(--text-muted)'
                  }}
                >
                  <Icon size={14} />
                </button>
              )
            })}
          </div>

          <textarea
            ref={textareaRef}
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
        </>
      )}

      {/* Character limit progress bar */}
      {charRatio > 0.7 && (
        <div style={{
          padding: '0 14px 4px',
          flexShrink: 0,
        }}>
          <div style={{
            height: 3,
            borderRadius: 2,
            background: 'var(--border)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(charRatio * 100, 100)}%`,
              borderRadius: 2,
              background: charCritical ? 'var(--error)' : charWarning ? 'var(--warning)' : 'var(--accent)',
              transition: 'width 0.2s ease, background 0.2s ease',
            }} />
          </div>
          {charWarning && (
            <div style={{
              fontSize: 10,
              color: charCritical ? 'var(--error)' : 'var(--warning)',
              marginTop: 2,
              textAlign: 'right',
            }}>
              {t('notes.charLimitWarning', {
                remaining: String(MAX_CONTENT_LENGTH - content.length),
              })}
            </div>
          )}
        </div>
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
