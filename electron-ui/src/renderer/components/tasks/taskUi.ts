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
      .sort(compareTasksWithinGroup),
  })).filter(group => group.tasks.length > 0)

  if (showArchived) {
    const archived = visible
      .filter(task => task.status === 'archived')
      .sort(compareTasksWithinGroup)
    if (archived.length > 0) groups.push({ id: 'archived', tasks: archived })
  }

  return groups
}

/** Which axis the task list is grouped on. */
export type TaskGroupBy = 'status' | 'due'

export type DueGroupId = 'overdue' | 'today' | 'next7' | 'later' | 'none'

export interface DueGroupedTasks {
  /** The status sections this view keeps: finished and filed work. */
  id: DueGroupId | 'done' | 'archived'
  tasks: TaskRecordData[]
}

/** The due view's section order: urgent first, undated last. */
export const DUE_GROUP_IDS: DueGroupId[] = ['overdue', 'today', 'next7', 'later', 'none']

/**
 * The due bucket a task falls into. Both bounds are stored local days, so the
 * comparison never parses a timestamp: `dueInfo` decides past/today and
 * `addLocalDays` gives the inclusive edge of the coming week.
 *
 * A stored day that does not parse is not a date the user chose, so it joins
 * the undated bucket rather than being called overdue.
 */
export function dueGroupIdForTask(task: TaskRecordData, today: string): DueGroupId {
  if (!task.dueOn) return 'none'
  const info = dueInfo(task.dueOn, today)
  if (!info) return 'none'
  if (info.days < 0) return 'overdue'
  if (info.days === 0) return 'today'
  return task.dueOn <= addLocalDays(today, 7) ? 'next7' : 'later'
}

/**
 * Group the same visible list by due day instead of by status. Search and
 * `showArchived` mean exactly what they mean in `groupTasks`: archived rows
 * stay out unless asked for. Live work fills the deadline buckets; a finished
 * task keeps its own trailing "Done" section rather than sitting in "Overdue"
 * just because its deadline passed — a deadline the user already met must not
 * wear the warning tone. Empty buckets are dropped like empty status groups.
 */
export function groupTasksByDue(
  tasks: TaskRecordData[],
  query: string,
  showArchived: boolean,
  today: string,
): DueGroupedTasks[] {
  const visible = tasks.filter(task => matchesTaskQuery(task, query))
  const live = visible.filter(task => task.status !== 'archived' && task.status !== 'done')
  const groups: DueGroupedTasks[] = DUE_GROUP_IDS.map(id => ({
    id,
    tasks: live
      .filter(task => dueGroupIdForTask(task, today) === id)
      .sort(compareTasksWithinGroup),
  })).filter(group => group.tasks.length > 0)

  const done = visible
    .filter(task => task.status === 'done')
    .sort(compareTasksWithinGroup)
  if (done.length > 0) groups.push({ id: 'done', tasks: done })

  if (showArchived) {
    const archived = visible
      .filter(task => task.status === 'archived')
      .sort(compareTasksWithinGroup)
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

// ── Due days ─────────────────────────────────────────────────────────────
// A due date is a local calendar day (`YYYY-MM-DD`), not an instant. These
// helpers read the local clock for "today" and use UTC only to count whole
// days between two stored days, so DST never turns a date into the wrong day.

export type DueState = 'overdue' | 'today' | 'tomorrow' | 'future'

export interface DueInfo {
  state: DueState
  /** Whole days from today; negative when overdue. */
  days: number
}

/** Today as a local `YYYY-MM-DD` day. Call once per render and pass it down. */
export function todayLocalDay(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Add whole calendar days to a local `YYYY-MM-DD` day.
 *
 * The arithmetic is done on a local `Date` (`new Date(y, m - 1, d + n)`), not
 * by adding `n * 86400000` milliseconds: on a DST transition a local day is 23
 * or 25 hours long, and millisecond arithmetic would land on the neighbouring
 * day. The local constructor normalises month/year rollovers (2026-12-31 + 1
 * is 2027-01-01). An unparseable input is returned unchanged rather than
 * guessed at.
 */
export function addLocalDays(day: string, n: number): string {
  const parsed = parseDueDay(day)
  if (!parsed) return day
  return todayLocalDay(new Date(parsed.year, parsed.month - 1, parsed.day + n))
}

/** Parse a stored day into its calendar components; null when it is not one. */
export function parseDueDay(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }
  return { year, month, day }
}

/**
 * Where a due day sits relative to `today`. Both are stored days, so the
 * difference is counted in UTC to stay a whole number across DST boundaries.
 */
export function dueInfo(dueOn: string, today: string): DueInfo | null {
  const target = parseDueDay(dueOn)
  const base = parseDueDay(today)
  if (!target || !base) return null
  const targetMs = Date.UTC(target.year, target.month - 1, target.day)
  const baseMs = Date.UTC(base.year, base.month - 1, base.day)
  const days = Math.round((targetMs - baseMs) / 86400000)
  const state: DueState = days < 0 ? 'overdue' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'future'
  return { state, days }
}

/** A short, locale-aware day label (`Oct 31` / `10月31日`), never a time. */
export function formatDueDate(dueOn: string, locale: 'en' | 'zh-CN'): string {
  const parsed = parseDueDay(dueOn)
  if (!parsed) return dueOn
  try {
    // Local components keep the rendered day identical to the stored day; a
    // `new Date('YYYY-MM-DD')` would parse as UTC midnight and shift west.
    return new Date(parsed.year, parsed.month - 1, parsed.day)
      .toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  } catch {
    return dueOn
  }
}

/**
 * The list's order inside one status group: dated work first, soonest first,
 * then undated work; ties keep the previous newest-activity order.
 */
export function compareTasksWithinGroup(a: TaskRecordData, b: TaskRecordData): number {
  const aDue = a.dueOn
  const bDue = b.dueOn
  if (aDue && bDue) {
    if (aDue !== bDue) return aDue < bDue ? -1 : 1
    return b.updatedAt - a.updatedAt
  }
  if (aDue) return -1
  if (bDue) return 1
  return b.updatedAt - a.updatedAt
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
 * Split a `status_changed` detail into its transition and the reason main
 * appended, if any.
 *
 * `updateTask` writes `<from> -> <to> | <note>`. The transition is what the
 * history row has always shown; the note is the engine's reason for a status
 * a person did not choose, and must not be painted as a raw ` | ` suffix.
 * Only the first separator is structural: a note is prose and may contain `|`.
 */
export function parseStatusChangeDetail(
  detail: string | undefined,
): { transition: string; reason?: string } | null {
  if (!detail) return null
  const separator = detail.indexOf(' | ')
  if (separator === -1) return { transition: detail }
  const transition = detail.slice(0, separator)
  const reason = detail.slice(separator + ' | '.length).trim()
  return reason ? { transition, reason } : { transition }
}

/**
 * Why a `needs_you` task is waiting on the user, when main recorded a reason.
 *
 * This mirrors `statusNote()` in `src/main/clawd-task-brief.ts` on purpose:
 * main compiles from `src/main` (rootDir) and the renderer is a Vite bundle, so
 * there is no shared source root both can import without restructuring the
 * build. The two functions must stay in step — only the *latest* status change
 * may speak, and only when it landed on `needs_you` with a note. A task that
 * waited, ran again and came back without a reason must not keep showing the
 * old error, because that would explain a state it is no longer in.
 */
export function taskWaitingReason(task: TaskRecordData): string | undefined {
  for (let i = task.history.length - 1; i >= 0; i--) {
    const event = task.history[i]
    if (event.kind !== 'status_changed' || !event.detail) continue
    const separator = event.detail.indexOf(' | ')
    const transition = separator === -1 ? event.detail : event.detail.slice(0, separator)
    if (!transition.endsWith(' -> needs_you')) return undefined
    if (separator === -1) return undefined
    const note = event.detail.slice(separator + ' | '.length).trim()
    return note || undefined
  }
  return undefined
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
