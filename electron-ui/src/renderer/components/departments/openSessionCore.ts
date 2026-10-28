// Opening a session from outside the chat panel.
//
// A department roster, an archive record and a sidebar list all mean the same
// thing by "open this session": load its transcript, point the working directory
// at the folder it belongs to, and swap the main view to chat. Kept in its own
// module so DepartmentDashboard and ArchivePanel share one implementation and
// neither has to import the other.

import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { parseSessionMessages } from '../sessions/sessionUtils'
import { readSessionModelOverride } from '../../lib/sessionModel'

/**
 * @param origin where the user is opening from. Only the department views get the
 * chat header's "back to department" button — the header hardcodes that
 * destination, so claiming the archive as the origin would send the user
 * somewhere they never were.
 */
export async function openSessionCore(
  session: SessionListItem,
  deptDirectory: string,
  origin: 'department' | 'archive' = 'department',
): Promise<void> {
  useUiStore.getState().setMainView('chat')
  useUiStore.getState().closeSettingsModal()
  useUiStore.getState().setFromDepartment(origin === 'department')
  const raw = await window.electronAPI.sessionLoad(session.sessionId)
  const chatMessages = parseSessionMessages(raw)
  useChatStore.getState().clearMessages()
  useChatStore.getState().loadHistory(chatMessages)
  useChatStore.getState().setSessionId(session.sessionId)
  // clearMessages above wiped the persona; the mapping chatStore wrote at hire
  // time is how an existing employee remembers the role it was hired as.
  try {
    const personaId = localStorage.getItem(`aipa:session-persona:${session.sessionId}`)
    if (personaId) useChatStore.getState().setSessionPersonaId(personaId)
  } catch { /* localStorage unavailable — the session still opens */ }
  // An explicit pick recorded with the header picker outlives a reload; without
  // this the reopened conversation would silently fall back to the persona.
  const modelOverride = readSessionModelOverride(session.sessionId)
  if (modelOverride) useChatStore.getState().setSessionModelOverride(modelOverride)
  useUiStore.getState().clearUnreadForSession(session.sessionId)
  // An unassigned session keeps whatever directory the user is already in.
  if (deptDirectory) {
    usePrefsStore.getState().setPrefs({ workingDir: deptDirectory })
    window.electronAPI.prefsSet('workingDir', deptDirectory)
  }
}

/**
 * Open a branch that has no history yet.
 *
 * Codex persists a forked thread only once it has a turn, so a branch created
 * before the first user message has no rollout file: `session:load` returns
 * nothing and the normal open path would report it missing. The thread id is
 * real, though — sending the next message resumes it and starts turn one.
 *
 * The branch keeps the source thread's working directory (the engine copies
 * it), so the window's current directory is deliberately left alone.
 */
export function adoptEmptyBranch(threadId: string): void {
  useUiStore.getState().setMainView('chat')
  useUiStore.getState().closeSettingsModal()
  useUiStore.getState().setFromDepartment(false)
  useChatStore.getState().clearMessages()
  useChatStore.getState().setSessionId(threadId)
  useUiStore.getState().clearUnreadForSession(threadId)
}
