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
  useUiStore.getState().clearUnreadForSession(session.sessionId)
  // An unassigned session keeps whatever directory the user is already in.
  if (deptDirectory) {
    usePrefsStore.getState().setPrefs({ workingDir: deptDirectory })
    window.electronAPI.prefsSet('workingDir', deptDirectory)
  }
}
