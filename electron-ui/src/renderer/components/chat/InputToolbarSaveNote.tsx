import React from 'react'
import { StickyNote } from 'lucide-react'
import { useT } from '../../i18n'
import { usePrefsStore, useUiStore } from '../../store'
import { toolbarBtnStyle } from './chatInputConstants'
import { Note } from '../../types/app.types'

interface SaveAsNoteButtonProps {
  inputText: string
}

export default function InputToolbarSaveNote({ inputText }: SaveAsNoteButtonProps) {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)
  const hasText = inputText.trim().length > 0

  const handleSave = () => {
    const text = inputText.trim()
    if (!text) return
    const MAX_NOTES = 100
    const currentNotes: Note[] = usePrefsStore.getState().prefs.notes || []
    if (currentNotes.length >= MAX_NOTES) {
      addToast('error', t('message.notesLimitReached'))
      return
    }
    const now = Date.now()
    const title = text.slice(0, 50) + (text.length > 50 ? '...' : '')
    const newNote: Note = {
      id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      content: text,
      createdAt: now,
      updatedAt: now,
    }
    const updated = [newNote, ...currentNotes]
    usePrefsStore.getState().setPrefs({ notes: updated })
    window.electronAPI.prefsSet('notes', updated)
    addToast('success', t('toolbar.savedAsNote'))
  }

  return (
    <button
      onClick={handleSave}
      disabled={!hasText}
      title={t('toolbar.saveAsNote')}
      style={{
        ...toolbarBtnStyle,
        opacity: hasText ? 1 : 0.4,
        cursor: hasText ? 'pointer' : 'not-allowed',
      }}
      onMouseEnter={(e) => { if (hasText) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--glass-border)' } }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
    >
      <StickyNote size={16} />
    </button>
  )
}
