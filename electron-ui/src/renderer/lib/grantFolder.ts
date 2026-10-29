// The one way a folder refusal turns into a grant (wave 90C).
//
// Main records a grant only when the user confirms an OS folder dialog
// (`fs:showOpenDialog` -> `registerAllowedRoot`). The renderer cannot add a
// root by asking — it would only be echoing a path it made up — so every
// surface that offers "let AIPA read this folder" opens this same dialog,
// seeded at the folder that was refused. The helper makes no claim of its
// own: a path is readable because the user confirmed it, not because this
// module said so.
//
// `grantOutcome` exists so the git chip and the job dialog word their
// follow-up the same way. A cancelled dialog is not a folder change; the same
// folder means the refusal's cause is gone and the caller may retry the read
// or the save; a different folder is a folder change, which each surface
// applies through its own established path (`applyFolderForView`, the job's
// folder field).

import { sameWorkingDir } from './workingDir'

export type GrantOutcome = 'same_folder' | 'different_folder' | 'cancelled'

/**
 * Open the OS folder dialog, seeded where the refused folder is.
 *
 * The answer is already granted by main when the dialog returns a path;
 * `null` means the user cancelled. Nothing else is written here.
 */
export async function pickFolderToGrant(seed?: string | null): Promise<string | null> {
  return window.electronAPI.fsShowOpenDialog(seed || undefined)
}

/**
 * What the dialog answer means relative to the refused folder.
 *
 * Comparison folds Windows case and separators through `sameWorkingDir`, so a
 * user who confirms `C:\Work\` for `c:\work` gets the same folder, not a
 * folder change. An empty or cancelled answer is `cancelled` — never a path
 * named `''`.
 */
export function grantOutcome(
  seed: string | null | undefined,
  picked: string | null | undefined,
): GrantOutcome {
  if (typeof picked !== 'string' || !picked.trim()) return 'cancelled'
  return sameWorkingDir(seed, picked) ? 'same_folder' : 'different_folder'
}
