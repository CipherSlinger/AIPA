import React, { useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { useT } from '../../i18n'
import { useUiStore } from '../../store'
import { Note, NoteCategory } from '../../types/app.types'
import { MAX_CONTENT_LENGTH, FORMAT_ACTIONS, FormatAction } from './notesConstants'
import NoteEditorHeader from './NoteEditorHeader'
import NoteCategorySelector from './NoteCategorySelector'

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
      if (selected) {
        const formatted = selected.split('\n').map(line => `${action.prefix}${line}`).join('\n')
        newContent = content.slice(0, start) + formatted + content.slice(end)
        newCursorPos = start + formatted.length
      } else {
        const beforeCursor = content.slice(0, start)
        const atLineStart = start === 0 || beforeCursor.endsWith('\n')
        const insert = atLineStart ? action.prefix : `\n${action.prefix}`
        newContent = content.slice(0, start) + insert + content.slice(end)
        newCursorPos = start + insert.length
      }
    } else {
      if (selected) {
        newContent = content.slice(0, start) + action.prefix + selected + action.suffix + content.slice(end)
        newCursorPos = start + action.prefix.length + selected.length + action.suffix.length
      } else {
        newContent = content.slice(0, start) + action.prefix + action.suffix + content.slice(end)
        newCursorPos = start + action.prefix.length
      }
    }

    const syntheticEvent = {
      target: { value: newContent.slice(0, MAX_CONTENT_LENGTH) },
    } as React.ChangeEvent<HTMLTextAreaElement>
    onContentChange(syntheticEvent)

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
      if (!filePath) return
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, background: 'rgba(10,10,18,0.95)', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.10) transparent' }}>
      {/* Editor header */}
      <NoteEditorHeader
        note={note}
        content={content}
        title={title}
        previewMode={previewMode}
        saveStatus={saveStatus}
        onBack={onBack}
        onSetPreviewMode={onSetPreviewMode}
        onSave={onSave}
        onExport={handleExportNote}
        onDuplicate={onDuplicate}
        onTogglePin={onTogglePin}
      />

      {/* Category selector row */}
      <NoteCategorySelector
        note={note}
        categories={categories}
        showDropdown={showCategoryDropdown}
        noteCategory={noteCategory}
        onSetCategory={onSetCategory}
        onToggleDropdown={onToggleCategoryDropdown}
      />

      {/* Title input */}
      <input
        type="text"
        value={title}
        onChange={onTitleChange}
        placeholder={t('notes.untitled')}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'transparent',
          color: 'rgba(255,255,255,0.82)',
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: '-0.01em',
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
            padding: '12px 16px',
            boxSizing: 'border-box',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.10) transparent',
          }}
        >
          {content.trim() ? (
            <div className="markdown-body" style={{ color: 'rgba(255,255,255,0.82)', fontSize: 14, lineHeight: 1.7 }}>
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
              color: 'rgba(255,255,255,0.38)',
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
            padding: '5px 10px',
            background: 'rgba(12,12,22,0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
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
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: 'rgba(255,255,255,0.45)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.82)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
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
              padding: '14px 16px',
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.82)',
              fontSize: 14,
              lineHeight: 1.7,
              outline: 'none',
              resize: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.10) transparent',
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
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(charRatio * 100, 100)}%`,
              borderRadius: 2,
              background: charCritical ? '#f87171' : charWarning ? '#fbbf24' : 'rgba(99,102,241,0.7)',
              transition: 'width 0.2s ease, background 0.2s ease',
            }} />
          </div>
          {charWarning && (
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              color: charCritical ? '#f87171' : '#fbbf24',
              marginTop: 2,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
              fontFeatureSettings: '"tnum"',
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
        padding: '6px 16px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase' as const,
        color: 'rgba(255,255,255,0.38)',
        display: 'flex',
        justifyContent: 'space-between',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum"',
        lineHeight: 1,
      }}>
        <span>{t('notes.created')}: {new Date(note.createdAt).toLocaleDateString()}</span>
        <span>{t('notes.modified')}: {new Date(note.updatedAt).toLocaleDateString()}</span>
      </div>
    </div>
  )
}
