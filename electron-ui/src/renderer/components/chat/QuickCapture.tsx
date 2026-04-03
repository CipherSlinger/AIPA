// QuickCapture — floating quick note capture widget (Iteration 437)
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, X, StickyNote } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { Note, NoteCategory } from '../../types/app.types'
import { MAX_NOTES, generateId } from '../notes/notesConstants'

export default function QuickCapture() {
  const t = useT()
  const { prefs, setPrefs } = usePrefsStore()
  const addToast = useUiStore(s => s.addToast)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const notes: Note[] = prefs.notes || []
  const categories: NoteCategory[] = prefs.noteCategories || []

  // Keyboard shortcut: Ctrl+Shift+N
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        setOpen(prev => {
          if (!prev) setTimeout(() => textareaRef.current?.focus(), 100)
          return !prev
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus textarea when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [open])

  const handleSave = useCallback(() => {
    if (!text.trim()) return
    if (notes.length >= MAX_NOTES) {
      addToast('warning', t('notes.maxNotesReached'), 3000)
      return
    }

    const autoTitle = text.trim().slice(0, 30) + (text.trim().length > 30 ? '...' : '')
    const newNote: Note = {
      id: generateId('note'),
      title: autoTitle,
      content: text.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      categoryId: categoryId || undefined,
    }
    const updated = [newNote, ...notes]
    setPrefs({ notes: updated })
    window.electronAPI.prefsSet('notes', updated)

    const catName = categoryId
      ? categories.find(c => c.id === categoryId)?.name || ''
      : ''
    addToast('success', catName
      ? t('notes.savedTo', { category: catName })
      : t('notes.quickCaptureSaved'), 2000)

    setText('')
    setOpen(false)
  }, [text, notes, categoryId, categories, setPrefs, addToast, t])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        title={`${t('notes.quickCapture')} (Ctrl+Shift+N)`}
        style={{
          position: 'absolute',
          bottom: 52,
          right: 20,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: open ? 'var(--text-muted)' : 'var(--accent)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 50,
          transition: 'transform 0.15s ease, background 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {open ? <X size={18} color="#fff" /> : <Plus size={18} color="#fff" />}
      </button>

      {/* Capture card */}
      {open && (
        <div style={{
          position: 'absolute',
          bottom: 96,
          right: 20,
          width: 320,
          background: 'var(--card-bg, var(--bg-primary))',
          border: '1px solid var(--card-border, var(--border))',
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          padding: 12,
          zIndex: 51,
          animation: 'quickCaptureIn 0.2s ease',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <StickyNote size={13} color="var(--accent)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
              {t('notes.quickCapture')}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('notes.jotDown')}
            style={{
              width: '100%',
              minHeight: 60,
              maxHeight: 120,
              resize: 'vertical',
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 10px',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />

          {/* Footer: category + save */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <select
              value={categoryId || ''}
              onChange={e => setCategoryId(e.target.value || undefined)}
              style={{
                flex: 1,
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 6px',
                color: 'var(--text-secondary)',
                fontSize: 11,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">{t('notes.noCategory')}</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>
              ))}
            </select>
            <button
              onClick={handleSave}
              disabled={!text.trim()}
              style={{
                background: text.trim() ? 'var(--accent)' : 'var(--bg-secondary)',
                color: text.trim() ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 6,
                padding: '5px 14px',
                fontSize: 11,
                fontWeight: 600,
                cursor: text.trim() ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s ease',
              }}
            >
              {t('notes.save')}
            </button>
          </div>
        </div>
      )}

      {/* Inline animation styles */}
      <style>{`
        @keyframes quickCaptureIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
