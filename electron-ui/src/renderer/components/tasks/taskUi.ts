// Small, pure helpers for the Tasks surface. Kept out of the components so
// grouping and formatting are testable without mounting React.
import type { TaskRecordData, TaskStatusData, UsageEntryData } from '../../../preload'

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

/**
 * The pet's spend precision: `$0.0042`, `$0.012`, `$1.25`. The same figure the
 * user already reads beside the pet's turn card appears here, so one spend
 * number never has two formats in the same app.
 */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return ''
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

/**
 * Sum what the ledger knows for a task's conversations.
 *
 * `null` means "nothing recorded" — the UI must say unknown, never `$0.00`.
 * `costPartial` marks a priced sum that is only a lower bound because at least
 * one conversation has no recorded usage (or no priced turn). The turn and
 * output sums are over recorded conversations only; they are `null` when no
 * conversation has a row at all, because zero turns is not the same as an
 * unrecorded work history.
 */
export interface TaskSpendSummary {
  costUsd: number | null
  costPartial: boolean
  turns: number | null
  outputTokens: number | null
}

export function summarizeTaskSpend(
  sessionIds: readonly string[],
  entries: ReadonlyMap<string, UsageEntryData>,
): TaskSpendSummary {
  let cost = 0
  let priced = 0
  let unpriced = 0
  let turns = 0
  let outputTokens = 0
  let recorded = 0

  for (const sessionId of sessionIds) {
    const entry = entries.get(sessionId)
    if (!entry) {
      unpriced += 1
      continue
    }
    recorded += 1
    turns += entry.turns
    outputTokens += entry.outputTokens
    if (typeof entry.costUsd === 'number' && Number.isFinite(entry.costUsd)) {
      priced += 1
      cost += entry.costUsd
    } else {
      unpriced += 1
    }
  }

  return {
    costUsd: priced > 0 ? cost : null,
    costPartial: priced > 0 && unpriced > 0,
    turns: recorded > 0 ? turns : null,
    outputTokens: recorded > 0 ? outputTokens : null,
  }
}

/**
 * The task list's compact figure. Only a known priced sum earns a figure; a
 * `≥` prefix says the rest of the task's conversations are unknown, so the row
 * never presents a partial number as the whole bill.
 */
export function taskSpendLabel(
  sessionIds: readonly string[],
  entries: ReadonlyMap<string, UsageEntryData>,
): string | null {
  const summary = summarizeTaskSpend(sessionIds, entries)
  if (summary.costUsd === null) return null
  const value = formatUsd(summary.costUsd)
  if (!value) return null
  return summary.costPartial ? `≥${value}` : value
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

/**
 * Read the detail main writes for `imported_folder`. The prefix is the exact
 * source path (greedy, so a path containing the separator still parses); the
 * suffix is the three counts the history line shows.
 */
export function parseImportedFolderDetail(
  detail: string | undefined,
): { source: string; files: number; skipped: number; truncated: number } | null {
  if (!detail) return null
  const match = /^(.*) \| files=(\d+) skipped=(\d+) truncated=(\d+)$/.exec(detail)
  if (!match) return null
  const files = Number(match[2])
  const skipped = Number(match[3])
  const truncated = Number(match[4])
  if (![files, skipped, truncated].every(Number.isFinite)) return null
  return { source: match[1], files, skipped, truncated }
}

/**
 * Read the provenance key main writes on a task saved from a run.
 *
 * The detail is `automation:<jobId>:<startedAt>`; the last colon separates the
 * two facts. A hand-edited or older detail that does not parse is left to be
 * shown verbatim rather than guessed at.
 */
export function parseAutomationRunDetail(
  detail: string | undefined,
): { jobId: string; startedAt: number } | null {
  if (!detail) return null
  const match = /^automation:(.+):(\d+)$/.exec(detail)
  if (!match) return null
  const startedAt = Number(match[2])
  if (!Number.isFinite(startedAt)) return null
  return { jobId: match[1], startedAt }
}
