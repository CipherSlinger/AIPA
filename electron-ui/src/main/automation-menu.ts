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
 * `MAX_AUTOMATIONS_IN_MENU` and points at Settings, and every row is either a
 * safe "run now" or a disabled row that says why it cannot run.
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
  /** Run this job now. The caller owns the refusal handling. */
  runNow: (id: string) => void
  /** Open Settings on the Automations tab. */
  openSettings: () => void
}

type JobState =
  | 'paused'
  | 'workflow-missing'
  | 'running'
  | 'no-upcoming-run'
  | 'scheduled'

/**
 * How a job's row reads, in menu priority order. A paused job wins even when
 * its workflow is also gone: "paused" is the setting the user last chose, and
 * it explains the missing next run without accusing the workflow. A running
 * job is checked before `nextRunAt` because its run is the fact worth showing.
 */
function jobState(job: AutomationJobView): JobState {
  if (!job.enabled) return 'paused'
  if (job.actionMissing) return 'workflow-missing'
  if (job.running) return 'running'
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
  const state = jobState(job)
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
  const { isZh, openSettings } = options

  const items: MenuItemConstructorOptions[] = []
  if (jobs.length === 0) {
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
