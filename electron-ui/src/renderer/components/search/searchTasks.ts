// Tasks as a global-search source.
//
// The task store already holds every task the main process knows about, so
// this module is a pure pass over it: no IPC, no index file, and no per-row
// store read. A task is findable by its title, by any material file name, or
// by the display name of the department it is routed to. Archived tasks are
// deliberately excluded — they left the working list, and the search should
// not resurrect them.
//
// Matching normalises case and whitespace on both sides. Lower-casing plus
// collapsed runs of whitespace keeps "  Q3   REPORT " and "q3 report" the same
// needle while leaving Chinese queries as plain substrings (they have no word
// boundaries to split on).
//
// A deleted department is not a reason to hide the task: the record is still
// the user's work. It stays searchable by title and materials, and the row
// reports it as unassigned rather than guessing a replacement node.

import type { TaskRecordData } from '../../../preload/index'
import type { Department } from '../../store/departmentStore'
import {
  deptDisplayName,
  deptTreePath,
  kindOf,
  type UiLocale,
} from '../departments/deptUtils'
import { subtreeNodeIds } from './searchDeptAttribution'

export interface TaskSearchHit {
  task: TaskRecordData
  /**
   * The first material whose file name matched. Set only when the title did
   * not match, so the highlight lands on the field the row leads with.
   */
  materialName: string | null
  /** The live node the task is routed to, or null when unassigned/deleted. */
  department: Department | null
  /** Display name resolved for the interface language. */
  departmentLabel: string | null
  /** Root → node, for the department chip's tooltip. */
  departmentPath: string | null
  departmentKind: ReturnType<typeof kindOf> | null
}

/** Case- and whitespace-insensitive comparison text. */
export function normalizeTaskSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Every non-archived task that matches `query`, newest work first.
 *
 * The scan is synchronous and bounded by the task list (a few hundred rows at
 * a normal size); it never starts a main-process search. The two-character
 * floor is the same one the overlay applies to conversations, so a one-letter
 * query cannot match nearly every task.
 */
export function deriveTaskHits(
  tasks: ReadonlyArray<TaskRecordData>,
  departments: ReadonlyArray<Department>,
  query: string,
  locale: UiLocale,
): TaskSearchHit[] {
  const needle = normalizeTaskSearchText(query)
  if (needle.length < 2) return []

  const byId = new Map(departments.map(dept => [dept.id, dept]))
  const hits: TaskSearchHit[] = []

  for (const task of tasks) {
    if (!task || task.status === 'archived') continue
    const titleMatched = normalizeTaskSearchText(task.title).includes(needle)
    let materialName: string | null = null
    if (!titleMatched) {
      for (const material of task.materials) {
        if (normalizeTaskSearchText(material.name).includes(needle)) {
          materialName = material.name
          break
        }
      }
    }
    const department = task.departmentId ? byId.get(task.departmentId) ?? null : null
    const departmentLabel = department ? deptDisplayName(department, locale) : null
    const departmentMatched = departmentLabel !== null
      && normalizeTaskSearchText(departmentLabel).includes(needle)
    if (!titleMatched && materialName === null && !departmentMatched) continue

    hits.push({
      task,
      materialName,
      department,
      departmentLabel,
      departmentPath: department ? deptTreePath(department, byId, locale) : null,
      departmentKind: department ? kindOf(department) : null,
    })
  }

  // A stable sort keeps equal timestamps in store order; the overlay draws the
  // list top-down, so "newest first" is what the user reads first.
  return hits.sort((a, b) => b.task.updatedAt - a.task.updatedAt)
}

export interface FilteredTaskHits {
  visible: TaskSearchHit[]
  /** Rows this department filter is keeping out of the current task set. */
  hidden: number
}

/**
 * Apply the overlay's department view to the task rows.
 *
 * A task's `departmentId` is a live node or nothing. A deleted node resolves to
 * `department === null`; it belongs to no live subtree and is hidden and
 * counted exactly like an unassigned task. `null` means no filter.
 */
export function filterTaskHitsByDept(
  hits: ReadonlyArray<TaskSearchHit>,
  departments: ReadonlyArray<Department>,
  rootId: string | null,
): FilteredTaskHits {
  if (!rootId) return { visible: [...hits], hidden: 0 }
  const ids = subtreeNodeIds(departments, rootId)
  if (ids.size === 0) return { visible: [], hidden: hits.length }
  const visible = hits.filter(hit => hit.department !== null && ids.has(hit.department.id))
  return { visible, hidden: hits.length - visible.length }
}
