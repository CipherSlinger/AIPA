// The archive's write actions: archive/unarchive a batch, delete a batch, and
// put a deleted batch back.
//
// Every surface in the panel — the per-row delete, the per-row archive toggle
// and the bulk bar — goes through these three functions, so the trash, undo and
// refusal semantics cannot drift between "one row" and "twelve rows". A batch of
// one is simply a batch.
//
// Toasts: exactly one per user action. The per-item loop accumulates results and
// the batch summariser (archiveBatch.ts) turns them into one statement. The undo
// of a delete is likewise one action that restores the whole batch and reports
// what came back, per-item refusals included.
import { useCallback } from 'react'
import { useChatStore, usePrefsStore, useSessionStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { UNDO_TOAST_MS } from '../../lib/workflowTrash'
import { refreshSessionList } from '../departments/useSessionDelete'
import {
  appendListStaleNote, batchMessageText, classifyDeleteFailure, classifyRestoreFailure,
  describeBatch, planArchiveToggle, tallyBatch,
  type BatchItemResult, type BatchKind, type BatchReason,
} from './archiveBatch'

type Translate = (key: string, params?: Record<string, string | number>) => string

/** Rows a delete needs: the id and the title main stores with the trashed entry. */
export interface DeletableSession {
  id: string
  title: string
}

/**
 * Short reasons for the batch note. A batch that fails several rows for the
 * same reason says it once; the full refusal sentences belong to the
 * single-item toasts, where there is room for them.
 */
function reasonTextFor(t: Translate, reason: BatchReason): string {
  switch (reason) {
    case 'gone': return t('archive.bulk.reason.gone')
    case 'occupied': return t('archive.bulk.reason.occupied')
    case 'folderGone': return t('archive.bulk.reason.folderGone')
    case 'missing': return t('archive.bulk.reason.missing')
    default: return t('archive.bulk.reason.other')
  }
}

function messageFor(kind: BatchKind, results: readonly BatchItemResult[], t: Translate): {
  tone: 'success' | 'warning' | 'error'
  text: string
} {
  const message = describeBatch(kind, tallyBatch(results), reason => reasonTextFor(t, reason))
  return { tone: message.tone, text: batchMessageText(t, message) }
}

export function useArchiveBulkActions() {
  const t = useT()
  const setPrefs = usePrefsStore(s => s.setPrefs)

  /**
   * Put trashed entries back. Used by the delete toast's Undo, never called
   * once per row — the whole batch is attempted, then one toast states how many
   * came back and why the others did not.
   */
  const restoreEntries = useCallback(async (entryIds: readonly string[]) => {
    if (entryIds.length === 0) return
    const { addToast } = useUiStore.getState()
    const results: BatchItemResult[] = []
    for (const entryId of entryIds) {
      try {
        const result = await window.electronAPI.sessionsTrashRestore(entryId)
        results.push(result.ok
          ? { status: 'done' }
          : { status: 'failed', reason: classifyRestoreFailure(result.code) })
      } catch {
        results.push({ status: 'failed', reason: 'other' })
      }
    }

    const done = results.filter(item => item.status === 'done').length
    let refreshed = false
    if (done > 0) {
      try {
        refreshed = await refreshSessionList()
      } catch {
        refreshed = false
      }
    }

    // The headline already says "of total", and each failed reason gets a note;
    // a failed re-list is stated rather than letting the sidebar look empty.
    let message = describeBatch('restore', tallyBatch(results), reason => reasonTextFor(t, reason))
    if (done > 0 && !refreshed) message = appendListStaleNote(message)
    addToast(message.tone, batchMessageText(t, message))
  }, [t])

  /**
   * Move a batch into the conversation trash. One toast for the batch, carrying
   * one Undo that restores every entry that was actually moved.
   */
  const deleteSessions = useCallback(async (items: readonly DeletableSession[]) => {
    if (items.length === 0) return
    const { addToast } = useUiStore.getState()
    const results: BatchItemResult[] = []
    const removedIds: string[] = []
    const entryIds: string[] = []

    for (const item of items) {
      try {
        if (typeof window.electronAPI.sessionDelete !== 'function') {
          results.push({ status: 'failed', reason: 'other' })
          continue
        }
        const result = await window.electronAPI.sessionDelete(item.id, item.title)
        if (!result.success) {
          results.push({ status: 'failed', reason: classifyDeleteFailure(result.code) })
          continue
        }
        results.push({ status: 'done' })
        removedIds.push(item.id)
        // An older main may answer without an entry id; the delete still
        // happened, but there is no handle to offer an Undo for it.
        if (result.entry?.id) entryIds.push(result.entry.id)
      } catch {
        results.push({ status: 'failed', reason: 'other' })
      }
    }

    if (removedIds.length > 0) {
      const removed = new Set(removedIds)
      // The conversation on screen has left the sidebar. Keeping it displayed
      // would let the next turn write a fresh transcript over the path the
      // trashed copy needs back.
      const chat = useChatStore.getState()
      if (chat.viewSessionId && removed.has(chat.viewSessionId)) chat.clearMessages()
      const sessions = useSessionStore.getState()
      sessions.setSessions(sessions.sessions.filter(s => !removed.has(s.sessionId)))
    }

    const { tone, text } = messageFor('delete', results, t)
    const undo = entryIds.length > 0
      ? {
          label: t('common.undo'),
          ariaLabel: t('archive.bulk.undoAria'),
          onClick: () => { void restoreEntries(entryIds) },
        }
      : undefined
    addToast(tone, text, entryIds.length > 0 ? UNDO_TOAST_MS : undefined, undo)
  }, [t, restoreEntries])

  /**
   * Archive or unarchive a batch in one prefs write. Rows already in the
   * requested state are skipped and counted afterwards; nothing is touched
   * twice and nothing is reported as changed when it was not.
   */
  const setArchived = useCallback((ids: readonly string[], archive: boolean) => {
    if (ids.length === 0) return
    const { addToast } = useUiStore.getState()
    const current = usePrefsStore.getState().prefs.archivedSessions || []
    const plan = planArchiveToggle(ids, new Set(current), archive)

    if (plan.apply.length > 0) {
      const applySet = new Set(plan.apply)
      // One write for the batch: the single-row toggle and this share the same
      // pref, so a later per-row toggle can never overwrite a bulk change.
      const next = archive
        ? [...current, ...plan.apply]
        : current.filter(id => !applySet.has(id))
      setPrefs({ archivedSessions: next })
      window.electronAPI.prefsSet('archivedSessions', next)
    }

    const results: BatchItemResult[] = [
      ...plan.apply.map((): BatchItemResult => ({ status: 'done' })),
      ...plan.skipped.map((): BatchItemResult => ({ status: 'skipped', reason: plan.reason })),
    ]
    const { tone, text } = messageFor(archive ? 'archive' : 'unarchive', results, t)
    addToast(tone, text)
  }, [t, setPrefs])

  return { deleteSessions, setArchived, restoreEntries }
}
