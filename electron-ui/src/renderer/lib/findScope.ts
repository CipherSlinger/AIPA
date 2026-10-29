/**
 * Bookkeeping for the find bar's "Include tool output" toggle (wave 71A).
 *
 * Turning the toggle on expands collapsed message bodies and tool details so
 * the text a user is looking for actually exists in the DOM, then the existing
 * walker can find it. That mutates the transcript the user arranged, so the
 * previous collapse state has to be restored when the toggle goes off or the
 * bar closes.
 *
 * This module is the pure half of that bargain: it decides what would mount,
 * whether that is affordable, and which messages must be re-collapsed
 * afterwards. The store mutation and the DOM scan stay in the hook.
 */

/**
 * Roles that carry a collapse state. Mirrors `expandAll()` in the chat store
 * exactly, so this module and the action can never disagree about which rows
 * the toggle touches.
 */
function hasCollapseState(role?: string): boolean {
  return role !== 'permission'
    && role !== 'plan'
    && role !== 'hook_callback'
    && role !== 'elicitation'
}

/** The slice of a message this module needs. */
export interface FindExpandMessage {
  id: string
  role?: string
  collapsed?: boolean
  /** How many tool cards the message renders. */
  toolUseCount?: number
  /** Characters of this message's own text, if its body would mount. */
  textChars?: number
  /** Characters of tool output the cards would render. */
  toolChars?: number
}

/**
 * Upper bound on the number of bodies one toggle may mount at once.
 *
 * A mounted body is either one message body (a markdown parse) or one tool
 * card; measured against this app's cards, that is roughly 1–3 ms each. 200
 * bodies is the point where the expansion stops feeling like a click
 * (≈0.2–0.6 s) and starts looking like a freeze. Past it the toggle refuses
 * and says so, rather than scanning a partial set: a count that silently
 * omits half the conversation is the one answer a find bar must never give.
 */
export const MAX_FIND_EXPAND_BODIES = 200

/**
 * Upper bound on the characters one toggle may bring into the DOM.
 *
 * A body count alone is not a cost: one file-read card can carry a 4000-line
 * file, so 150 cards can mean a hundred times the text of 150 chat replies.
 * Measured against this transcript, 2,000,000 characters (message text plus
 * tool output, taken from string lengths before anything is rendered) is the
 * point where the layout work behind one keystroke stops being a pause and
 * becomes a freeze. Like the body limit, it refuses rather than scan a partial
 * set — the bar must never count half a conversation and call it all of it.
 */
export const MAX_FIND_EXPAND_CHARS = 2_000_000

/** What turning the toggle on would cost: bodies mounted and text rendered. */
export interface FindExpandCost {
  bodies: number
  chars: number
}

/**
 * A refused toggle: which budget was exceeded, by how much, and its limit.
 * Both numbers are measured from the store's strings, so the bar can name the
 * real cost instead of a guess, and the count beside it keeps describing the
 * messages-only set that was actually scanned.
 */
export type ExpandBlock = { reason: 'bodies' | 'chars'; cost: number; limit: number }

/**
 * Measure what turning the toggle on would newly mount.
 *
 * Every tool card is assumed to be collapsed until the toggle forces it open,
 * whether or not its message is collapsed: a collapsed message mounts neither
 * its body nor its cards today, so both are counted once the message expands.
 * A message's own text is counted only when its body is currently collapsed —
 * text already in the DOM costs nothing. Tool output is counted for every
 * card, since a card's own fold state is not visible from here; the figure is
 * therefore an upper bound, which is the safe direction for a refusal.
 */
export function measureExpandCost(messages: readonly FindExpandMessage[]): FindExpandCost {
  let bodies = 0
  let chars = 0
  for (const message of messages) {
    if (message.collapsed && hasCollapseState(message.role)) {
      bodies += 1
      chars += Math.max(0, message.textChars ?? 0)
    }
    bodies += Math.max(0, Math.floor(message.toolUseCount ?? 0))
    chars += Math.max(0, message.toolChars ?? 0)
  }
  return { bodies, chars }
}

/** The ids that are collapsed right now — the state to put back later. */
export function collapsedMessageIds(messages: readonly FindExpandMessage[]): string[] {
  const ids: string[] = []
  for (const message of messages) {
    if (message.collapsed && hasCollapseState(message.role)) ids.push(message.id)
  }
  return ids
}

/**
 * Which messages to collapse again when the toggle ends.
 *
 * Only ids captured in the snapshot are returned. A message that arrived while
 * the toggle was on was never collapsed by the search, so it keeps whatever
 * state it has — including staying expanded mid-stream.
 */
export function messagesToRecollapse(
  snapshot: readonly string[],
  messages: readonly FindExpandMessage[],
): string[] {
  if (snapshot.length === 0) return []
  const live = new Set(messages.map(message => message.id))
  return snapshot.filter(id => live.has(id))
}
