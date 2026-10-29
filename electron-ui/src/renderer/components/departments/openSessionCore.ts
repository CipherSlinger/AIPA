// Opening a session from outside the chat panel.
//
// A department roster, an archive record and a sidebar list all mean the same
// thing by "open this session": load its transcript, restore what that
// conversation carries — its persona, model, effort and the folder it ran in —
// and swap the main view to chat. The folder is part of that set, not a detail:
// a Codex thread resumed with `thread/resume` runs its turn in the cwd its
// rollout recorded, so reopening a conversation elsewhere would put the next
// turn in the wrong project while the tab claimed otherwise. Kept in its own
// module so DepartmentDashboard and ArchivePanel share one implementation and
// neither has to import the other.

import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { parseSessionMessages } from '../sessions/sessionUtils'
import { readSessionModelOverride } from '../../lib/sessionModel'
import { readSessionEffortOverride } from '../../lib/sessionEffort'
import { sessionWorkingDir, workingDirPresence } from '../../lib/workingDir'
import { savedInterruptionStore } from '../chat/savedInterruptionStore'
import { workingDirGoneStore } from '../chat/workingDirNotice'

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
  // Same for the missing-folder notice: it was a statement about the folder of
  // the conversation that was open, and says nothing about this one.
  workingDirGoneStore.clear()
  const raw = await window.electronAPI.sessionLoad(session.sessionId)
  const chatMessages = parseSessionMessages(raw)
  useChatStore.getState().clearMessages()
  useChatStore.getState().loadHistory(chatMessages)
  useChatStore.getState().setSessionId(session.sessionId)
  // Everything below describes the file that was just loaded, so fix its id
  // here rather than re-reading the store after other writes.
  const loadedSessionId = session.sessionId
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

  // Restore the folder too. A Codex transcript records where it ran; that
  // record beats the department it was filed under, because a department is a
  // grouping while the cwd is where the work happened. With neither, clear the
  // tab override: leaving it alone is how a reopened conversation silently
  // inherited the folder of whatever was open before it.
  const desired = sessionWorkingDir(session.cwd, deptDirectory)
  const activeTabId = useChatStore.getState().activeTabId
  if (activeTabId) {
    // The tab is the per-conversation override the send path reads, so this is
    // the write that actually decides the next turn's folder. Writing the
    // global preference here — the old behaviour — moved every other
    // conversation's default without saying so.
    useChatStore.getState().setTabCwd(activeTabId, desired)
  } else if (deptDirectory) {
    // No tab is open to carry the folder (the panel is not the active view).
    // The old global fallback is all that is left, kept so opening a session
    // from a roster still lands somewhere sensible instead of nowhere.
    usePrefsStore.getState().setPrefs({ workingDir: deptDirectory })
    window.electronAPI.prefsSet('workingDir', deptDirectory)
  }

  // A transcript can name a folder that has since been moved or deleted. Ask
  // once — and only believe a definite `missing`: a refused or failed stat is
  // not evidence, so a folder we could not check keeps being used without a
  // warning. This must not delay the transcript, so the folder was adopted
  // above and the answer only adds the notice; a late answer is checked against
  // the view before it speaks, so it can never describe a different
  // conversation.
  const recordedCwd = typeof session.cwd === 'string' ? session.cwd.trim() : ''
  if (recordedCwd) {
    void window.electronAPI.fsStatPaths([recordedCwd])
      .then((results) => {
        if (useChatStore.getState().viewSessionId !== loadedSessionId) return
        if (workingDirPresence(results?.[0]) === 'missing') {
          workingDirGoneStore.setGone(loadedSessionId, recordedCwd)
        }
      })
      .catch(() => { /* a failed check proves nothing */ })
  }

  // Ask once, at load, what the saved transcript's last write looked like. A
  // crash or a closed window leaves no result event, so without this an
  // interrupted conversation looks exactly like a finished one. The answer is
  // a statement about the file, keyed by its session id; a failed or refused
  // call records nothing (absent is not zero, and a failed check is not an
  // interruption either). Codex sessions have no JSONL file and answer 'none'.
  void window.electronAPI.sessionDetectInterruption(loadedSessionId)
    .then((result) => {
      const chat = useChatStore.getState()
      // The user may have moved on, or started a live turn, while the file was
      // being read. Never let a late answer describe a different view.
      if (chat.viewSessionId !== loadedSessionId || chat.isStreaming) return
      savedInterruptionStore.setFromLoad(loadedSessionId, result)
    })
    .catch(() => { /* a failed check shows nothing */ })
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
