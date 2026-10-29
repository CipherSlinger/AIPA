/**
 * Pure helpers for the memory-file editor.
 *
 * Kept free of React and IPC so the harness can exercise the exact rules the
 * buttons obey: what makes Save unavailable, and how the size cap is measured.
 * The cap is the UTF-8 byte count of the draft, not its character count — a
 * 100-character CJK note can be several times larger on disk than it looks.
 */

/**
 * Mirror of main's `MAX_MEMORY_FILE_BYTES`. The renderer needs the number
 * before a save to disable the button and say why; the main process still
 * enforces it on the write, so the two are a UI preview, not the boundary.
 */
export const MAX_MEMORY_EDITOR_BYTES = 256 * 1024

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/** Why Save cannot be pressed, or null when it can. */
export type MemorySaveBlockReason = 'saving' | 'unchanged' | 'too_large'

export function memorySaveBlockReason(
  draft: string,
  baseline: string,
  saving: boolean,
): MemorySaveBlockReason | null {
  if (saving) return 'saving'
  if (draft === baseline) return 'unchanged'
  if (utf8ByteLength(draft) > MAX_MEMORY_EDITOR_BYTES) return 'too_large'
  return null
}
