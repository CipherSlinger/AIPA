// Department store — manages the company org tree: company → department → team.
//
// All three levels are the same record shape, because a node's only real
// identity is the **directory it owns**: a session (employee) is joined to a
// node by its working directory and nothing else. A team is therefore just a
// node with its own directory and a parent — no second table, no second join.
import { create } from 'zustand'

export type OrgNodeKind = 'company' | 'department' | 'team'

/** The same text in both interface languages. */
export interface LocalizedText {
  en: string
  zh: string
}

/**
 * A pre-seeded but unstaffed post ("ghost position"). Applying a company
 * template writes these in; hiring one turns its `brief` into the new
 * employee's first message. Until then it costs nothing — no session, no model
 * call, no folder of its own.
 */
export interface Position {
  id: string
  title: string
  brief: string
  /**
   * The template's bilingual title/brief, kept only until the user edits that
   * field. `title`/`brief` stay the resolved copy for every consumer that does
   * not care about language.
   */
  presetTitle?: LocalizedText
  presetBrief?: LocalizedText
  color?: string
  /**
   * The persona this seat is hired as. Absent means "inherit": the hire flow
   * falls back to the department's default persona, then the active persona.
   * The id points into `prefs.personas` — personas stay one store, not copied
   * into every position (editing a persona should update every seat using it).
   */
  personaId?: string
}

export interface Department {
  id: string
  name: string
  /**
   * A template's bilingual name, kept only until the user renames the node.
   * `name` remains the resolved copy so the directory join, exports and every
   * consumer that never looks at language keep working unchanged.
   */
  presetName?: LocalizedText
  directory: string  // 部门办公室：工作目录
  color?: string     // Optional accent color for visual distinction
  createdAt: number
  /** Parent node. Absent = top level (which is where every legacy record sits). */
  parentId?: string
  /** Node role. Absent is read as 'department', so legacy payloads stay valid. */
  kind?: OrgNodeKind
  /** Ghost positions waiting to be filled. Absent/empty = none. */
  positions?: Position[]
  /**
   * Standing brief for the desk ("部门手册"): prepended to the first message of
   * every employee started from this node. Absent/blank = no handbook.
   */
  handbook?: string
  /** Persona new seats in this node inherit when the position names none. */
  defaultPersonaId?: string
}

interface DepartmentState {
  departments: Department[]
  activeDepartmentId: string | null
  addDepartment: (data: Omit<Department, 'id' | 'createdAt'>) => Department
  /** Removes the node and every descendant. Folders on disk are left alone. */
  removeDepartment: (id: string) => void
  updateDepartment: (id: string, updates: Partial<Pick<Department, 'name' | 'directory' | 'color' | 'positions' | 'handbook' | 'defaultPersonaId'>>) => void
  /** Add a ghost position, generating its stable id. */
  addPosition: (deptId: string, position: Omit<Position, 'id'>) => Position | null
  /** Edit a ghost position in place; the id never changes. */
  updatePosition: (deptId: string, positionId: string, updates: Partial<Omit<Position, 'id'>>) => void
  /** Consume one ghost position — a single write, so hiring is atomic. */
  removePosition: (deptId: string, positionId: string) => void
  setActiveDepartmentId: (id: string | null) => void
  reorderDepartments: (depts: Department[]) => void
}

const STORAGE_KEY = 'aipa:departments'
const ACTIVE_KEY = 'aipa:active-department'

/**
 * Read the stored tree. Normalising here (never written back) is what keeps the
 * added fields from needing a migration: every in-memory node gets a `kind` and
 * a parent that actually exists, so no view has to defend against a half-old
 * payload. A dangling `parentId` would otherwise hide a node's card entirely.
 */
const loadDepartments = (): Department[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []
    const nodes = parsed
      .filter((d): d is Department => !!d && typeof d.id === 'string' && typeof d.directory === 'string')
      .map(d => ({
        ...d,
        kind: d.kind ?? 'department',
        // Positions gained `personaId` without changing the payload shape, so
        // there is nothing to migrate: an old position simply has no binding and
        // hires as the department default. The id is repaired here rather than
        // trusted, because an id-less position could not be edited or removed.
        positions: (d.positions ?? [])
          .filter(p => !!p && typeof p.title === 'string')
          .map((p, i) => ({
            ...p,
            id: typeof p.id === 'string' && p.id ? p.id : `pos-legacy-${d.id}-${i}`,
            brief: typeof p.brief === 'string' ? p.brief : '',
          })),
      }))
    const ids = new Set(nodes.map(d => d.id))
    return nodes.map(d => (d.parentId && ids.has(d.parentId) ? d : { ...d, parentId: undefined }))
  } catch { return [] }
}

const saveDepartments = (depts: Department[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(depts)) } catch {}
}

/** Stable, local-only id — positions never sync with anything on disk. */
export function newPositionId(): string {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** `id` plus every node reachable from it through `parentId`. */
export function descendantIds(depts: Department[], id: string): Set<string> {
  const doomed = new Set([id])
  // Repeat until a pass adds nothing — a child may appear before its parent in
  // the array, so one pass is not enough.
  let grew = true
  while (grew) {
    grew = false
    for (const d of depts) {
      if (!doomed.has(d.id) && d.parentId && doomed.has(d.parentId)) {
        doomed.add(d.id)
        grew = true
      }
    }
  }
  return doomed
}

export const useDepartmentStore = create<DepartmentState>((set) => ({
  departments: loadDepartments(),
  activeDepartmentId: (() => {
    try { return localStorage.getItem(ACTIVE_KEY) } catch { return null }
  })(),

  addDepartment: (data) => {
    const dept: Department = {
      ...data,
      id: `dept-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
    }
    set((s) => {
      const updated = [...s.departments, dept]
      saveDepartments(updated)
      return { departments: updated }
    })
    return dept
  },

  removeDepartment: (id) => {
    set((s) => {
      const doomed = descendantIds(s.departments, id)
      const updated = s.departments.filter((d) => !doomed.has(d.id))
      saveDepartments(updated)
      const newActive = s.activeDepartmentId && doomed.has(s.activeDepartmentId) ? null : s.activeDepartmentId
      try {
        if (newActive) localStorage.setItem(ACTIVE_KEY, newActive)
        else localStorage.removeItem(ACTIVE_KEY)
      } catch {}
      return { departments: updated, activeDepartmentId: newActive }
    })
  },

  updateDepartment: (id, updates) => {
    set((s) => {
      const updated = s.departments.map((d) => {
        if (d.id !== id) return d
        const next = { ...d, ...updates }
        // The user's wording wins for good: once they rename a template node,
        // a later language switch must not overwrite it.
        if (updates.name !== undefined) delete next.presetName
        return next
      })
      saveDepartments(updated)
      return { departments: updated }
    })
  },

  addPosition: (deptId, position) => {
    if (!position.title.trim()) return null
    const created: Position = { ...position, title: position.title.trim(), id: newPositionId() }
    set((s) => {
      const updated = s.departments.map((d) => (
        d.id === deptId ? { ...d, positions: [...(d.positions ?? []), created] } : d
      ))
      saveDepartments(updated)
      return { departments: updated }
    })
    return created
  },

  updatePosition: (deptId, positionId, updates) => {
    set((s) => {
      const updated = s.departments.map((d) => (
        d.id === deptId && d.positions?.length
          ? {
            ...d,
            positions: d.positions.map(p => {
              if (p.id !== positionId) return p
              const next = { ...p, ...updates }
              // Editing a field detaches just that field from the template, so
              // a language switch keeps the user's wording for it alone.
              if (updates.title !== undefined && updates.presetTitle === undefined) delete next.presetTitle
              if (updates.brief !== undefined && updates.presetBrief === undefined) delete next.presetBrief
              return next
            }),
          }
          : d
      ))
      saveDepartments(updated)
      return { departments: updated }
    })
  },

  removePosition: (deptId, positionId) => {
    set((s) => {
      const updated = s.departments.map((d) => (
        d.id === deptId && d.positions?.length
          ? { ...d, positions: d.positions.filter(p => p.id !== positionId) }
          : d
      ))
      saveDepartments(updated)
      return { departments: updated }
    })
  },

  setActiveDepartmentId: (id) => {
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id)
      else localStorage.removeItem(ACTIVE_KEY)
    } catch {}
    set({ activeDepartmentId: id })
  },

  reorderDepartments: (depts) => {
    saveDepartments(depts)
    set({ departments: depts })
  },
}))
