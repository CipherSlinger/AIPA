// Preview, apply and "already chosen" bookkeeping for the company templates.
//
// A template answers the org-chart questions in one step: it registers the
// company → department → team nodes and hangs a set of **ghost positions** on
// them. It creates no folders and writes no directory: a department is a
// processor now, and work lives in tasks.
//
// A ghost position is a job title plus its brief and nothing else — no session,
// no model call, no folder of its own. Hiring one (「上岗」) turns the brief into
// a task routed to that node. So applying a template is free and reversible;
// you pay for the work you actually put into motion.
//
// The template literals themselves live in ./deptTemplates.data.ts.

import { useDepartmentStore, type Department, type OrgNodeKind, type Position } from '../../store'
import { newPositionId } from '../../store/departmentStore'
import type { SessionListItem } from '../../types/app.types'
import { DEPT_COLORS, baseName, deptDisplayName, dirToSlug, normalizePath } from './deptUtils'
import { COMPANY_TEMPLATES, type CompanyTemplate, type TemplateNode } from './deptTemplates.data'

export { COMPANY_TEMPLATES }
export type { CompanyTemplate, TemplateNode, TemplatePosition } from './deptTemplates.data'

export type Locale = 'en' | 'zh-CN'

/** The kind of a node's children, derived from what the node itself is. */
const CHILD_KIND: Record<OrgNodeKind, OrgNodeKind | null> = {
  company: 'department',
  department: 'team',
  team: null,
}

const loc = (v: { en: string; zh: string }, locale: Locale): string => (locale === 'zh-CN' ? v.zh : v.en)

/** A node's identity for template idempotency: its sibling-relative name path. */
function nameKey(names: ReadonlyArray<string>): string {
  return names.map(name => name.trim().toLowerCase()).join('\u0000')
}

/**
 * Every existing node's name path, keyed the same way a template node is.
 * Renaming a node deliberately breaks the match: the template then adds its
 * own node instead of silently adopting a renamed one.
 */
function ownedNameIndex(locale: Locale): Map<string, Department> {
  const departments = useDepartmentStore.getState().departments
  const byId = new Map(departments.map(dept => [dept.id, dept]))
  const owned = new Map<string, Department>()
  for (const dept of departments) {
    const names: string[] = []
    const seen = new Set<string>()
    let cursor: Department | undefined = dept
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id)
      names.unshift(deptDisplayName(cursor, locale))
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
    owned.set(nameKey(names), dept)
  }
  return owned
}

// ── Preview ──────────────────────────────────────────────────────────────────

export interface PreviewNode {
  name: string
  color: string
  kind: OrgNodeKind
  /** A node with this name path is already registered — only gaps are filled. */
  exists: boolean
  /** Ghost positions this node would gain. Always 0 for an existing node. */
  positionCount: number
  children: PreviewNode[]
}

export interface TemplatePreview {
  root: PreviewNode
  counts: { departments: number; teams: number; positions: number }
}

/**
 * What applying this template would actually change. Built from the same
 * idempotency rule `applyTemplate` uses, so the picker can never promise a node
 * that is already there.
 */
export function previewTemplate(tpl: CompanyTemplate, locale: Locale): TemplatePreview {
  const owned = ownedNameIndex(locale)
  const counts = { departments: 0, teams: 0, positions: 0 }

  const build = (node: TemplateNode, parentPath: string[], kind: OrgNodeKind): PreviewNode => {
    const name = loc(node.name, locale)
    const path = [...parentPath, name]
    const exists = owned.has(nameKey(path))
    const positionCount = node.positions?.length ?? 0
    if (!exists) {
      if (kind === 'team') counts.teams++
      else if (kind === 'department') counts.departments++
      counts.positions += positionCount
    }
    const childKind = CHILD_KIND[kind]
    return {
      name,
      color: node.color ?? '#6366f1',
      kind,
      exists,
      positionCount: exists ? 0 : positionCount,
      children: childKind ? (node.teams ?? []).map(t => build(t, path, childKind)) : [],
    }
  }

  // The company container is part of the path but is not counted, exactly as
  // `applyTemplate` reports it.
  const root = build({ name: tpl.name, color: '#6366f1', teams: tpl.departments }, [], 'company')
  return { root, counts }
}

// ── Apply ────────────────────────────────────────────────────────────────────

export interface ApplyTemplateResult {
  /** Department nodes created (the company container itself is not counted). */
  departments: number
  teams: number
  positions: number
}

/**
 * Register every node in the template and hang the ghost positions on it.
 *
 * Idempotent by name path: a node that already exists is reused, its id
 * becoming the parent for any teams still missing underneath. So re-applying a
 * template fills gaps instead of doubling the company, and applying it in the
 * other interface language still matches the bilingual `presetName`.
 *
 * No IPC call and no filesystem write happens here. Nothing is sent to a model:
 * positions only cost anything when the user turns one into a task.
 */
export function applyTemplate(tpl: CompanyTemplate, locale: Locale): ApplyTemplateResult {
  const addDepartment = useDepartmentStore.getState().addDepartment
  const owned = ownedNameIndex(locale)
  const result: ApplyTemplateResult = { departments: 0, teams: 0, positions: 0 }

  const visit = (
    node: TemplateNode,
    parentId: string | undefined,
    parentPath: string[],
    kind: OrgNodeKind,
  ): void => {
    const name = loc(node.name, locale)
    const path = [...parentPath, name]
    const key = nameKey(path)
    let nodeId = owned.get(key)?.id

    if (!nodeId) {
      const positions: Position[] = (node.positions ?? []).map(p => ({
        id: newPositionId(),
        title: loc(p.title, locale),
        brief: loc(p.brief, locale),
        // Keep the other language alongside the resolved copy: the node is
        // still the template's, so a later interface-language switch may
        // re-render it. Renaming drops the link (see departmentStore).
        presetTitle: { ...p.title },
        presetBrief: { ...p.brief },
      }))
      const created = addDepartment({
        name,
        presetName: { ...node.name },
        color: node.color ?? DEPT_COLORS[result.departments % DEPT_COLORS.length],
        parentId,
        kind,
        positions,
      })
      owned.set(key, created)
      nodeId = created.id
      if (kind === 'team') result.teams++
      else if (kind === 'department') result.departments++
      result.positions += positions.length
    }

    const childKind = CHILD_KIND[kind]
    if (childKind) {
      for (const child of node.teams ?? []) visit(child, nodeId, path, childKind)
    }
  }

  visit({ name: tpl.name, color: '#6366f1', teams: tpl.departments }, undefined, [], 'company')
  markDeptSetupChosen()
  return result
}

// ── Adopting folders the user already works in ────────────────────────────────
// This is the one remaining legacy path: it registers existing folders as
// departments so their old conversations keep an owner. It creates nothing on
// disk; the folder already exists and is only recorded.

/** Every node's legacy directory, keyed by slug — how a folder is known to be taken. */
function ownedDirIndex(): Map<string, Department> {
  const owned = new Map<string, Department>()
  for (const dept of useDepartmentStore.getState().departments) {
    if (typeof dept.directory !== 'string' || !dept.directory) continue
    const slug = dirToSlug(dept.directory)
    if (!owned.has(slug)) owned.set(slug, dept)
  }
  return owned
}

/** The folders the user has worked in that no department owns yet. */
export function existingDirsPreview(sessions: SessionListItem[], homeDir?: string): Department[] {
  const owned = ownedDirIndex()
  const seen = new Map<string, Department>()
  for (const s of sessions) {
    // A session with a real cwd names its folder exactly; without one, only the
    // decoded `project` exists and a lone basename is not a usable directory.
    const directory = s.cwd ? normalizePath(s.cwd, homeDir) : normalizePath(s.project, homeDir)
    if (!directory || !/[\\/]/.test(directory)) continue
    if (seen.has(directory) || owned.has(dirToSlug(directory))) continue
    seen.set(directory, { id: directory, name: baseName(directory), directory, createdAt: 0 })
  }
  return [...seen.values()]
}

/**
 * Turn the folders the user has already worked in into legacy departments.
 * Folders a department already owns are skipped, so opening this twice is a
 * no-op rather than a pile of duplicate departments.
 */
export function importExistingDirs(sessions: SessionListItem[], homeDir?: string): number {
  const dirs = existingDirsPreview(sessions, homeDir)

  const addDepartment = useDepartmentStore.getState().addDepartment
  let i = 0
  for (const dir of dirs) {
    addDepartment({ name: dir.name, directory: dir.directory, color: DEPT_COLORS[i++ % DEPT_COLORS.length] })
  }
  markDeptSetupChosen()
  return dirs.length
}

// ── "Stop asking me" flag ────────────────────────────────────────────────────
// The empty org chart offers the template picker. Choosing "start blank" leaves
// zero departments, so without a flag the offer would come straight back.
const SETUP_KEY = 'aipa:dept-setup-chosen'

export function hasChosenDeptSetup(): boolean {
  try { return localStorage.getItem(SETUP_KEY) === '1' } catch { return false }
}

export function markDeptSetupChosen(): void {
  try { localStorage.setItem(SETUP_KEY, '1') } catch { /* private mode — just offer again next time */ }
}
