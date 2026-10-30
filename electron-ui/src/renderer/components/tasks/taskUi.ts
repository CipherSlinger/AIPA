// Small, pure helpers for the Tasks surface. Kept out of the components so
// grouping and formatting are testable without mounting React.
import type { TaskRecordData, TaskStatusData } from '../../../preload'

export interface TaskGroup {
  id: Exclude<TaskStatusData, 'assigned'>
  /** Statuses folded into this group; `assigned` reads as "in progress". */
  statuses: TaskStatusData[]
}

/**
 * The list's order: what needs the user first, then live work, then drafts
 * that have not been dispatched, then finished work. `assigned` is folded into
 * in-progress so a routed-but-not-started task is not a separate empty section.
 */
export const TASK_GROUPS: TaskGroup[] = [
  { id: 'needs_you', statuses: ['needs_you'] },
  { id: 'in_progress', statuses: ['in_progress', 'assigned'] },
  { id: 'ready', statuses: ['ready'] },
  { id: 'inbox', statuses: ['inbox'] },
  { id: 'done', statuses: ['done'] },
]

export function statusLabelKey(status: TaskStatusData): string {
  return `tasks.statusLabel.${status}`
}

/** Group id for a task status; archived is returned as itself when shown. */
export function groupIdForStatus(status: TaskStatusData): TaskStatusData {
  if (status === 'assigned') return 'in_progress'
  return status
}

export function matchesTaskQuery(task: TaskRecordData, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (task.title.toLowerCase().includes(q)) return true
  return task.materials.some(material => material.name.toLowerCase().includes(q))
}

export interface GroupedTasks {
  id: TaskStatusData
  tasks: TaskRecordData[]
}

/**
 * Group a list for display. Archived rows are excluded unless `showArchived`,
 * and appear in their own trailing group. Empty groups are dropped so the
 * sidebar never shows a heading with nothing under it.
 */
export function groupTasks(
  tasks: TaskRecordData[],
  query: string,
  showArchived: boolean,
): GroupedTasks[] {
  const visible = tasks.filter(task => matchesTaskQuery(task, query))
  const groups: GroupedTasks[] = TASK_GROUPS.map(group => ({
    id: group.id,
    tasks: visible
      .filter(task => group.statuses.includes(task.status))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  })).filter(group => group.tasks.length > 0)

  if (showArchived) {
    const archived = visible
      .filter(task => task.status === 'archived')
      .sort((a, b) => b.updatedAt - a.updatedAt)
    if (archived.length > 0) groups.push({ id: 'archived', tasks: archived })
  }

  return groups
}

export function countActive(tasks: TaskRecordData[]): number {
  return tasks.filter(task => task.status !== 'archived').length
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

export function formatTaskTime(at: number, locale: 'en' | 'zh-CN'): string {
  try {
    return new Date(at).toLocaleString(locale, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return new Date(at).toLocaleString()
  }
}

/** Tone colours shared by the row dot, the status pill and the detail header. */
export function statusColor(status: TaskStatusData): string {
  switch (status) {
    case 'needs_you': return 'var(--warning)'
    case 'in_progress':
    case 'assigned': return 'var(--accent)'
    case 'ready': return 'var(--success)'
    case 'done': return 'var(--success)'
    case 'inbox': return 'var(--text-muted)'
    case 'archived': return 'var(--text-subtle)'
  }
}

/** The statuses a user may set from the detail header. Archived is a verb, not a choice. */
export const EDITABLE_STATUSES: TaskStatusData[] = [
  'inbox', 'ready', 'assigned', 'in_progress', 'needs_you', 'done',
]
