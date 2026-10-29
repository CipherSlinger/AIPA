// The folder a scheduled prompt job runs in.
//
// Main has carried a per-job folder since the automation subsystem was written
// — `action.cwd`, validated against the allowed roots and read by
// `resolveCwd` — but the dialog never set it, so every job silently ran in
// whatever the app-wide working folder happened to be at run time. This module
// is the one place the renderer answers "which folder does this job store, and
// what do we send back":
//
//   - '' means the app-wide folder. It is deliberately never a concrete path:
//     the global preference may change after the job is saved, and a job that
//     never chose must keep following it.
//   - a chosen folder is sent as `action.cwd`, the exact field the scheduler
//     validates and `resolveCwd` reads.
//   - the recent-folder rows come from the chat popover's own builder, so
//     ordering, dedup and the five-row cap cannot drift between the two
//     surfaces.
//
// Pure: no React, no IPC.

import type { AutomationActionData } from '../../../preload'
import type { RecentFolderEntry } from '../../lib/recentFolders'
import { workingDirLabel } from '../../lib/workingDir'
import {
  RECENT_FOLDER_ROW_LIMIT,
  workingDirRecentRows,
  type RecentFolderSessionRow,
} from '../chat/workingDirRecentRows'

/**
 * The "no own folder" value, kept as '' rather than `undefined` so a component
 * state can hold it. It is never sent on the wire: an absent `cwd` is what
 * makes a job follow the app-wide folder.
 */
export const APP_WIDE_JOB_FOLDER = ''

/** The stored folder of a job's action, or '' when it has none. */
export function jobFolderFromAction(action: AutomationActionData | null | undefined): string {
  if (!action || action.kind !== 'prompt') return APP_WIDE_JOB_FOLDER
  return typeof action.cwd === 'string' ? action.cwd.trim() : APP_WIDE_JOB_FOLDER
}

/**
 * The prompt action as the scheduler expects it.
 *
 * A blank folder omits `cwd` instead of sending '' — main treats a falsy value
 * as "no override", but an empty string on the wire would be a field pretending
 * to be a path. Clearing the picker must return the job to the app-wide folder,
 * which only omission does.
 */
export function promptActionWithFolder(prompt: string, folder: string): AutomationActionData {
  const cwd = typeof folder === 'string' ? folder.trim() : ''
  return { kind: 'prompt', prompt, ...(cwd ? { cwd } : {}) }
}

/** A chosen folder as a row label; '' when no folder is chosen. */
export function jobFolderLabel(folder: string, homeDir?: string | null): string {
  return workingDirLabel(folder, homeDir)
}

export interface JobFolderRowsInput {
  /** The sidebar's loaded sessions; an empty list honestly yields no rows. */
  sessions: ReadonlyArray<RecentFolderSessionRow>
  /** The folder already chosen; left out so no row offers a pick that changes nothing. */
  currentFolder?: string | null
  homeDir?: string | null
  limit?: number
}

/**
 * Up to five folders conversations actually ran in, newest first.
 *
 * A delegate, not a second implementation: `workingDirRecentRows` already
 * excludes the current folder, folds Windows case and separators, and caps the
 * popover's list. Re-deriving any of that here is exactly the drift the shared
 * module exists to prevent.
 */
export function jobFolderRows(input: JobFolderRowsInput): RecentFolderEntry[] {
  return workingDirRecentRows({
    sessions: input.sessions ?? [],
    currentDir: input.currentFolder,
    homeDir: input.homeDir,
    limit: input.limit ?? RECENT_FOLDER_ROW_LIMIT,
  })
}

/**
 * The scheduler's refusal for a folder outside the allowed roots.
 *
 * Kept as a predicate so the dialog and any run surface agree on the code
 * without either spelling the raw string at the call site. Saving is the only
 * path that can produce it today; a run refuses at start for other reasons, but
 * the check stays here for the day one of them reuses this code.
 */
export function isFolderRefusedError(code: string | null | undefined): boolean {
  return code === 'cwd_not_allowed'
}
