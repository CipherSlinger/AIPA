// The org tree reduced to what an unattended run needs, and nothing else.
//
// A scheduled run is assembled in the main process, which cannot read this
// renderer-owned tree. Chat carries the department handbook on every turn; a
// job filed under a department should carry the same standing rules, so the
// renderer sends main a snapshot: each node's id, display name and handbook
// text. Directories, positions, colours and personas never travel — main has
// no use for them here, and every field it does not need is one more thing
// that could go stale or be leaked.
//
// React-free and pure, so the payload can be asserted without a DOM. The
// main-side reader owns validation of an untrusted payload; this module only
// has to avoid inventing values on the way out:
//
//   * a node without a usable id is skipped, because main could never match it
//     to a filed job;
//   * a non-string handbook (a hand-edited payload) becomes `''`, the same
//     "no text" reading the chat path takes, rather than being dropped or
//     stringified;
//   * the display name is the one the interface language shows, so a run
//     record names the department the user sees.

import type { Department } from '../../store'
import { deptDisplayName, type UiLocale } from './deptUtils'

/** One entry as main stores it. Mirrors `DeptHandbookSyncEntryData` in preload. */
export interface DeptHandbookSyncEntry {
  id: string
  name: string
  handbook: string
}

/**
 * Every node, in the tree's own array order.
 *
 * A node with no handbook still travels, with `''`. Omitting it would make
 * main read "this department is not in the snapshot" — a different, and
 * wrong, statement from "this department's handbook is empty".
 */
export function handbookSyncEntries(
  departments: readonly Department[],
  locale: UiLocale,
): DeptHandbookSyncEntry[] {
  if (!Array.isArray(departments)) return []
  const entries: DeptHandbookSyncEntry[] = []
  const seen = new Set<string>()
  for (const node of departments) {
    if (!node || typeof node !== 'object') continue
    if (typeof node.id !== 'string' || !node.id.trim()) continue
    const id = node.id.trim()
    // Last node with an id wins, matching every other index of the tree.
    if (seen.has(id)) {
      const index = entries.findIndex(entry => entry.id === id)
      if (index >= 0) entries[index] = describe(node, id, locale)
      continue
    }
    seen.add(id)
    entries.push(describe(node, id, locale))
  }
  return entries
}

function describe(node: Department, id: string, locale: UiLocale): DeptHandbookSyncEntry {
  const name = deptDisplayName(node, locale)
  return {
    id,
    name: typeof name === 'string' && name.trim() ? name : id,
    handbook: typeof node.handbook === 'string' ? node.handbook : '',
  }
}

/**
 * Identity of a payload. JSON is enough: ids, names and text are strings in a
 * deterministic order, and the key is only compared, never parsed.
 */
export function handbookSyncKey(entries: readonly DeptHandbookSyncEntry[]): string {
  return JSON.stringify(entries)
}
