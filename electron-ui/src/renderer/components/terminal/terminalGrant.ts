// What a granted folder means for a terminal tab that never started.
//
// A terminal tab is bound to its own folder by design: the shell runs where
// the tab says it runs, and silently relaunching it somewhere else would make
// the address bar a lie. So the decision is kept here as one small pure
// function, apart from the dialog and the store, and every branch is explicit:
//
//   - cancelled        the dialog closed without a folder; nothing changes.
//   - same_folder      the refusal's cause is gone; restart this tab once.
//   - different_folder the tab is still bound to its old folder. Only a tab
//                      that never produced output may be retargeted in place;
//                      one with a history keeps it and a new tab starts over
//                      there instead.
//
// The comparison that produces `same_folder` is `grantOutcome` in
// `lib/grantFolder.ts` — the same case/separator folding the git chip and the
// job dialog use. This module never reads the filesystem or the allowed roots:
// the folder is readable because the user confirmed the dialog, and the next
// attempt is the only proof.

import type { TerminalTab } from '../../store/terminalTabs'

/** The PTY code that means "this folder is outside the folders AIPA may open". */
export const TERMINAL_FOLDER_REFUSED_CODE = 'PTY_CWD_REJECTED'

export type TerminalGrantOutcome = 'same_folder' | 'different_folder' | 'cancelled'

export type TerminalRestartPlan =
  /** Nothing to do: the dialog was cancelled, or this tab is no longer refused. */
  | { kind: 'none' }
  /** The folder is now readable; start this same tab again. */
  | { kind: 'retry' }
  /** Retarget this tab to the picked folder and start it again. */
  | { kind: 'move'; cwd: string }
  /** Leave this tab alone; start another one in the picked folder. */
  | { kind: 'new-tab'; cwd: string }

/**
 * The folder the dialog is seeded at: the one this attempt was refused for,
 * falling back to the tab's cwd for tabs that failed before the field existed.
 */
export function terminalGrantSeed(tab: Pick<TerminalTab, 'cwd' | 'failureCwd'>): string {
  const failedOn = typeof tab.failureCwd === 'string' ? tab.failureCwd.trim() : ''
  return failedOn || tab.cwd || ''
}

/**
 * Only the folder refusal gets a grant. A missing folder, a non-directory, an
 * unavailable shell or an unknown failure have no folder to grant, and a
 * button that opened a dialog they cannot fix would be a dead end of its own.
 */
export function terminalGrantOffer(
  tab: Pick<TerminalTab, 'cwd' | 'failureCode' | 'failureCwd' | 'failure'>,
): boolean {
  if (!tab.failure || tab.failureCode !== TERMINAL_FOLDER_REFUSED_CODE) return false
  return Boolean(terminalGrantSeed(tab).trim())
}

/**
 * The one restart policy. `picked` is the dialog's answer; it is only read for
 * the different-folder branches, because a cancelled dialog never names a
 * folder and a same-folder answer is spelled however the user's OS spells it.
 */
export function planTerminalRestart(
  tab: Pick<TerminalTab, 'hasOutput' | 'failureCode'>,
  outcome: TerminalGrantOutcome,
  picked?: string | null,
): TerminalRestartPlan {
  if (outcome === 'cancelled') return { kind: 'none' }
  if (tab.failureCode !== TERMINAL_FOLDER_REFUSED_CODE) return { kind: 'none' }
  if (outcome === 'same_folder') return { kind: 'retry' }

  const cwd = typeof picked === 'string' ? picked.trim() : ''
  if (!cwd) return { kind: 'none' }
  // A start that failed never ran a shell, so it has nothing to preserve and
  // its own tab can move. Anything else keeps its folder and gets a sibling.
  return tab.hasOutput === true ? { kind: 'new-tab', cwd } : { kind: 'move', cwd }
}
