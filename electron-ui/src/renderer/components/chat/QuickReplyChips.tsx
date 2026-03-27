import React, { useState, useRef, useEffect } from 'react'
import { Plus, Check, X, Trash2 } from 'lucide-react'
import { usePrefsStore } from '../../store'

interface QuickReply {
  label: string
  prompt: string
}

interface QuickReplyChipsProps {
  onInsert: (prompt: string) => void
}

const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { label: 'Explain this', prompt: 'Please explain this in detail:' },
  { label: 'Review code', prompt: 'Please review this code for bugs, performance issues, and best practices:' },
  { label: 'Summarize', prompt: 'Please summarize the above concisely:' },
  { label: 'Fix bug', prompt: 'Please identify and fix the bug in:' },
]

export default function QuickReplyChips({ onInsert }: QuickReplyChipsProps) {
  const { prefs, setPrefs } = usePrefsStore()
  const chips: QuickReply[] = prefs.quickReplies ?? DEFAULT_QUICK_REPLIES

  const [addingNew, setAddingNew] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [formLabel, setFormLabel] = useState('')
  const [formPrompt, setFormPrompt] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null)

  const labelRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Focus the label field when opening add/edit form
  useEffect(() => {
    if (addingNew || editingIndex !== null) {
      setTimeout(() => labelRef.current?.focus(), 50)
    }
  }, [addingNew, editingIndex])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const persist = (newChips: QuickReply[]) => {
    setPrefs({ quickReplies: newChips })
    window.electronAPI.prefsSet('quickReplies', newChips)
  }

  const handleAdd = () => {
    setAddingNew(true)
    setEditingIndex(null)
    setFormLabel('')
    setFormPrompt('')
  }

  const handleEdit = (index: number) => {
    setEditingIndex(index)
    setAddingNew(false)
    setFormLabel(chips[index].label)
    setFormPrompt(chips[index].prompt)
    setContextMenu(null)
  }

  const handleDelete = (index: number) => {
    const newChips = chips.filter((_, i) => i !== index)
    persist(newChips)
    setContextMenu(null)
  }

  const handleSave = () => {
    const label = formLabel.trim()
    const prompt = formPrompt.trim()
    if (!label || !prompt) return

    if (editingIndex !== null) {
      const newChips = [...chips]
      newChips[editingIndex] = { label, prompt }
      persist(newChips)
      setEditingIndex(null)
    } else {
      persist([...chips, { label, prompt }])
      setAddingNew(false)
    }
    setFormLabel('')
    setFormPrompt('')
  }

  const handleCancel = () => {
    setAddingNew(false)
    setEditingIndex(null)
    setFormLabel('')
    setFormPrompt('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const handleContextMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, index })
  }

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + '\u2026' : text

  // Inline edit/add form
  const renderForm = () => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
    }}>
      <input
        ref={labelRef}
        value={formLabel}
        onChange={e => setFormLabel(e.target.value.slice(0, 20))}
        onKeyDown={handleKeyDown}
        placeholder="Label"
        style={{
          fontSize: 11,
          background: 'var(--input-field-bg)',
          border: '1px solid var(--input-field-border)',
          borderRadius: 6,
          padding: '3px 8px',
          color: 'var(--text-primary)',
          outline: 'none',
          width: 80,
        }}
      />
      <input
        value={formPrompt}
        onChange={e => setFormPrompt(e.target.value.slice(0, 500))}
        onKeyDown={handleKeyDown}
        placeholder="Prompt text"
        style={{
          fontSize: 11,
          background: 'var(--input-field-bg)',
          border: '1px solid var(--input-field-border)',
          borderRadius: 6,
          padding: '3px 8px',
          color: 'var(--text-primary)',
          outline: 'none',
          width: 140,
        }}
      />
      <button
        onClick={handleSave}
        title="Save"
        aria-label="Save quick reply"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--success, #4ade80)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: 2,
        }}
      >
        <Check size={14} />
      </button>
      <button
        onClick={handleCancel}
        title="Cancel"
        aria-label="Cancel"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: 2,
        }}
      >
        <X size={14} />
      </button>
      {editingIndex !== null && (
        <button
          onClick={() => {
            handleDelete(editingIndex)
            handleCancel()
          }}
          title="Delete"
          aria-label="Delete quick reply"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--error)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: 2,
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )

  return (
    <>
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 4,
          marginBottom: 4,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          flexShrink: 0,
        }}
      >
        {chips.map((chip, i) => {
          if (editingIndex === i) {
            return <React.Fragment key={i}>{renderForm()}</React.Fragment>
          }
          return (
            <button
              key={i}
              onClick={() => onInsert(chip.prompt)}
              onContextMenu={e => handleContextMenu(e, i)}
              onDoubleClick={() => handleEdit(i)}
              title={chip.prompt}
              aria-label={chip.prompt}
              style={{
                background: 'var(--action-btn-bg)',
                border: '1px solid var(--action-btn-border)',
                borderRadius: 14,
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'background 0.15s ease, color 0.15s ease',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 160,
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-bg)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
              }}
            >
              {truncate(chip.label, 20)}
            </button>
          )
        })}

        {addingNew ? (
          renderForm()
        ) : editingIndex === null ? (
          <button
            onClick={handleAdd}
            title="Add quick reply template"
            aria-label="Add quick reply template"
            style={{
              background: 'transparent',
              border: '1px dashed var(--action-btn-border)',
              borderRadius: 14,
              width: 28,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s ease, border-color 0.15s ease',
              color: 'var(--text-muted)',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)'
              ;(e.currentTarget as HTMLButtonElement).style.borderStyle = 'solid'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLButtonElement).style.borderStyle = 'dashed'
            }}
          >
            <Plus size={14} />
          </button>
        ) : null}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            boxShadow: 'var(--popup-shadow)',
            padding: '4px 0',
            zIndex: 9999,
            minWidth: 120,
            animation: 'popup-in 0.15s ease',
          }}
        >
          <button
            onClick={() => handleEdit(contextMenu.index)}
            style={{
              display: 'block',
              width: '100%',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '6px 14px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--popup-item-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            Edit
          </button>
          <button
            onClick={() => handleDelete(contextMenu.index)}
            style={{
              display: 'block',
              width: '100%',
              background: 'none',
              border: 'none',
              color: 'var(--error)',
              fontSize: 12,
              padding: '6px 14px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--popup-item-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            Remove
          </button>
        </div>
      )}
    </>
  )
}
