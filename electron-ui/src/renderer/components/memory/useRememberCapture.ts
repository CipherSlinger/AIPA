/**
 * "Remember" glue shared by both entry points — the selection toolbar and the
 * message-level "Remember this" action.
 *
 * memoryCapture.ts stays pure and React-free for the Node harness; this hook
 * owns the parts that need React, the Zustand stores, `t` and the toast:
 * reading the current list, saving, and offering Undo. Both surfaces must
 * behave identically because they write the same `prefs.memories` array.
 */

import { useCallback } from 'react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { MemoryItem } from '../../types/app.types'
import { MAX_CONTENT_LENGTH } from './memoryConstants'
import { captureMemory, removeMemoryById } from './memoryCapture'

export type RememberCapture = (text: string) => void

// 8s rather than the 4s toast default: the Undo button must be read and reached
// before it disappears.
const UNDO_TOAST_MS = 8000

export function useRememberCapture(): RememberCapture {
  const t = useT()
  const addToast = useUiStore(s => s.addToast)

  return useCallback((text: string) => {
    // Callers already guard, but this hook is the single writer for both
    // surfaces: a non-string or blank input must never reach `captureMemory`.
    if (typeof text !== 'string' || !text.trim()) return

    const currentMemories: MemoryItem[] = usePrefsStore.getState().prefs.memories || []
    const result = captureMemory(text, currentMemories)

    if (!result) return
    if (result.kind === 'duplicate') {
      addToast('info', t('selection.memoryAlready'))
      return
    }
    if (result.kind === 'full') {
      // Reuses the memory panel's existing cap message, which names the limit.
      addToast('error', t('memory.limitReached'))
      return
    }

    const item = result.item
    const updated = [item, ...currentMemories]
    usePrefsStore.getState().setPrefs({ memories: updated })
    window.electronAPI.prefsSet('memories', updated)

    const undo = () => {
      // Re-read the store instead of reusing `updated`: the user may have
      // added, edited or deleted memories while the toast was on screen. Only
      // this exact id is removed, so nothing else is undone by mistake.
      const latest: MemoryItem[] = usePrefsStore.getState().prefs.memories || []
      const remaining = removeMemoryById(latest, item.id)
      if (remaining.length === latest.length) {
        addToast('info', t('selection.memoryGone'))
        return
      }
      usePrefsStore.getState().setPrefs({ memories: remaining })
      window.electronAPI.prefsSet('memories', remaining)
      addToast('info', t('selection.memoryUndone'))
    }

    const undoAction = {
      label: t('selection.memoryUndo'),
      ariaLabel: t('selection.memoryUndoAria'),
      onClick: undo,
    }
    if (result.kind === 'too-long') {
      // Stored content is already clipped to MAX_CONTENT_LENGTH by
      // captureMemory, so the panel can display and edit it without re-clipping.
      addToast('warning', t('selection.memoryShortened', { max: MAX_CONTENT_LENGTH }), UNDO_TOAST_MS, undoAction)
      return
    }
    // Say what was saved (the suggested category) — never that the assistant
    // "learned" something. The sentence-case key is separate from memory.cat*
    // because those labels are capitalised for chips.
    const categoryLabel = t(`selection.memoryCategory.${item.category}`)
    addToast('success', t('selection.memorySaved', { category: categoryLabel }), UNDO_TOAST_MS, undoAction)
  }, [addToast, t])
}
