// The rules behind two keyboard paths that reach a place without the mouse:
// Alt+1..9 jumps to a department on the org chart, and Ctrl+Enter in the session
// quick switcher reveals the highlighted conversation's own folder.
//
// The rules, stated once so both paths can only mean one thing:
//
// * Index → department. "The Nth department" means the Nth *card the org chart
//   draws*, in the order it draws them: the departments hanging off each company
//   section, then the ones with no company above them. A slot with no department
//   behind it — past the end of the list, outside 1..9, or not a whole number —
//   changes nothing and says nothing: a number is not a question, so an empty one
//   has no error to report. The list is the chart's own order, not a filtered
//   one; while the department search field has focus the chord is suppressed
//   anyway (the user is typing, below).
// * The folder action never falls back. A conversation that recorded no folder
//   has no folder to reveal, and revealing the app's global working folder
//   instead would be a claim about a folder this conversation never ran in. The
//   only honest answers are the recorded path or nothing at all — so the folder
//   resolver takes exactly one argument and no preference can be handed to it.
// * Typing is any input, textarea, or contenteditable element with focus, and a
//   dialog in front suppresses the shortcut too. The other global shortcuts in
//   `useAppShortcuts` read the same predicate, so a new chord cannot arrive with
//   a weaker guard than the ones already there.
//
// Pure: no React, no DOM, no store reads, no IPC. The harness drives it directly.

/** Alt+1..9 — the highest department slot the chord can name. */
export const MAX_DEPT_QUICK_SLOT = 9

/** The three fields of an org node this module is allowed to look at. */
export interface DeptOrderNode {
  id: string
  parentId?: string | null
  kind?: 'company' | 'department' | 'team' | null
}

function kindOfNode(node: DeptOrderNode): 'company' | 'department' | 'team' {
  // Absent is a department — the same legacy default every other reader applies.
  return node.kind ?? 'department'
}

/**
 * The department cards the org chart draws, in the order it draws them.
 *
 * Mirrors `OrgChart`'s `groups`: one section per company (in list order), each
 * holding that company's children except teams, then a final section for the
 * departments with no company above them. A node the chart does not draw is not
 * in this list either — a team has no card at this level, a company has an HQ of
 * its own instead of a card, and a department whose parent is a department (or a
 * parent that no longer exists) has no section to hang off. Counting those would
 * let Alt+2 open a card the user cannot see.
 */
export function deptQuickSwitchOrder(nodes: readonly DeptOrderNode[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const push = (node: DeptOrderNode) => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    ids.push(node.id)
  }

  for (const company of nodes) {
    if (kindOfNode(company) !== 'company') continue
    for (const child of nodes) {
      if (child.parentId === company.id && kindOfNode(child) !== 'team') push(child)
    }
  }

  for (const node of nodes) {
    if (!node.parentId && kindOfNode(node) === 'department') push(node)
  }

  return ids
}

/**
 * The department behind a quick-switch slot, or null.
 *
 * `slot` is 1-based and read as "the Nth card". Null means the keystroke must do
 * nothing at all — no navigation, no toast, no preventDefault: there is nothing
 * to move to, and nothing to apologise for.
 */
export function deptQuickSwitchTarget(ordered: readonly string[], slot: number): string | null {
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_DEPT_QUICK_SLOT) return null
  const id = ordered[slot - 1]
  return typeof id === 'string' && id ? id : null
}

/** The parts of a keydown this module cares about. A `KeyboardEvent` fits. */
export interface DeptSlotKeyEvent {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

/**
 * The slot a keystroke names, or null when the chord is not ours: Alt with no
 * other modifier, and a digit 1..9. Ctrl/Meta/Shift already belong to other
 * chords in this app (Ctrl+1..8 switches the sidebar tab), so they must not also
 * fire this one.
 */
export function deptSlotForKeyboardEvent(e: DeptSlotKeyEvent): number | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null
  if (e.key.length !== 1 || e.key < '1' || e.key > '9') return null
  return Number(e.key)
}

/** The focused element, reduced to the two fields "is this typing?" needs. */
export interface ShortcutFocus {
  tagName?: string | null
  isContentEditable?: boolean | null
}

/**
 * Is focus in something the user is typing into? Every input counts, matching
 * the guard the app's other global shortcuts already use (the `/` handler in
 * `useAppShortcuts`) — a slider or a checkbox swallows a bare digit the same way
 * a text field does.
 */
export function isTypingFocus(focus: ShortcutFocus | null | undefined): boolean {
  if (!focus) return false
  const tag = typeof focus.tagName === 'string' ? focus.tagName.toUpperCase() : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  return focus.isContentEditable === true
}

export interface ShortcutContext {
  typing: boolean
  modalOpen: boolean
}

/** A chord fires only when the user is neither typing nor working in a dialog. */
export function shortcutBlocked(context: ShortcutContext): boolean {
  return context.typing || context.modalOpen
}

/**
 * The folder the quick switcher may reveal for a conversation: its recorded cwd,
 * or null.
 *
 * There is deliberately no second parameter. A global working folder cannot be
 * passed in, so the fallback cannot be written by accident: a conversation that
 * recorded no folder reveals nothing rather than pointing at the folder the next
 * conversation would start in.
 */
export function quickSwitchFolderOf(cwd: string | null | undefined): string | null {
  const dir = typeof cwd === 'string' ? cwd.trim() : ''
  return dir || null
}

/**
 * Whether the highlighted row may print the reveal hint. One answer for the hint
 * and the keystroke, so a row can never advertise an action its own key refuses.
 */
export function showsFolderRevealHint(cwd: string | null | undefined): boolean {
  return quickSwitchFolderOf(cwd) !== null
}