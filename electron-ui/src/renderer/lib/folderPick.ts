// What a folder pick can honestly change, and the folder a session row may print.
//
// Two doors — the View menu's "Open folder" row and the command palette's
// "Change Working Directory" — used to mean the same wrong thing: they wrote the
// GLOBAL preference only. That was harmless while a conversation had no folder
// of its own, but an opened Codex conversation now carries the folder recorded
// in its rollout, so the write silently changed the default for future
// conversations while the conversation on screen kept running where it was. The
// user picked a folder and nothing they were looking at changed.
//
// `folderChangeTarget` (lib/workingDir.ts) is the rule — a resumed Codex thread
// runs in its rollout's cwd, so a pick can only start a new conversation. This
// module turns that rule into a plan both doors execute identically, and into
// the one answer a list row is allowed to print.
//
// Pure: no React, no IPC, no store reads. The harness drives it directly.

import { folderChangeTarget, normalizeWorkingDir, workingDirLabel } from './workingDir'

/** What a folder pick will do once a folder has been chosen. */
export type FolderPickMode = 'tab' | 'new_conversation' | 'global'

export interface FolderPickPlan {
  mode: FolderPickMode
  /** The tab the pick applies to. Null only for 'global', which has no tab. */
  tabId: string | null
}

/**
 * Read the pick before the dialog opens, so a door can describe what it will do
 * and then behave exactly that way.
 *
 * - no tab: there is no conversation to move. Today's behaviour — the global
 *   default — is the only thing left to write, and it is genuinely useful for
 *   "start here from now on", so nothing extra is said about it.
 * - draft (no recorded folder): the pick really moves this conversation.
 * - recorded Codex conversation: the pick cannot move it. It starts a new
 *   conversation over there, and the caller must say so rather than pretend.
 */
export function planFolderPick(
  activeTabId: string | null | undefined,
  recordedCwd: string | null | undefined,
): FolderPickPlan {
  const tabId = typeof activeTabId === 'string' && activeTabId.trim() ? activeTabId : null
  if (!tabId) return { mode: 'global', tabId: null }
  return folderChangeTarget(recordedCwd) === 'new_conversation'
    ? { mode: 'new_conversation', tabId }
    : { mode: 'tab', tabId }
}

/**
 * The folder a conversation was recorded in, or null when the engine did not
 * say. Claude transcripts and an index that cannot tell answer null; null is
 * not "home" and must not be replaced by one.
 */
export function recordedFolderOf(
  sessions: ReadonlyArray<{ sessionId: string; cwd?: string | null }>,
  sessionId: string | null | undefined,
): string | null {
  if (!sessionId || !Array.isArray(sessions)) return null
  const row = sessions.find(s => s.sessionId === sessionId)
  const cwd = typeof row?.cwd === 'string' ? row.cwd.trim() : ''
  return cwd || null
}

/**
 * The provenance a session row may print: the recorded folder reduced to what
 * fits on one line, or null when there is nothing honest to print or the row
 * already says it.
 *
 * `alreadyShown` is the label the row's own slot is displaying (a project name,
 * a department name). Printing the same folder twice tells the reader nothing
 * and makes them wonder whether the two are different places.
 */
export function sessionFolderProvenance(
  cwd: string | null | undefined,
  homeDir: string | null | undefined,
  alreadyShown?: string | null,
): string | null {
  const dir = typeof cwd === 'string' ? cwd.trim() : ''
  if (!dir) return null
  const label = workingDirLabel(dir, homeDir)
  if (!label) return null
  if (sameFolderLabel(label, alreadyShown)) return null
  return label
}

/**
 * Would a reader take these two labels to name the same folder?
 *
 * They are labels, not paths: `~/projects/aipa` and `aipa` are the same place
 * described with different amounts of path, and the last segment is what the
 * eye compares. Case is ignored because the labels sit in the same list on
 * Windows and macOS, where the two spellings are the same folder; on a
 * case-sensitive volume this can only ever suppress a duplicate reading, never
 * claim two different folders are one — the full path is still in the tooltip.
 */
export function sameFolderLabel(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = typeof a === 'string' ? a.trim() : ''
  const right = typeof b === 'string' ? b.trim() : ''
  if (!left || !right) return false
  if (left === right) return true
  if (normalizeWorkingDir(left) === normalizeWorkingDir(right)) return true
  return lastSegment(left) === lastSegment(right)
}

function lastSegment(label: string): string {
  const parts = label.split(/[\\/]+/).filter(Boolean)
  return (parts[parts.length - 1] ?? '').toLowerCase()
}
