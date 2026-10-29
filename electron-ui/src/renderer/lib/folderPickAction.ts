// One implementation of "the user picked a folder": the View menu's "Open
// folder" row, the command palette's "Change Working Directory" row, and the
// chat header's worktree switch all end up here. They must mean the same thing,
// so the plan is read in one place instead of three files that will drift.
//
// The worktree dialog is the newest caller and the reason `applyFolderForView`
// is separate from the dialog: creating a worktree is a folder pick, and on a
// resumed Codex conversation it cannot move the thread either.

import { useChatStore, usePrefsStore, useSessionStore, useUiStore } from '../store'
import { getT } from '../i18n'
import { workingDirLabel } from './workingDir'
import { planFolderPick, recordedFolderOf, type FolderPickMode } from './folderPick'

/**
 * Open the folder dialog and apply the answer to the conversation on screen.
 *
 * State is read AFTER the dialog resolves, not before: a dialog is a long
 * pause, and the answer must describe the conversation the user is looking at
 * when the folder arrives. The palette also uses `planFolderPick` when it
 * builds its rows, but only to describe the row — this call re-reads, because
 * describing a plan is not the same as executing the current one.
 */
export async function pickFolderForView(): Promise<void> {
  const picked = await window.electronAPI.fsShowOpenDialog()
  if (!picked) return
  applyFolderForView(picked)
}

/**
 * Apply a folder that is already known — a dialog answer, or a worktree the
 * user just asked to switch to. Reads the conversation state itself, after the
 * dialog has closed, and returns what the pick turned out to mean so a caller
 * can word its own follow-up.
 */
export function applyFolderForView(picked: string): FolderPickMode {
  const chat = useChatStore.getState()
  const sessionStore = useSessionStore.getState()
  const recorded = recordedFolderOf(sessionStore.sessions, chat.currentSessionId)
  const plan = planFolderPick(chat.activeTabId, recorded)

  if (plan.mode === 'global' || !plan.tabId) {
    // No tab means no conversation to move. This is today's behaviour and the
    // only thing left to write: the folder the next conversation starts in.
    // Nothing extra is said — it is what the row has always promised.
    //
    // The in-memory preference is written too, not just the stored one: the
    // fallback resolver reads `prefs.workingDir`, so a disk-only write leaves
    // this window sending to the old folder until a restart — a wrong folder
    // with no visible cause, which is the exact failure this wave removes.
    useChatStore.getState().setWorkingDir(picked)
    usePrefsStore.getState().setPrefs({ workingDir: picked })
    window.electronAPI.prefsSet('workingDir', picked)
    return 'global'
  }

  if (plan.mode === 'tab') {
    // A draft has no record yet, so the pick really moves this conversation.
    useChatStore.getState().setTabCwd(plan.tabId, picked)
    return 'tab'
  }

  // A recorded Codex conversation runs in the folder written in its rollout;
  // `setTabCwd` alone would only move the window's spawn directory and leave
  // the visible conversation running elsewhere. What the pick can honestly do
  // is start a new conversation over there, so that is what happens — and the
  // toast says both halves: what started, and that the old one did not move.
  //
  // `clearMessages` leaves history alone: the previous transcript is a thread
  // on disk and stays listed. The sentence therefore remains true.
  const home = sessionStore.homeDir
  const previousLabel = recorded ? workingDirLabel(recorded, home) : ''
  chat.clearMessages()
  useChatStore.getState().setTabCwd(plan.tabId, picked)
  if (previousLabel) {
    // `getT`, not a `t` handed in by the caller: the menu listener lives in an
    // effect with no dependencies, so a captured `t` would keep speaking the
    // language the app started in. This reads the locale at click time, which
    // is when the sentence is spoken.
    useUiStore.getState().addToast('info', getT()('sessionFolder.newConversationToast', {
      folder: workingDirLabel(picked, home),
      previous: previousLabel,
    }))
  }
  return 'new_conversation'
}
