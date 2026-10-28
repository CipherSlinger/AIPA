/**
 * Turn a selected passage into a personal-memory item — the pure half.
 *
 * SelectionToolbar owns the click, the store write and the toast; every
 * decision that does not need React or IPC lives here so the Node harness can
 * exercise it directly: normalisation, the length cap, duplicate detection, the
 * capacity guard and the category/type suggestions.
 *
 * The item shape mirrors useMemoryCrud's addMemory() so a captured passage is
 * stored exactly like a hand-typed memory. `source` is the one field that
 * differs, and only because the type already has it: the message-level
 * "Remember this" has been writing `source: 'chat'` since before this helper.
 */

import { MemoryItem } from '../../types/app.types'
import {
  MAX_CONTENT_LENGTH,
  MAX_MEMORIES,
  suggestCategory,
  suggestMemoryType,
} from './memoryConstants'

export type MemoryCaptureResult =
  | { kind: 'add'; item: MemoryItem }
  // The passage was longer than the cap: `item` is already clipped to the cap.
  // The caller still saves it, but must say it was shortened.
  | { kind: 'too-long'; item: MemoryItem }
  | { kind: 'duplicate' }
  | { kind: 'full' }

/** Collapse runs of whitespace so a wrapped paragraph is stored as one line. */
export function normaliseCaptureText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Decide what a "Remember" click does.
 *
 * Returns null for an empty selection — the toolbar never calls with one, and
 * there is nothing to report if it does.
 */
export function captureMemory(
  text: string,
  memories: readonly MemoryItem[] | null | undefined,
  now: number = Date.now(),
): MemoryCaptureResult | null {
  const normalised = normaliseCaptureText(text)
  if (!normalised) return null

  // `slice` is deliberate: it matches the truncation useMemoryCrud applies on
  // save, so the item can never exceed what the panel is willing to store.
  const clipped = normalised.length > MAX_CONTENT_LENGTH
  // The cut can land on a space; trim it so the stored text never ends in one.
  const content = clipped ? normalised.slice(0, MAX_CONTENT_LENGTH).trimEnd() : normalised

  // Corrupt entries are ignored for both the duplicate and the capacity check,
  // mirroring the filter useMemoryCrud uses for its own list.
  const existing = (Array.isArray(memories) ? memories : []).filter(
    (m): m is MemoryItem =>
      m != null && typeof m === 'object' && typeof m.id === 'string' && typeof m.content === 'string',
  )

  const lower = content.toLowerCase()
  const duplicate = existing.some(m => normaliseCaptureText(m.content).toLowerCase() === lower)
  // A duplicate would cost no slot, so it is answered before the capacity
  // guard: "already in memory" is the more specific truth, and the user can
  // still not create a second copy.
  if (duplicate) return { kind: 'duplicate' }

  if (existing.length >= MAX_MEMORIES) return { kind: 'full' }

  const category = suggestCategory(content) || 'fact'
  // suggestMemoryType returns a value for every input in this build; the
  // fallback keeps a future "no suggestion" contract from storing undefined.
  const memoryType = suggestMemoryType(content) || undefined

  const item: MemoryItem = {
    id: `mem-${now}-${Math.random().toString(36).slice(2, 6)}`,
    content,
    category,
    memoryType,
    createdAt: now,
    updatedAt: now,
    source: 'chat',
  }

  return clipped ? { kind: 'too-long', item } : { kind: 'add', item }
}

/**
 * Undo support: drop one item by id from the *current* list.
 *
 * Matching by id (never by index or content) means memories the user edited or
 * added between the toast and the Undo click are left alone; an item already
 * deleted removes nothing, so the caller can report that honestly.
 */
export function removeMemoryById(
  memories: readonly MemoryItem[] | null | undefined,
  id: string,
): MemoryItem[] {
  if (!Array.isArray(memories)) return []
  return memories.filter(m => m != null && m.id !== id)
}
