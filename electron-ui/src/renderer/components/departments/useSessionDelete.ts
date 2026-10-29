// Deleting a conversation, and the way back from it.
//
// `session:delete` no longer destroys anything: main moves the transcript into
// the 30-day holding area and returns the entry that holds it. Two things follow
// from that, and both are here so they cannot drift apart:
//   - the toast that reports the delete carries an Undo keyed on the entry id
//     main returned — not on the session id, which main no longer has a record
//     for;
//   - a refused restore says why, and never borrows the wording that means the
//     conversation is back.
//
// The rest of the delete is unchanged: a refused delete keeps the row, and the
// conversation that was on screen is closed, because it has left the sidebar
// and a later turn would write a fresh transcript at the path the trashed copy
// needs back.
import { useCallback } from 'react'
import { useChatStore, useSessionStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { listSessionsShared } from '../../utils/sessionListShared'
import type { SessionListItem } from '../../types/app.types'
import type { SessionTrashActionResultData } from '../../../preload'
import { UNDO_TOAST_MS } from '../../lib/workflowTrash'
import { sessionTrashFailureText } from '../../lib/sessionTrashText'
import type { ToastAction, ToastType } from '../ui/Toast'

type Translate = (key: string, params?: Record<string, string | number>) => string
type AddToast = (type: ToastType, message: string, duration?: number, action?: ToastAction) => void

/**
 * Re-read the sidebar list so a restored conversation reappears without a
 * restart. Main has already forgotten the reader caches for the restored
 * paths, so a plain re-list is enough; `listSessionsShared` de-duplicates it
 * with whatever else is asking at the same moment.
 *
 * Resolves `true` only when the list the user sees is fresh. `false` means the
 * restore happened but the sidebar was not reloaded, and the message must not
 * claim the conversation is visible.
 */
export async function refreshSessionList(): Promise<boolean> {
  const list = await listSessionsShared()
  if (!list) return false
  useSessionStore.getState().setSessions(list as SessionListItem[])
  return true
}

interface UndoArgs {
  t: Translate
  addToast: AddToast
  /** The holding-area entry `session:delete` returned. */
  entryId: string
}

async function restoreTrashedConversation({ t, addToast, entryId }: UndoArgs): Promise<void> {
  let result: SessionTrashActionResultData
  try {
    result = await window.electronAPI.sessionsTrashRestore(entryId)
  } catch (err) {
    addToast('error', t('trash.failure.generic', { message: String(err) }))
    return
  }
  if (!result.ok) {
    // A refusal is stated as a refusal: the entry is gone, its place is taken,
    // or the record points somewhere main will not touch. Nothing was restored.
    addToast('error', sessionTrashFailureText(t, result.code, result.error))
    return
  }

  let refreshed = false
  try {
    refreshed = await refreshSessionList()
  } catch {
    // The restore already succeeded; a failed re-list is reported, not thrown.
    refreshed = false
  }
  addToast('success', t(refreshed ? 'sessionTrash.restored' : 'sessionTrash.restoredNoList'))
}

export function useSessionDelete() {
  const t = useT()

  return useCallback(async (sessionId: string, sessionTitle?: string) => {
    const { addToast } = useUiStore.getState()
    try {
      if (typeof window.electronAPI.sessionDelete === 'function') {
        // The delete only moves the transcript into "Recently deleted" and
        // says why when it could not. A refused delete must not make the row
        // vanish: it is still on disk, so the sidebar keeps it — and the toast
        // says why, because a click that appears to do nothing reads as broken.
        const result = await window.electronAPI.sessionDelete(sessionId, sessionTitle)
        if (!result.success) {
          addToast(
            'error',
            result.code === 'not_found'
              ? t('trash.failure.notFound')
              : t('sessionTrash.failure.deleteFailed', { message: result.error }),
          )
          return
        }

        // The entry id is the only handle the holding area understands; an
        // older main could answer without one, in which case the toast still
        // points at "Recently deleted" but offers no button rather than
        // offering one that cannot work.
        const entryId = result.entry?.id
        const undo: ToastAction | undefined = entryId
          ? {
              label: t('common.undo'),
              // One word on the button; the spoken form names the conversation,
              // because a bulk delete can leave several of these toasts up.
              ariaLabel: t('sessionTrash.undoDeleteAria', {
                title: sessionTitle || t('session.untitled'),
              }),
              // Returns the promise even though `ToastAction` only wants a
              // `void` handler: the toast closes as this starts, and the
              // outcome arrives as its own toast, so a refusal is never
              // swallowed by the dismissal.
              onClick: () => restoreTrashedConversation({ t, addToast, entryId }),
            }
          : undefined

        // The number of days is deliberately not spoken here: main owns the
        // window, and a sentence with no number cannot disagree with it.
        addToast('success', t('sessionTrash.deleted'), UNDO_TOAST_MS, undo)
      }

      // If the conversation was the one on screen, close it: it is no longer in
      // the sidebar, and leaving it displayed would let the next turn write a
      // fresh transcript at the path the trashed copy would need back.
      if (useChatStore.getState().viewSessionId === sessionId) {
        useChatStore.getState().clearMessages()
      }
      const updated = useSessionStore.getState().sessions.filter(s => s.sessionId !== sessionId)
      useSessionStore.getState().setSessions(updated)
    } catch (err) {
      addToast('error', t('sessionTrash.failure.deleteFailed', { message: String(err) }))
    }
  }, [t])
}
