/**
 * Moving a file or a folder into a holding area.
 *
 * The trash lives under userData, which can be on a different drive than the
 * user's home folder; `rename` fails with EXDEV across volumes, so the move
 * falls back to copy+delete. Only the EXDEV case falls back — a permission or
 * "target exists" failure is reported as-is so the caller can name the reason.
 *
 * If the delete half of the fallback fails, the copy is removed again: leaving
 * two visible copies of the same thing would be worse than reporting failure.
 *
 * Shared by the skill and the conversation holding areas; both need the same
 * semantics, including files (a transcript) as well as folders (a skill).
 */
import * as fs from 'fs'

export function movePath(from: string, to: string): void {
  try {
    fs.renameSync(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    fs.cpSync(from, to, { recursive: true })
    try {
      fs.rmSync(from, { recursive: true, force: true })
    } catch (rmErr) {
      try {
        fs.rmSync(to, { recursive: true, force: true })
      } catch { /* best effort: the original is still intact */ }
      throw rmErr
    }
  }
}
