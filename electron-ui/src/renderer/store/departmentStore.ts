// Department store — manages the company org tree: company → department → team.
//
// A department is a *processor*, not a folder: a named node that carries a
// handbook, a default persona and open seats, and that tasks are routed to.
// Work lives in a task's directory; a department only attributes it.
//
// `directory` survives as a read-only legacy field. Records created before the
// task migration still own a folder, and archive/search/brief keep resolving
// legacy conversations through it. Nothing new writes one, and no department
// flow creates or moves a folder.
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
   * `name` remains the resolved copy so exports and every consumer that never
   * looks at language keep working unchanged.
   */
  presetName?: LocalizedText
  /**
   * Legacy folder ownership. New departments have no folder; a persisted value
   * is kept exactly as written and read only by the old session join. It is
   * never created, changed or used as a working directory by this migration.
   */
  directory?: string
  color?: string     // Optional accent color for visual distinction
  createdAt: number
  /** Parent node. Absent = top level (which is where every legacy record sits). */
  parentId?: string
  /** Node role. Absent is read as 'department', so legacy payloads stay valid. */
  kind?: OrgNodeKind
  /** Ghost positions waiting to be filled. Absent/empty = none. */
  positions?: Position[]
  /**
   * Standing brief for the desk ("部门手册"): carried by every turn of a
   * conversation that belongs to this node, not just the first one. Absent or
   * blank = no handbook. See `lib/deptHandbook.ts` for the ceiling and for how
   * membership is resolved.
   */
  handbook?: string
  /** Persona new seats in this node inherit when the position names none. */
  defaultPersonaId?: string
}

/**
 * A conversation the user filed under an org node by hand.
 *
 * This is an assertion, not a directory join: it overrides the folder a session
 * ran in, moves nothing on disk, and changes nothing about where the
 * conversation runs. `deptName` is the node's name at filing time, kept so a
 * deleted node can still be named honestly instead of the filing silently
 * falling back to the folder.
 */
export interface SessionFiling {
  deptId: string
  deptName: string
  filedAt: number
}

/** Manual filings by session id. Absent = ownership comes from the folder. */
export type FilingMap = Record<string, SessionFiling>

interface DepartmentState {
  departments: Department[]
  activeDepartmentId: string | null
  addDepartment: (data: Omit<Department, 'id' | 'createdAt'>) => Department
  /** Removes the node and every descendant. Folders on disk are left alone. */
  removeDepartment: (id: string) => void
  updateDepartment: (id: string, updates: Partial<Pick<Department, 'name' | 'color' | 'positions' | 'handbook' | 'defaultPersonaId'>>) => void
  /** Add a ghost position, generating its stable id. */
  addPosition: (deptId: string, position: Omit<Position, 'id'>) => Position | null
  /** Edit a ghost position in place; the id never changes. */
  updatePosition: (deptId: string, positionId: string, updates: Partial<Omit<Position, 'id'>>) => void
  /** Consume one ghost position — a single write, so hiring is atomic. */
  removePosition: (deptId: string, positionId: string) => void
  setActiveDepartmentId: (id: string | null) => void
  reorderDepartments: (depts: Department[]) => void
  /** Manual overrides of the folder join, by session id. */
  filings: FilingMap
  /**
   * File a conversation under a node by hand, overriding its folder. An empty
   * id is ignored rather than written: a filing with no target would be
   * indistinguishable from corruption.
   */
  setSessionFiling: (sessionId: string, deptId: string, deptName: string) => void
  /** Remove the manual override; ownership returns to the folder join. */
  clearSessionFiling: (sessionId: string) => void
}

const STORAGE_KEY = 'aipa:departments'
const ACTIVE_KEY = 'aipa:active-department'
const FILINGS_KEY = 'aipa:session-filings'

/**
 * Normalize the stored filing map. Nothing here is trusted: a hand-edited or
 * half-written payload must not be able to invent a target node or make a
 * session look filed when it is not.
 */
export function parseFilings(raw: unknown): FilingMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: FilingMap = {}
  for (const [sessionId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!sessionId) continue
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const record = value as Record<string, unknown>
    if (typeof record.deptId !== 'string' || !record.deptId) continue
    if (typeof record.deptName !== 'string') continue
    out[sessionId] = {
      deptId: record.deptId,
      deptName: record.deptName,
      filedAt: typeof record.filedAt === 'number' && Number.isFinite(record.filedAt)
        ? record.filedAt
        : 0,
    }
  }
  return out
}

const loadFilings = (): FilingMap => {
  try {
    const saved = localStorage.getItem(FILINGS_KEY)
    if (!saved) return {}
    return parseFilings(JSON.parse(saved))
  } catch { return {} }
}

const saveFilings = (filings: FilingMap) => {
  try { localStorage.setItem(FILINGS_KEY, JSON.stringify(filings)) } catch {}
}

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
      .filter((d): d is Department => !!d && typeof d.id === 'string' && !!d.id)
      .map(d => ({
        ...d,
        // A folder is optional now. Preserve a persisted string untouched (the
        // legacy join reads it); drop anything else rather than let a hand-edited
        // number reach `normalizePath` and throw during a render.
        ...(typeof d.directory === 'string' && d.directory ? {} : { directory: undefined }),
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
  filings: loadFilings(),

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
      // Filings pointing at the removed nodes are deliberately kept: they
      // resolve to "filed under a department that no longer exists", not back
      // to the folder. Deleting a department must not re-file its conversations
      // somewhere the user never chose.
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

  setSessionFiling: (sessionId, deptId, deptName) => {
    const id = sessionId.trim()
    if (!id || !deptId) return
    set((s) => {
      const next: FilingMap = {
        ...s.filings,
        [id]: { deptId, deptName: deptName.trim(), filedAt: Date.now() },
      }
      saveFilings(next)
      return { filings: next }
    })
  },

  clearSessionFiling: (sessionId) => {
    set((s) => {
      if (!(sessionId in s.filings)) return s
      const next = { ...s.filings }
      delete next[sessionId]
      saveFilings(next)
      return { filings: next }
    })
  },
}))
