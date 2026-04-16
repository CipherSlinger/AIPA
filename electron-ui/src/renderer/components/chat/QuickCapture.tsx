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
      {/* Floating trigger button */}
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
          background: open
            ? 'rgba(255,255,255,0.18)'
            : 'linear-gradient(135deg, #6366f1, #818cf8)',
          border: open
            ? '1px solid var(--text-muted)'
            : '1px solid rgba(99,102,241,0.50)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: open
            ? '0 2px 8px rgba(0,0,0,0.25)'
            : '0 4px 16px rgba(99,102,241,0.40)',
          zIndex: 30,
          transition: 'all 0.15s ease',
          backdropFilter: open ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: open ? 'blur(12px)' : 'none',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.08)'
          if (!open) e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.55)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = open
            ? '0 2px 8px rgba(0,0,0,0.25)'
            : '0 4px 16px rgba(99,102,241,0.40)'
        }}
      >
        {open ? <X size={17} color="rgba(255,255,255,0.85)" /> : <Plus size={18} color="#fff" />}
      </button>

      {/* Capture panel */}
      {open && (
        <div style={{
          position: 'absolute',
          bottom: 96,
          right: 20,
          width: 320,
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
          padding: 14,
          zIndex: 200,
          animation: 'slideUp 0.15s ease',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10,
            paddingBottom: 10, borderBottom: '1px solid var(--border)',
          }}>
            <StickyNote size={13} color="#818cf8" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
              {t('notes.quickCapture')}
            </span>
            <kbd style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.04em',
              background: 'var(--border)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              padding: '1px 5px',
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
              lineHeight: '14px',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}>⌃⇧N</kbd>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                borderRadius: 6, padding: 3, transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
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
            onFocus={e => {
              e.currentTarget.style.border = '1px solid rgba(99,102,241,0.50)'
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.50)'
            }}
            onBlur={e => {
              e.currentTarget.style.border = '1px solid var(--border)'
              e.currentTarget.style.boxShadow = 'none'
            }}
            style={{
              width: '100%',
              minHeight: 64,
              maxHeight: 130,
              resize: 'none',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '9px 11px',
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.6,
              boxSizing: 'border-box',
              transition: 'all 0.15s ease',
            }}
          />

          {/* Char counter */}
          <div style={{ textAlign: 'right', marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            {text.length}
          </div>

          {/* Footer: category pills + save button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <select
              value={categoryId || ''}
              onChange={e => setCategoryId(e.target.value || undefined)}
              style={{
                flex: 1,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '4px 8px',
                color: 'var(--text-secondary)',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
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
                background: text.trim()
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                  : 'rgba(99,102,241,0.25)',
                color: 'rgba(255,255,255,0.95)',
                border: 'none',
                borderRadius: 8,
                padding: '6px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: text.trim() ? 'pointer' : 'not-allowed',
                opacity: text.trim() ? 1 : 0.45,
                transition: 'all 0.15s ease',
                boxShadow: text.trim() ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
              }}
              onMouseEnter={e => {
                if (text.trim()) e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.50)'
              }}
              onMouseLeave={e => {
                if (text.trim()) e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
              }}
            >
              {t('notes.save')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
