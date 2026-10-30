// "Run in another folder…" — one folder, for one run, without moving anything.
//
// A shell block could only ever run where the global working directory pointed.
// A command that belongs to another checkout had no way to say so, and changing
// the preference to run it once would move every other conversation too. This
// module owns the rules for the per-run folder; `CodeBlock` only renders and
// applies them.
//
//   - The OS folder dialog *is* the grant. Main records a folder only when a
//     human confirms it (`fs:showOpenDialog` -> `registerAllowedRoot`), so this
//     path goes through the same `pickFolderToGrant` helper wave 92B uses. No
//     new channel, no renderer-side registration, no echo of a path the
//     renderer made up.
//   - Cancelled, blank, or no folder back: nothing is said and nothing runs.
//     The panel must stay exactly as it was; changing it would imply a folder
//     change that did not happen.
//   - A pick while a run is already in flight changes nothing. One attempt per
//     block at a time.
//   - An empty command has nothing to run, so the dialog's answer is not acted
//     on.
//   - After a folder is chosen the block's command runs there once. The hook
//     records that folder on the run's state, and the panel says which folder
//     the attempt used — shortened with `~` under home, full path in the title.
//     A failed attempt is described as "attempted", never as "ran".
//   - The global `workingDir` preference is never written on this path, and it
//     is only a fallback seed for the dialog. The run uses the picked folder.
//
// Pure: no React, no IPC, no filesystem.

import { sameWorkingDir, workingDirLabel } from '../../lib/workingDir'
import type { BlockRunState } from './useBlockRun'
import type { RunTranslate } from './runFollowThrough'
import { SHELL_FOLDER_REFUSED_CODE } from './blockRunGrant'

export type BlockRunFolderPlan =
  /** Nothing to do: cancelled, blank, empty command, or a run already in flight. */
  | { kind: 'nothing' }
  /** Grant already recorded by the dialog; run the block's command here once. */
  | { kind: 'run'; folder: string }

export interface RunInFolderInput {
  /** The dialog's answer. `null` is the user cancelling. */
  picked: string | null | undefined
  /** The block's text; never re-read from the composer. */
  command: string
  /** True while this block's command is already running. */
  running: boolean
}

/**
 * What the folder dialog's answer means for this block.
 *
 * Only a confirmed folder and a command worth running produce a run. Every
 * other answer is `nothing`, which the caller applies by not changing state
 * at all.
 */
export function planRunInFolder(input: RunInFolderInput): BlockRunFolderPlan {
  if (input.running) return { kind: 'nothing' }
  const folder = typeof input.picked === 'string' ? input.picked.trim() : ''
  if (!folder) return { kind: 'nothing' }
  if (typeof input.command !== 'string' || !input.command.trim()) return { kind: 'nothing' }
  return { kind: 'run', folder }
}

export interface RunFolderNoteInput {
  /** The folder the run's state recorded for this attempt. */
  attemptFolder: string | null | undefined
  /** The global preference, only to tell an ordinary attempt from a moved one. */
  workingDir: string | null | undefined
  homeDir?: string | null
  status: BlockRunState['status']
  failureCode?: string | null
  t: RunTranslate
}

export interface RunFolderNote {
  /** The quiet sentence; already translated, already shortened. */
  text: string
  /** The full path for the tooltip. */
  title: string
  folder: string
}

/**
 * The sentence naming the folder this attempt used, or `null` when there is
 * nothing worth saying.
 *
 * An ordinary run in the working directory stays quiet — the panel already
 * means that folder, and adding a line to every run would be noise. A run that
 * moved is named even when it moved to the same spelling under a different
 * case, and a folder refusal is named too: that is the folder the grant retry
 * will use, so the offer must point at it rather than at the preference.
 *
 * `failed` never says "ran": a failed attempt never produced a process.
 */
export function runFolderNote(input: RunFolderNoteInput): RunFolderNote | null {
  const folder = typeof input.attemptFolder === 'string' ? input.attemptFolder.trim() : ''
  if (!folder) return null
  if (input.status === 'idle') return null

  const refused = input.status === 'failed' && input.failureCode === SHELL_FOLDER_REFUSED_CODE
  if (!refused && sameWorkingDir(folder, input.workingDir)) return null

  const label = workingDirLabel(folder, input.homeDir) || folder
  const text = input.status === 'failed'
    ? input.t('codeAction.run.folder.notStarted', { folder: label })
    : input.status === 'running'
      ? input.t('codeAction.run.folder.runningIn', { folder: label })
      : input.t('codeAction.run.folder.ranIn', { folder: label })

  return { text, title: folder, folder }
}
