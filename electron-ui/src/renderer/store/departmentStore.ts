// Department store — manages the company org tree: company → department → team.
//
// All three levels are the same record shape, because a node's only real
// identity is the **directory it owns**: a session (employee) is joined to a
// node by its working directory and nothing else. A team is therefore just a
// node with its own directory and a parent — no second table, no second join.
import { create } from 'zustand'

export type OrgNodeKind = 'company' | 'department' | 'team'

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
  color?: string
}

export interface Department {
  id: string
  name: string
  directory: string  // 部门办公室：工作目录
  color?: string     // Optional accent color for visual distinction
  createdAt: number
  /** Parent node. Absent = top level (which is where every legacy record sits). */
  parentId?: string
  /** Node role. Absent is read as 'department', so legacy payloads stay valid. */
  kind?: OrgNodeKind
  /** Ghost positions waiting to be filled. Absent/empty = none. */
  positions?: Position[]
}

interface DepartmentState {
  departments: Department[]
  activeDepartmentId: string | null
  addDepartment: (data: Omit<Department, 'id' | 'createdAt'>) => Department
  /** Removes the node and every descendant. Folders on disk are left alone. */
  removeDepartment: (id: string) => void
  updateDepartment: (id: string, updates: Partial<Pick<Department, 'name' | 'directory' | 'color' | 'positions'>>) => void
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
        positions: (d.positions ?? []).filter(p => !!p && typeof p.id === 'string' && !!p.title),
      }))
    const ids = new Set(nodes.map(d => d.id))
    return nodes.map(d => (d.parentId && ids.has(d.parentId) ? d : { ...d, parentId: undefined }))
  } catch { return [] }
}

const saveDepartments = (depts: Department[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(depts)) } catch {}
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
      const updated = s.departments.map((d) => (d.id === id ? { ...d, ...updates } : d))
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
