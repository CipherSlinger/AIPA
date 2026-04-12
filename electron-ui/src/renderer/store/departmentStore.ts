// Department store — manages department (部门) entities, each tied to a working directory (部门办公室)
import { create } from 'zustand'

export interface Department {
  id: string
  name: string
  directory: string  // 部门办公室：工作目录
  color?: string     // Optional accent color for visual distinction
  createdAt: number
}

interface DepartmentState {
  departments: Department[]
  activeDepartmentId: string | null
  addDepartment: (data: Omit<Department, 'id' | 'createdAt'>) => Department
  removeDepartment: (id: string) => void
  updateDepartment: (id: string, updates: Partial<Pick<Department, 'name' | 'directory' | 'color'>>) => void
  setActiveDepartmentId: (id: string | null) => void
  reorderDepartments: (depts: Department[]) => void
}

const STORAGE_KEY = 'aipa:departments'
const ACTIVE_KEY = 'aipa:active-department'

const loadDepartments = (): Department[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  } catch { return [] }
}

const saveDepartments = (depts: Department[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(depts)) } catch {}
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
      const updated = s.departments.filter((d) => d.id !== id)
      saveDepartments(updated)
      const newActive = s.activeDepartmentId === id ? null : s.activeDepartmentId
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
