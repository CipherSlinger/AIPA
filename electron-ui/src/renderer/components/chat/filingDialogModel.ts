// Pure decisions behind the "file this conversation under a department" dialog.
//
// The dialog and the harness share this module so the precedence rules of
// `sessionFiling.ts` are never re-decided inside JSX. Everything here is
// React-free, so a Node harness can exercise it without Electron.

import type { Department } from '../../store/departmentStore'
import type { DeptResolution } from '../departments/sessionFiling'
import { deptDisplayName, type UiLocale } from '../departments/deptUtils'

/** The five states the dialog can describe, one per resolution source. */
export type FilingSummary = 'filedByYou' | 'filedByTask' | 'filedByFolder' | 'removed' | 'unfiled'

export function filingSummary(resolution: DeptResolution): FilingSummary {
  switch (resolution.source) {
    case 'filed':
      return 'filedByYou'
    case 'task':
      return 'filedByTask'
    case 'folder':
      return 'filedByFolder'
    case 'removed':
      return 'removed'
    case 'none':
      return 'unfiled'
  }
}

/**
 * The node to preselect when the dialog opens: whichever live node currently
 * owns the conversation, whether by manual filing or by folder. A remembered
 * filing whose node was deleted has no live node to preselect, and neither has
 * an unfiled conversation — the picker starts empty and asks the user.
 */
export function initialDeptSelection(resolution: DeptResolution): string {
  return resolution.dept?.id ?? ''
}

/** Whether `clearSessionFiling` has an override to remove. */
export function hasManualFiling(resolution: DeptResolution): boolean {
  return resolution.source === 'filed' || resolution.source === 'removed'
}

/**
 * Confirming is meaningful only for a real node in the current tree. An empty
 * org, an empty picker, or a selection whose node was just deleted all fail
 * here, so the button cannot write a filing that names nothing.
 */
export function canFile(
  departments: ReadonlyArray<Pick<Department, 'id'>>,
  selection: string,
): boolean {
  if (!selection) return false
  return departments.some(dept => dept.id === selection)
}

/**
 * The name to print for the current owner. A deleted node's live record is
 * gone, so the only honest name left is the one remembered at filing time; a
 * live node is printed under its current name in the interface language.
 */
export function summaryDeptName(resolution: DeptResolution, locale: UiLocale): string {
  if (resolution.source === 'removed') return resolution.filing.deptName
  return resolution.dept ? deptDisplayName(resolution.dept, locale) : ''
}

/**
 * True when the picked node is exactly the one the folder already points at.
 * Filing it would not move the conversation, but it would pin an explicit
 * override that no longer follows the folder — the dialog says so first.
 */
export function pinsFolderNode(resolution: DeptResolution, selection: string): boolean {
  return resolution.source === 'folder' && resolution.dept.id === selection
}
