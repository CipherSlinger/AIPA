/**
 * The one durable file behind `dept-handbook.ts`.
 *
 * Why a dedicated file instead of a key in `automations.json`: handbook text is
 * large, changes only when the user edits the tree, and is read once per
 * unattended run. Putting it beside the jobs would make every scheduler write
 * (a status update, `nextRunAt`, a run record) rewrite the handbooks too, and a
 * multi-megabyte `automations.json` would then be parsed on every automation
 * event. A sibling file keeps the two write patterns independent, exactly like
 * `automations.json` itself sits outside renderer-owned prefs.
 *
 * The renderer is the only writer (it owns the tree); this module is the only
 * reader. Neither side trusts the other's bytes: the payload is normalized on
 * write and the file is normalized again on read, so a hand-edited file
 * degrades to fewer departments rather than to a rule the user never wrote.
 * Main never edits the snapshot — it has no tree to edit against, and a second
 * writer would eventually disagree with the first.
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import {
  normalizeDeptHandbookEntries,
  normalizeDeptHandbookSnapshot,
  type DeptHandbookSnapshot,
} from './dept-handbook'

const log = createLogger('dept-handbook-store')

const STORE_VERSION = 1

/** A seam for harnesses and tests; the app always uses userData. */
export function getDeptHandbookPath(): string {
  return path.join(app.getPath('userData'), 'department-handbooks.json')
}

/**
 * The snapshot main last received, or `null` when there is none it can read.
 *
 * A missing file and an unreadable one both answer `null`: the run record says
 * "no usable snapshot", which is true of both, and neither is a reason to fail
 * a scheduled run. The difference is logged, because a corrupt file is a
 * defect worth seeing in the log even though the user never should.
 */
export function readDeptHandbookSnapshot(file: string = getDeptHandbookPath()): DeptHandbookSnapshot | null {
  if (!fs.existsSync(file)) return null
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'))
    const snapshot = normalizeDeptHandbookSnapshot(parsed)
    if (!snapshot) {
      log.warn('department-handbooks.json is not a usable snapshot; treating it as absent')
      return null
    }
    return snapshot
  } catch (err) {
    log.warn('Could not read department-handbooks.json:', err)
    return null
  }
}

/**
 * Replace the snapshot with what the renderer just sent.
 *
 * `updatedAt` is main's clock at write time, not the renderer's: it answers
 * "how old is what main has", which is the question the staleness flag asks.
 * A payload that is not an array is refused outright — that is a renderer bug,
 * not a tree with no departments; an *empty* array is a real tree and is
 * stored, so a deleted last department stops contributing rules.
 *
 * Returns a result object rather than throwing, like the rest of the
 * automation surface: a failed sync is not user-facing (the tree is still in
 * the renderer and the next change retries), and it must never take the app
 * down.
 */
export function syncDeptHandbookSnapshot(
  entries: unknown,
  now: number = Date.now(),
  file: string = getDeptHandbookPath(),
): { ok: boolean; error?: string } {
  if (!Array.isArray(entries)) return { ok: false, error: 'entries_invalid' }
  const departments = normalizeDeptHandbookEntries(entries)
  if (!departments) return { ok: false, error: 'entries_invalid' }

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        version: STORE_VERSION,
        updatedAt: now,
        departments,
      }, null, 2),
      'utf-8',
    )
    fs.renameSync(tmp, file)
    return { ok: true }
  } catch (err) {
    log.warn('Could not write department-handbooks.json:', err)
    return { ok: false, error: 'write_failed' }
  }
}
