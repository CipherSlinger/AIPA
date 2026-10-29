// What one line of the archive ledger is, and the small text helpers it shares
// between the panel and the row.
//
// Kept apart from the panel so the row can live in its own file without the
// panel importing it back: the type is the contract between the two.
import type { CSSProperties } from 'react'
import type { Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { displayTitle } from '../../lib/sessionTitle'

export const ELLIPSIS: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export interface ArchiveRecord {
  session: SessionListItem
  /**
   * The resolved live owner — a manual filing's node, or the node whose folder
   * the session ran in. Null when the user's filing points at a deleted node.
   */
  dept: Department | null
  /**
   * A manual filing whose node no longer exists: the node's name at filing
   * time. The row shows this, never the folder-derived node and never a live
   * department it was not filed under.
   */
  removedDeptName: string | null
  /** The top of that node's branch — what the record is grouped under. */
  root: Department | null
  archived: boolean
  /** No human-authored message in the transcript — a run of commands only. */
  commandOnly: boolean
  /**
   * The user filed this conversation by hand. True even when the target node
   * was deleted: the assertion outlived the node, and the row says so.
   */
  handFiled: boolean
}

/** Short, stable handle for an employee — the session id is all they have. */
export function employeeTag(sessionId: string): string {
  return sessionId.replace(/-/g, '').slice(0, 6)
}

export function recordTitle(session: SessionListItem, untitled: string): string {
  return displayTitle(session, untitled)
}
