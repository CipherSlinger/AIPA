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
import { readSessionEffortOverride } from '../../lib/sessionEffort'
import { savedInterruptionStore } from '../chat/savedInterruptionStore'

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
  // Any previous line described a different file. Retire it before the new
  // load can answer, so a slow detect can never leave a stale sentence under
  // the wrong conversation.
  savedInterruptionStore.clear()
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
  // Effort is per conversation for the same reason: the reopened conversation
  // must run on the level it was last given, not on today's global default.
  // Restoring from Recently deleted lands here too, and the record is still
  // keyed by the same id — the conversation that comes back is the same one.
  const effortOverride = readSessionEffortOverride(session.sessionId)
  if (effortOverride) useChatStore.getState().setSessionEffortOverride(effortOverride)
  useUiStore.getState().clearUnreadForSession(session.sessionId)
  // Ask once, at load, what the saved transcript's last write looked like. A
  // crash or a closed window leaves no result event, so without this an
  // interrupted conversation looks exactly like a finished one. The answer is
  // a statement about the file, keyed by its session id; a failed or refused
  // call records nothing (absent is not zero, and a failed check is not an
  // interruption either). Codex sessions have no JSONL file and answer 'none'.
  const loadedSessionId = session.sessionId
  void window.electronAPI.sessionDetectInterruption(loadedSessionId)
    .then((result) => {
      const chat = useChatStore.getState()
      // The user may have moved on, or started a live turn, while the file was
      // being read. Never let a late answer describe a different view.
      if (chat.viewSessionId !== loadedSessionId || chat.isStreaming) return
      savedInterruptionStore.setFromLoad(loadedSessionId, result)
    })
    .catch(() => { /* a failed check shows nothing */ })
  // An unassigned session keeps whatever directory the user is already in.
  if (deptDirectory) {
    usePrefsStore.getState().setPrefs({ workingDir: deptDirectory })
    window.electronAPI.prefsSet('workingDir', deptDirectory)
  }
}

/**
 * Open a branch that has no history yet.
 *
 * Codex writes a rollout for a forked thread at once, but a branch created
 * before the first user message has no turns: the file holds only metadata,
 * `session:load` parses no messages, and `thread/list` omits the thread until
 * its first turn. The id is real and resumable, though — the next message
 * resumes it and starts turn one.
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
