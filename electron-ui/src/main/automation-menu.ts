/**
 * The Automations submenu, shared by the application menu and the tray menu.
 *
 * It lives outside `automation/` because it is presentation, not scheduling:
 * the scheduler owns job state and this module only reads the view it
 * publishes. Labels are inline bilingual (`isZh`) like the rest of the tray
 * menu — the main process cannot reach the renderer's i18n catalogs.
 *
 * Menu rows cannot wrap and native menus do not scroll, so the derivation is
 * deliberately opinionated: names are clipped, a long list stops at
 * `MAX_AUTOMATIONS_IN_MENU` and points at Settings, and every row either starts
 * its job (a scheduled run, or a manual run that bypasses the global pause) or
 * is disabled with the reason it cannot run. A job held by the global pause is
 * never labelled "paused", because its own setting is not what stopped it.
 *
 * No Electron runtime import: only the menu item shape (erased at compile
 * time), so the ordering/label logic can be exercised with plain Node.
 */
import type { MenuItemConstructorOptions } from 'electron'
import type { AutomationJobView } from './automation/types'

/** One past the point where a native menu starts to feel unscrollable. */
export const MAX_AUTOMATIONS_IN_MENU = 12

/**
 * A menu row cannot wrap; this keeps a clipped name plus its status suffix
 * inside a single comfortable row at common menu widths.
 */
const MAX_NAME_CHARS = 36

export interface AutomationMenuOptions {
  isZh: boolean
  /**
   * Clock used for the relative next-run labels. Injectable so the ordering
   * and wording can be checked without depending on the wall clock.
   */
  now?: number
  /**
   * The global pause, taken from `limits.pausedAll` in the same snapshot as
   * the jobs. The per-job `pausedAll` field exists for surfaces that can only
   * list jobs; here one snapshot drives the toggle row and every job row, so
   * the list can never describe two different worlds.
   */
  pausedAll: boolean
  /** Run this job now. The caller owns the refusal handling. */
  runNow: (id: string) => void
  /**
   * Flip the global pause to the opposite of `pausedAll`. Passing no target
   * keeps the menu and its click handler on the same snapshot: the caller
   * closes over the value it used to build the rows.
   */
  onTogglePauseAll: () => void
  /** Open Settings on the Automations tab. */
  openSettings: () => void
}

type JobState =
  | 'paused'
  | 'workflow-missing'
  | 'running'
  | 'held-by-global-pause'
  | 'no-upcoming-run'
  | 'scheduled'

/**
 * How a job's row reads, in menu priority order.
 *
 * 1. A job switched off by the user is "paused" — that is the setting they
 *    last chose, and it explains the missing next run even when the workflow
 *    is also gone.
 * 2. A job whose workflow was deleted is broken, and resuming will not fix
 *    it, so it is still named while the global pause hides everything else.
 * 3. A running job is a live fact. Manual runs are allowed during a pause, so
 *    "running now" outranks the global hold.
 * 4. An enabled job under the global pause is held, not scheduled. Its
 *    `nextRunAt` is frozen across the pause, so showing that countdown would
 *    promise a run the scheduler will not start. This sits before "no
 *    upcoming run" because a dead cron is re-evaluated on resume, while the
 *    pause is the operative reason right now.
 * 5. An enabled job with no next fire is a dead cron.
 * 6. Otherwise the row carries the countdown and starts the job.
 */
function jobState(job: AutomationJobView, pausedAll: boolean): JobState {
  if (!job.enabled) return 'paused'
  if (job.actionMissing) return 'workflow-missing'
  if (job.running) return 'running'
  if (pausedAll) return 'held-by-global-pause'
  if (job.nextRunAt === null) return 'no-upcoming-run'
  return 'scheduled'
}

function clipName(name: string): string {
  const text = name.trim() || '?'
  return text.length > MAX_NAME_CHARS ? `${text.slice(0, MAX_NAME_CHARS - 1)}…` : text
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** Local `MM-DD HH:mm` for occurrences too far out to read as a countdown. */
function formatClock(epochMs: number): string {
  const d = new Date(epochMs)
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * Next-run wording for a menu row. The countdown rounds up, so a run due in
 * 30 seconds never reads "0 minutes" — at that distance the honest word is
 * "soon".
 */
function formatNextRun(nextRunAt: number, isZh: boolean, now: number): string {
  const diffMs = Math.max(0, nextRunAt - now)
  const minutes = Math.ceil(diffMs / 60_000)
  if (minutes <= 1) return isZh ? '即将运行' : 'runs soon'
  if (minutes < 60) return isZh ? `${minutes} 分钟后` : `in ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) {
    if (restMinutes === 0) return isZh ? `${hours} 小时后` : `in ${hours} h`
    return isZh ? `${hours} 小时 ${restMinutes} 分后` : `in ${hours}h ${restMinutes}m`
  }
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  if (days < 7) {
    if (restHours === 0) return isZh ? `${days} 天后` : `in ${days} d`
    return isZh ? `${days} 天 ${restHours} 小时后` : `in ${days}d ${restHours}h`
  }
  // A countdown past a week is harder to read than the clock time itself.
  return formatClock(nextRunAt)
}

/**
 * Enabled jobs first, soonest occurrence first; a dead cron (no next fire)
 * after them; paused jobs last. Ties fall back to the name so the list does
 * not reshuffle between two jobs due in the same minute.
 */
function menuRank(job: AutomationJobView): number {
  if (!job.enabled) return 2
  return job.nextRunAt === null ? 1 : 0
}

function compareJobs(a: AutomationJobView, b: AutomationJobView): number {
  const rank = menuRank(a) - menuRank(b)
  if (rank !== 0) return rank
  if (a.enabled && a.nextRunAt !== null && b.enabled && b.nextRunAt !== null && a.nextRunAt !== b.nextRunAt) {
    return a.nextRunAt - b.nextRunAt
  }
  return a.name.localeCompare(b.name)
}

/**
 * One row per job. Returning `undefined` from click would leave the row
 * enabled but inert, so disabled rows simply carry no click handler.
 */
function jobItem(
  job: AutomationJobView,
  options: AutomationMenuOptions,
  now: number,
): MenuItemConstructorOptions {
  const { isZh, runNow } = options
  const name = clipName(job.name)
  const state = jobState(job, options.pausedAll)
  const status = (en: string, zh: string) => `${name} — ${isZh ? zh : en}`

  switch (state) {
    case 'paused':
      return { label: status('paused', '已暂停'), enabled: false }
    case 'workflow-missing':
      return { label: status('workflow deleted', '工作流已删除'), enabled: false }
    case 'running':
      // The run already owns this job; a second start is refused by the
      // scheduler, so do not even offer it.
      return { label: status('running now', '运行中'), enabled: false }
    case 'held-by-global-pause':
      // The global switch is holding it, not its own `enabled` flag, and the
      // row must not show the frozen countdown. It stays clickable because a
      // manual run bypasses the pause; the note above the list says so.
      return {
        label: status('held by global pause', '全局暂停中'),
        click: () => runNow(job.id),
      }
    case 'no-upcoming-run':
      return { label: status('no upcoming run', '无下次运行'), enabled: false }
    case 'scheduled': {
      const when = formatNextRun(job.nextRunAt as number, isZh, now)
      return {
        label: `${name} — ${when}`,
        click: () => runNow(job.id),
      }
    }
  }
}

/**
 * Build the submenu body (without a trailing separator). Always returns at
 * least one row, because an empty native submenu is indistinguishable from a
 * broken one.
 */
export function buildAutomationsSubmenu(
  jobs: readonly AutomationJobView[],
  options: AutomationMenuOptions,
): MenuItemConstructorOptions[] {
  const now = options.now ?? Date.now()
  const { isZh, pausedAll, onTogglePauseAll, openSettings } = options
  const hasJobs = jobs.length > 0

  const items: MenuItemConstructorOptions[] = []
  // The switch leads the list: while it is on, every enabled row below is
  // held, so the reason belongs above them rather than at the bottom.
  items.push({
    label: pausedAll
      ? (isZh ? '恢复全部定时任务' : 'Resume all automations')
      : (isZh ? '暂停全部定时任务' : 'Pause all automations'),
    enabled: hasJobs,
    // No jobs means nothing to pause; a disabled row with a click handler is
    // still a row Electron will not fire, but omitting it keeps the intent
    // readable.
    ...(hasJobs ? { click: () => onTogglePauseAll() } : {}),
  })
  if (pausedAll && hasJobs) {
    // A paused header alone is not enough: the rows below still carry names,
    // and one of them may be running, so say once why the schedule is quiet
    // and that a click on a held row still starts it.
    items.push({
      label: isZh ? '定时运行已暂停，手动运行不受影响' : 'Scheduled runs paused — Run now still works',
      enabled: false,
    })
  }
  items.push({ type: 'separator' })

  if (!hasJobs) {
    items.push({ label: isZh ? '暂无定时任务' : 'No automations yet', enabled: false })
  } else {
    const sorted = [...jobs].sort(compareJobs)
    for (const job of sorted.slice(0, MAX_AUTOMATIONS_IN_MENU)) {
      items.push(jobItem(job, options, now))
    }
    if (sorted.length > MAX_AUTOMATIONS_IN_MENU) {
      // Native menus do not scroll; the rest live in Settings, one click away.
      items.push({
        label: isZh ? '更多定时任务…' : 'More in Settings…',
        click: openSettings,
      })
    }
  }

  items.push({ type: 'separator' })
  items.push({
    label: isZh ? '管理定时任务…' : 'Manage Automations…',
    click: openSettings,
  })
  return items
}
