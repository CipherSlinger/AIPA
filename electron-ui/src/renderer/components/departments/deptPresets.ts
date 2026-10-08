// Ready-made department structures, one per kind of team.
//
// A brand-new install has an empty org chart and every department is three
// decisions (name, folder, color) the user has to invent from nothing. These
// presets answer all three at once: pick the domain, pick a root folder, and the
// folders are created on disk and the departments are ready to recruit into.
//
// Preset *department names* are not UI copy — once applied they are user data,
// stored in localStorage and renamed freely. So each role carries its name in
// both locales and we freeze whichever one was active at creation, rather than
// letting a later language switch rename the user's own departments.

import { useDepartmentStore, type Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { DEPT_COLORS, baseName, dirToSlug, joinPath, normalizePath } from './deptUtils'

export interface PresetRole {
  en: string
  zh: string
  color: string
}

export interface DeptPreset {
  id: string
  /** i18n key for the domain name shown on the picker card. */
  labelKey: string
  /** i18n key for the one-line description on the picker card. */
  descKey: string
  roles: PresetRole[]
}

export const DEPT_PRESETS: DeptPreset[] = [
  {
    id: 'software',
    labelKey: 'dept.presets.domains.software',
    descKey: 'dept.presets.domains.softwareDesc',
    roles: [
      { en: 'Product', zh: '产品部', color: '#818cf8' },
      { en: 'Engineering', zh: '研发部', color: '#6366f1' },
      { en: 'QA', zh: '测试部', color: '#4ade80' },
      { en: 'DevOps', zh: '运维部', color: '#14b8a6' },
    ],
  },
  {
    id: 'content',
    labelKey: 'dept.presets.domains.content',
    descKey: 'dept.presets.domains.contentDesc',
    roles: [
      { en: 'Editorial', zh: '选题策划部', color: '#fbbf24' },
      { en: 'Writing', zh: '撰稿部', color: '#ec4899' },
      { en: 'Design', zh: '设计部', color: '#a78bfa' },
      { en: 'Publishing', zh: '发行运营部', color: '#f97316' },
    ],
  },
  {
    id: 'marketing',
    labelKey: 'dept.presets.domains.marketing',
    descKey: 'dept.presets.domains.marketingDesc',
    roles: [
      { en: 'Market Research', zh: '市场调研部', color: '#14b8a6' },
      { en: 'Brand', zh: '品牌宣传部', color: '#ec4899' },
      { en: 'Growth', zh: '增长运营部', color: '#4ade80' },
      { en: 'Analytics', zh: '数据分析部', color: '#6366f1' },
    ],
  },
  {
    id: 'research',
    labelKey: 'dept.presets.domains.research',
    descKey: 'dept.presets.domains.researchDesc',
    roles: [
      { en: 'Literature', zh: '文献调研部', color: '#818cf8' },
      { en: 'Data Analysis', zh: '数据分析部', color: '#14b8a6' },
      { en: 'Writing', zh: '论文写作部', color: '#fbbf24' },
      { en: 'Review', zh: '审校部', color: '#f87171' },
    ],
  },
  {
    id: 'ecommerce',
    labelKey: 'dept.presets.domains.ecommerce',
    descKey: 'dept.presets.domains.ecommerceDesc',
    roles: [
      { en: 'Sourcing', zh: '选品部', color: '#fbbf24' },
      { en: 'Store Ops', zh: '店铺运营部', color: '#6366f1' },
      { en: 'Support', zh: '客服部', color: '#4ade80' },
      { en: 'Fulfilment', zh: '仓储物流部', color: '#a78bfa' },
    ],
  },
  {
    id: 'personal',
    labelKey: 'dept.presets.domains.personal',
    descKey: 'dept.presets.domains.personalDesc',
    roles: [
      { en: 'Inbox', zh: '收集部', color: '#818cf8' },
      { en: 'Projects', zh: '项目推进部', color: '#6366f1' },
      { en: 'Knowledge', zh: '知识管理部', color: '#14b8a6' },
      { en: 'Life Admin', zh: '生活事务部', color: '#fbbf24' },
    ],
  },
]

/** Where preset folders land when the user does not pick somewhere else. */
export const PRESET_BASE_DIR_NAME = 'AIPA'

/** Resolve a preset to concrete department names in the given locale. */
export function presetDepartments(preset: DeptPreset, locale: 'en' | 'zh-CN'): Array<{ name: string; color: string }> {
  return preset.roles.map(role => ({
    name: locale === 'zh-CN' ? role.zh : role.en,
    color: role.color,
  }))
}

/**
 * What a preset would actually add under `baseDir` — the roles whose folder is
 * not a department yet. Kept apart from `presetDepartments` so a preview never
 * promises departments that already exist.
 */
export function pendingPresetDepartments(
  preset: DeptPreset,
  locale: 'en' | 'zh-CN',
  baseDir: string,
): Array<{ name: string; color: string }> {
  const owned = ownedSlugs()
  const base = normalizePath(baseDir)
  return presetDepartments(preset, locale)
    .filter(role => !owned.has(dirToSlug(joinPath(base, role.name))))
}

export interface ApplyPresetResult {
  created: number
  /** Roles whose folder could not be created — never dropped silently. */
  failed: string[]
}

/**
 * Create one folder per role under `baseDir` and register the matching
 * departments. `fs:ensureDir` is sandboxed to the home directory and the current
 * working directory, so a base folder outside those fails per-role and is
 * reported rather than throwing away the whole batch.
 */
export async function applyPreset(
  preset: DeptPreset,
  baseDir: string,
  locale: 'en' | 'zh-CN',
): Promise<ApplyPresetResult> {
  const base = normalizePath(baseDir)
  const addDepartment = useDepartmentStore.getState().addDepartment
  // A folder that is already a department is left alone — applying a preset twice
  // should not double the company.
  const owned = ownedSlugs()
  const failed: string[] = []
  let created = 0

  for (const role of presetDepartments(preset, locale)) {
    const directory = joinPath(base, role.name)
    if (owned.has(dirToSlug(directory))) continue
    try {
      const result = await window.electronAPI.fsEnsureDir(directory)
      if (result && typeof result === 'object' && 'error' in result) {
        failed.push(role.name)
        continue
      }
      addDepartment({ name: role.name, directory, color: role.color })
      created++
    } catch {
      failed.push(role.name)
    }
  }

  markDeptSetupChosen()
  return { created, failed }
}

/** Slugs of the folders departments already own — a folder can only be filed once. */
function ownedSlugs(): Set<string> {
  const owned = new Set<string>()
  for (const dept of useDepartmentStore.getState().departments) owned.add(dirToSlug(dept.directory))
  return owned
}

/** The folders the user has worked in that no department owns yet. */
export function existingDirsPreview(sessions: SessionListItem[], homeDir?: string): Department[] {
  const owned = ownedSlugs()
  const seen = new Map<string, Department>()
  for (const s of sessions) {
    if (!s.project) continue
    const directory = normalizePath(s.project, homeDir)
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
