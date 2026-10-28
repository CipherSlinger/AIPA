// The one listener behind every "open this session" entry point.
//
// The tray, the startup resume, the command palette, the quick switcher and
// Ctrl+[ / Ctrl+] all post `aipa:openSession`. That listener used to live in
// SessionList; when the sidebar moved it went with it, and every one of those
// paths silently turned into a no-op. This hook is that listener, mounted once
// from App, and it opens through `openSessionCore` — the same call the
// department roster and the archive ledger make — so the transcript, persona
// and working directory restored never depend on which door the user used.

import { useEffect } from 'react'
import { getT } from '../i18n'
import { useDepartmentStore, useSessionStore, useUiStore } from '../store'
import type { SessionListItem } from '../types/app.types'
import { openSessionCore } from '../components/departments/openSessionCore'
import { deptByNormDir, deptBySlug, findDeptForSession } from '../components/departments/deptUtils'
import { listSessionsShared } from '../utils/sessionListShared'

/** The directory its department owns; '' leaves the user's working dir alone. */
function departmentDirectoryFor(session: SessionListItem): string {
  const departments = useDepartmentStore.getState().departments
  if (departments.length === 0) return ''
  const homeDir = useSessionStore.getState().homeDir
  const dept = findDeptForSession(
    session,
    deptBySlug(departments),
    deptByNormDir(departments, homeDir),
    homeDir,
  )
  return dept?.directory ?? ''
}

/**
 * The list item for `sessionId`, or null when the transcript is really gone.
 *
 * A request can beat the first list response (startup resume), or name a
 * session this window has never listed (tray). Either way the id is re-checked
 * against a fresh list before the transcript file itself is probed — the file
 * is the authority, the list is only an index.
 */
async function resolveSession(sessionId: string): Promise<SessionListItem | null> {
  const known = () => useSessionStore.getState().sessions.find(s => s.sessionId === sessionId)

  const fromStore = known()
  if (fromStore) return fromStore

  const list = await listSessionsShared()
  if (list) useSessionStore.getState().setSessions(list as SessionListItem[])
  const fromList = known()
  if (fromList) return fromList

  const raw = await window.electronAPI.sessionLoad(sessionId)
  if (!Array.isArray(raw) || raw.length === 0) return null
  // openSessionCore reads nothing but the id from the item; the caller is the
  // rare case where the index no longer carries it.
  return { sessionId } as SessionListItem
}

export function useAppEventBridge() {
  useEffect(() => {
    // Opens run one at a time: two loads racing would let the older transcript
    // finish last and overwrite the newer one. Queuing also keeps the last
    // request, which is the one the user meant, as the final state.
    let queue: Promise<void> = Promise.resolve()

    const openSession = async (sessionId: string) => {
      const t = getT()
      try {
        const session = await resolveSession(sessionId)
        if (!session) {
          useUiStore.getState().addToast('error', t('session.notFound'))
          return
        }
        // Not a department or archive origin: the header's "back" button would
        // point somewhere the user never was.
        await openSessionCore(session, departmentDirectoryFor(session), 'archive')
      } catch (err) {
        console.error('[AIPA] Failed to open session', sessionId, err)
        useUiStore.getState().addToast('error', t('session.openFailed'))
      }
    }

    const onOpenSession = (event: Event) => {
      const sessionId = (event as CustomEvent).detail
      if (typeof sessionId !== 'string' || !sessionId) return
      queue = queue.then(() => openSession(sessionId)).catch(() => { /* already reported */ })
    }

    const onSearchFocus = () => {
      useUiStore.getState().requestSearchFocus()
    }

    // A plugin's visible `chat.ask` writes a real transcript, but the sidebar
    // does not poll: until something refetches, the conversation is invisible.
    // The toast names the plugin so the new entry is not mistaken for the
    // user's own. Toasts have no action slot today, so opening stays in the
    // archive rather than pretending there is an "Open" button.
    const offPluginConversation = window.electronAPI.onPluginConversationCreated(({ pluginId, pluginLabel }) => {
      void listSessionsShared().then((list) => {
        if (list) useSessionStore.getState().setSessions(list as SessionListItem[])
      })
      useUiStore.getState().addToast(
        'info',
        getT()('plugin.conversationCreated', { name: pluginLabel || pluginId }),
      )
    })

    window.addEventListener('aipa:openSession', onOpenSession)
    window.addEventListener('aipa:globalSearchFocus', onSearchFocus)
    return () => {
      window.removeEventListener('aipa:openSession', onOpenSession)
      window.removeEventListener('aipa:globalSearchFocus', onSearchFocus)
      offPluginConversation()
    }
  }, [])
}
