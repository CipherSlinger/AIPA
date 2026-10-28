// Preview, apply and "already chosen" bookkeeping for the company templates.
//
// A brand-new install has an empty org chart, and every department is three
// decisions (name, folder, colour) the user would have to invent from nothing.
// A template answers all of them for an entire company at once: it creates the
// company → department → team folders on disk, registers every node, and hangs
// a set of **ghost positions** on them.
//
// A ghost position is a job title plus its brief and nothing else — no session,
// no model call, no folder of its own. Hiring one (「上岗」) turns the brief into
// that employee's first message. So applying a template is free and reversible;
// you pay for the employees you actually put to work.
//
// The template literals themselves live in ./deptTemplates.data.ts.

import { useDepartmentStore, type Department, type OrgNodeKind, type Position } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { DEPT_COLORS, baseName, dirToSlug, joinPath, normalizePath } from './deptUtils'
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

/** Where template folders land when the user does not pick somewhere else. */
export const PRESET_BASE_DIR_NAME = 'AIPA'

const loc = (v: { en: string; zh: string }, locale: Locale): string => (locale === 'zh-CN' ? v.zh : v.en)

// ── Preview ──────────────────────────────────────────────────────────────────

export interface PreviewNode {
  name: string
  color: string
  kind: OrgNodeKind
  /** The folder is already a node — the tree will keep it and only fill gaps. */
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
 * What applying this template would actually change. Built from the same skip
 * rule `applyTemplate` uses, so the picker can never promise a folder that is
 * already there.
 */
export function previewTemplate(tpl: CompanyTemplate, locale: Locale, baseDir: string): TemplatePreview {
  const owned = ownedIndex()
  const counts = { departments: 0, teams: 0, positions: 0 }

  const build = (node: TemplateNode, parentDir: string, kind: OrgNodeKind): PreviewNode => {
    const name = loc(node.name, locale)
    const dir = joinPath(parentDir, name)
    const exists = owned.has(dirToSlug(dir))
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
      children: childKind ? (node.teams ?? []).map(t => build(t, dir, childKind)) : [],
    }
  }

  const root = build({ name: tpl.name, color: '#6366f1', teams: tpl.departments }, normalizePath(baseDir), 'company')
  return { root, counts }
}

// ── Apply ────────────────────────────────────────────────────────────────────

export interface ApplyTemplateResult {
  /** Department nodes created (the company container itself is not counted). */
  departments: number
  teams: number
  positions: number
  /** Node names whose folder could not be created — never dropped silently. */
  failed: string[]
}

/**
 * Create the company tree on disk and register every node, then hang the ghost
 * positions on it. One `fs:ensureDir` per node, parents before children.
 *
 * Idempotent: a folder that is already a node is reused, its id becoming the
 * parent for any teams still missing underneath it. So re-applying a template
 * fills gaps instead of doubling the company.
 *
 * `fs:ensureDir` is sandboxed to the home directory and the current working
 * directory, so a root outside those fails per-node and is reported rather than
 * throwing the whole batch away.
 */
export async function applyTemplate(
  tpl: CompanyTemplate,
  baseDir: string,
  locale: Locale,
): Promise<ApplyTemplateResult> {
  const base = normalizePath(baseDir)
  const addDepartment = useDepartmentStore.getState().addDepartment
  const owned = ownedIndex()
  const failed: string[] = []
  const result: ApplyTemplateResult = { departments: 0, teams: 0, positions: 0, failed }

  // Depth-first, parent first: a child needs its parent's id for `parentId`, and
  // a parent whose folder failed to create makes its children impossible too.
  const visit = async (node: TemplateNode, parentDir: string, parentId: string | undefined, kind: OrgNodeKind): Promise<void> => {
    const name = loc(node.name, locale)
    const dir = joinPath(parentDir, name)
    const slug = dirToSlug(dir)
    const existing = owned.get(slug)
    let nodeId = existing?.id

    if (!nodeId) {
      try {
        const ensured = await window.electronAPI.fsEnsureDir(dir)
        if (ensured && typeof ensured === 'object' && 'error' in ensured) {
          failed.push(name)
          return
        }
      } catch {
        failed.push(name)
        return
      }
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
        directory: dir,
        color: node.color ?? DEPT_COLORS[result.departments % DEPT_COLORS.length],
        parentId,
        kind,
        positions,
      })
      owned.set(slug, created)
      nodeId = created.id
      if (kind === 'team') result.teams++
      else if (kind === 'department') result.departments++
      result.positions += positions.length
    }

    const childKind = CHILD_KIND[kind]
    if (childKind) {
      for (const child of node.teams ?? []) await visit(child, dir, nodeId, childKind)
    }
  }

  await visit(
    { name: tpl.name, color: '#6366f1', teams: tpl.departments },
    base,
    undefined,
    'company',
  )

  markDeptSetupChosen()
  return result
}

function newPositionId(): string {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Every node's directory, keyed by slug — how a folder is known to be taken. */
function ownedIndex(): Map<string, Department> {
  const owned = new Map<string, Department>()
  for (const dept of useDepartmentStore.getState().departments) {
    const slug = dirToSlug(dept.directory)
    if (!owned.has(slug)) owned.set(slug, dept)
  }
  return owned
}

// ── Adopting folders the user already works in ────────────────────────────────

/** The folders the user has worked in that no department owns yet. */
export function existingDirsPreview(sessions: SessionListItem[], homeDir?: string): Department[] {
  const owned = ownedIndex()
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
 * Turn the folders the user has already worked in into departments — the
 * explicit form of what used to happen silently behind their back. Folders a
 * department already owns are skipped, so opening this twice is a no-op rather
 * than a pile of duplicate departments.
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
