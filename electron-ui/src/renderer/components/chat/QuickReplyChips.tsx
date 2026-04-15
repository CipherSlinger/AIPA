import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Plus, Check, X, Trash2 } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'

interface QuickReply {
  label: string
  prompt: string
}

interface QuickReplyChipsProps {
  onInsert: (prompt: string) => void
}

// Default quick reply definitions -- labels use i18n keys, prompts stay in English for Claude
const DEFAULT_QUICK_REPLY_DEFS = [
  { labelKey: 'quickReply.summarize', prompt: 'Please summarize the above concisely:' },
  { labelKey: 'quickReply.translate', prompt: 'Please translate the following text. If it is in Chinese, translate to English; if it is in English, translate to Chinese:' },
  { labelKey: 'quickReply.draftEmail', prompt: 'Please draft a professional email based on the following points:' },
  { labelKey: 'quickReply.brainstorm', prompt: 'Please brainstorm creative ideas about:' },
]

// Check whether a stored chip matches a default by its prompt (language-invariant)
const DEFAULT_PROMPTS = new Set(DEFAULT_QUICK_REPLY_DEFS.map(d => d.prompt))

export default function QuickReplyChips({ onInsert }: QuickReplyChipsProps) {
  const t = useT()
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)

  // Build default chips with translated labels
  const defaultChips: QuickReply[] = DEFAULT_QUICK_REPLY_DEFS.map(d => ({
    label: t(d.labelKey),
    prompt: d.prompt,
  }))

  // If user has stored quickReplies, re-translate labels for any that match default prompts
  // so they always follow the current language, while preserving truly custom chips
  const chips: QuickReply[] = useMemo(() => {
    const stored = prefs.quickReplies
    if (!stored) return defaultChips
    // Map default prompts to their i18n label keys for re-translation
    const promptToLabelKey = new Map(DEFAULT_QUICK_REPLY_DEFS.map(d => [d.prompt, d.labelKey]))
    return stored.map(chip => {
      const labelKey = promptToLabelKey.get(chip.prompt)
      if (labelKey) {
        // This is a default chip -- use translated label
        return { ...chip, label: t(labelKey) }
      }
      // Custom chip -- keep stored label as-is
      return chip
    })
  }, [prefs.quickReplies, t])

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
        placeholder={t('quickReply.labelPlaceholder')}
        style={{
          fontSize: 11,
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
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
        placeholder={t('quickReply.promptPlaceholder')}
        style={{
          fontSize: 11,
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '3px 8px',
          color: 'var(--text-primary)',
          outline: 'none',
          width: 140,
        }}
      />
      <button
        onClick={handleSave}
        title={t('common.save')}
        aria-label={t('quickReply.saveReply')}
        style={{
          background: 'none',
          border: 'none',
          color: '#4ade80',
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
        title={t('common.cancel')}
        aria-label={t('common.cancel')}
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
          title={t('common.delete')}
          aria-label={t('quickReply.deleteReply')}
          style={{
            background: 'none',
            border: 'none',
            color: '#f87171',
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
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          padding: '8px 0',
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
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s ease',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 160,
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'var(--border)'
                el.style.borderColor = 'rgba(99,102,241,0.40)'
                el.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'var(--bg-hover)'
                el.style.borderColor = 'var(--border)'
                el.style.color = 'var(--text-secondary)'
              }}
              onMouseDown={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.transform = 'translateY(0)'
                el.style.boxShadow = 'none'
              }}
              onMouseUp={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.transform = 'translateY(-1px)'
                el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'
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
            title={t('quickReply.addTemplate')}
            aria-label={t('quickReply.addTemplate')}
            style={{
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: 14,
              width: 28,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s ease',
              color: 'var(--text-muted)',
              fontSize: 11,
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'
              ;(e.currentTarget as HTMLButtonElement).style.borderStyle = 'solid'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLButtonElement).style.borderStyle = 'dashed'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
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
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
            padding: '4px 0',
            zIndex: 9999,
            minWidth: 120,
            animation: 'slideUp 0.15s ease',
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
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            {t('common.edit')}
          </button>
          <button
            onClick={() => handleDelete(contextMenu.index)}
            style={{
              display: 'block',
              width: '100%',
              background: 'none',
              border: 'none',
              color: '#f87171',
              fontSize: 12,
              padding: '6px 14px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            {t('common.remove')}
          </button>
        </div>
      )}
    </>
  )
}
