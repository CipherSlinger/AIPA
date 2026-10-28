// Which department a scheduled job is filed under.
//
// The org tree is a renderer-side record (localStorage), and a job stores only
// an id. That leaves exactly three outcomes when a job is read against today's
// tree:
//
//   none  — the job has no department id; the documented legacy state.
//   found — the id resolves to a node in tree order.
//   stale — the id is well-formed but no node has it, because the department was
//           deleted or the job arrived from another machine.
//
// `stale` is deliberately not collapsed into `none`. Showing nothing would read
// as "no department", and silently re-filing it under a surviving node would
// invent a fact. The row and the editor must say the department is gone until
// the user chooses another one or clears the field.
//
// Nothing here reads a job's `action.cwd`: a department is attribution, not the
// folder the job runs in. The tree walk itself lives in `deptUtils`, shared with
// the search overlay's department filter, so the picker and that filter cannot
// disagree about the shape of the org.

import type { Department } from '../../store/departmentStore'
import {
  deptTreeOptionText,
  deptTreeOptions,
  type DeptTreeOption,
  type UiLocale,
} from '../departments/deptUtils'

/** One node a job may be filed under, in tree order. */
export type JobDepartmentOption = DeptTreeOption

/**
 * Every org node in tree order: parents before children, creation order among
 * siblings. A dangling parent is treated as a root and a cycle cannot hide a
 * node, so a half-old payload still offers every department the user can see.
 */
export function buildJobDepartmentOptions(
  departments: ReadonlyArray<Department>,
  locale: UiLocale,
): JobDepartmentOption[] {
  return deptTreeOptions(departments, locale)
}

/** The picker text: the node's own name, indented to its depth. */
export function jobDepartmentOptionText(
  option: Pick<JobDepartmentOption, 'label' | 'depth'>,
): string {
  return deptTreeOptionText(option)
}

export type JobDepartmentResolution =
  | { state: 'none' }
  | { state: 'found'; nodeId: string; label: string; path: string }
  | { state: 'stale'; id: string }

/**
 * The trimmed id a job carries, or '' when it carries none. Non-strings read as
 * absent, matching main's shape rule; the value is never guessed from anything
 * else on the job.
 */
export function jobDepartmentChoice(departmentId: unknown): string {
  return typeof departmentId === 'string' ? departmentId.trim() : ''
}

/**
 * Resolve one stored id against the current tree.
 *
 * A non-empty id that finds no option is `stale` and keeps the id, so the
 * caller can label it and send it back unchanged. No surrounding node is ever
 * substituted — "closest ancestor" or "first department" would be an invented
 * filing.
 */
export function resolveJobDepartment(
  departmentId: unknown,
  options: ReadonlyArray<JobDepartmentOption>,
): JobDepartmentResolution {
  const id = jobDepartmentChoice(departmentId)
  if (!id) return { state: 'none' }
  const option = options.find(o => o.id === id)
  if (!option) return { state: 'stale', id }
  return { state: 'found', nodeId: option.id, label: option.label, path: option.path }
}
