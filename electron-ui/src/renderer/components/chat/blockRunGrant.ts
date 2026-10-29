// What a refused folder means for a code block that could not start.
//
// `shell:exec` answers `cwd_not_allowed` when the folder a block asked for is
// outside the folders AIPA may read. Every other refusal has a different
// cause — a missing folder, an invalid command, a run id already in use — and
// opening a folder dialog for those would be a dead end of its own, so the
// offer is kept here as one small pure predicate rather than re-spelled at the
// call site.
//
// The button that follows the offer does two things at once, and its label
// says so: "Allow AIPA to read this folder and run". The label is the
// authorization for the second run. AIPA remembers no consent from the first
// attempt or from any other surface — this is a new, explicit press by the
// user, which is also why nothing on this path reads or writes the allowed-root
// registry: only the OS dialog returning a path makes main record a grant.
//
// The dialog's answer is folded through `grantOutcome` in `lib/grantFolder.ts`
// (the same case/separator folding the git chip, the job dialog and the
// terminal use), and then read here as one of three outcomes:
//
//   - allow_and_run      the same folder was confirmed, so the refusal's cause
//                        is gone. Run the same command in the same folder once.
//   - granted_elsewhere  a different folder was confirmed. AIPA may now read
//                        it, but that is not the folder this command needs, so
//                        nothing runs. The block stays where it was.
//   - none               the dialog was cancelled, or no folder came back.
//                        Nothing changes and nothing is said.
//
// Pure: no React, no IPC, no filesystem.

import type { GrantOutcome } from '../../lib/grantFolder'
import type { BlockRunState } from './useBlockRun'

/** The `shell:exec` code that means "this folder is outside the allowed roots". */
export const SHELL_FOLDER_REFUSED_CODE = 'cwd_not_allowed'

/** The folder the grant dialog is seeded at and the run is retried in. */
export interface BlockGrantOffer {
  folder: string
}

/**
 * Only the folder refusal gets a grant, and only when the refusal named the
 * folder it was about. A `cwd_missing` is the folder not being there — a grant
 * cannot create it — and an `invalid_command` / `invalid_run_id` has no folder
 * aspect at all.
 */
export function blockGrantOffer(
  failure: Pick<BlockRunState, 'failureCode' | 'failureCwd'>,
): BlockGrantOffer | null {
  if (failure.failureCode !== SHELL_FOLDER_REFUSED_CODE) return null
  const folder = typeof failure.failureCwd === 'string' ? failure.failureCwd.trim() : ''
  return folder ? { folder } : null
}

export type BlockGrantOutcome = 'allow_and_run' | 'granted_elsewhere' | 'none'

/**
 * The one policy for the dialog answer.
 *
 * `same_folder` is the only answer that makes the button's second half — the
 * run — true. A different folder granted AIPA a folder but not this one, so it
 * is reported without a run; cancelled changes nothing at all.
 */
export function blockGrantOutcome(outcome: GrantOutcome): BlockGrantOutcome {
  if (outcome === 'same_folder') return 'allow_and_run'
  if (outcome === 'different_folder') return 'granted_elsewhere'
  return 'none'
}
