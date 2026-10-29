/**
 * The row shape "Recently deleted" renders, and the pure merge of its four
 * kinds into one newest-first list.
 *
 * Kept out of the section component so the merge and its ordering can be
 * exercised without React, and so the view and the connected wrapper name rows
 * the same way. The four deletes arrive in four different places — a pref
 * record for workflows, a folder for skills, transcript files for
 * conversations, a manifest record for jobs — and this is where they become one
 * list.
 */
import type { TrashedWorkflow } from '../types/app.types'
import type { TrashFilterKind } from './trashFilter'
import type {
  TrashedJobInfoData,
  TrashedSessionInfoData,
  TrashedSkillInfoData,
} from '../../preload'
import { workflowPurgeAt } from './workflowTrash'

/** The kind union is defined once, with the filter, and named here for rows. */
export type TrashKind = TrashFilterKind

export interface TrashRow {
  kind: TrashKind
  id: string
  name: string
  deletedAt: number
  /** When the row leaves for good, shown as a date rather than "30 days ago". */
  purgeAt: number
  /** A trashed skill folder or transcript that is gone from disk cannot be restored. */
  available: boolean
}

/** What a row needs to tell the user, localized by the caller that knows the code. */
export type TrashActionOutcome = { ok: true } | { ok: false; message: string }

/**
 * Merge the four kinds into one newest-first list. Kept pure and exported so
 * the harness can assert the ordering and that an empty holding area yields no
 * rows at all — the section renders nothing in that case, not an empty box.
 *
 * `sessionEntries` and `jobEntries` are last and optional so the two older
 * kinds keep the call shape they had before conversations and jobs joined the
 * list.
 */
export function buildTrashRows(
  skillEntries: TrashedSkillInfoData[],
  workflowEntries: TrashedWorkflow[],
  sessionEntries: TrashedSessionInfoData[] = [],
  jobEntries: TrashedJobInfoData[] = [],
): TrashRow[] {
  const rows: TrashRow[] = [
    ...workflowEntries.map(entry => ({
      kind: 'workflow' as const,
      id: entry.workflow.id,
      name: entry.workflow.name,
      deletedAt: entry.deletedAt,
      purgeAt: workflowPurgeAt(entry),
      available: true,
    })),
    ...skillEntries.map(entry => ({
      kind: 'skill' as const,
      id: entry.id,
      name: entry.name,
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
      available: entry.available,
    })),
    ...sessionEntries.map(entry => ({
      kind: 'session' as const,
      id: entry.id,
      // A conversation's display name is whatever the renderer passed at delete
      // time. When there was none the id is shown — a title is never invented.
      name: entry.title || entry.sessionId,
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
      available: entry.available,
    })),
    ...jobEntries.map(entry => ({
      kind: 'job' as const,
      // Restore and remove act on the trash row, not on the job's own id.
      id: entry.id,
      name: entry.job.name,
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
      // A job is a record in a manifest, not a file: there is nothing on disk
      // that can go missing, so a trashed job is always restorable.
      available: true,
    })),
  ]
  return rows.sort((a, b) => b.deletedAt - a.deletedAt)
}
